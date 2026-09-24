/**
 * P0a 解码验证（命令行 spike）。
 *
 * 目的：在写任何 UI 之前，先证明「扩展宿主里能把 B 站 dash 音频解成可听的 WAV」
 * 这条链路成立，并量出耗时与内存。
 *
 * 用法：
 *   node out/spike/decode.js                      # 用默认关键词搜索第一首
 *   node out/spike/decode.js --keyword=久石让
 *   node out/spike/decode.js --bvid=BV1xx411c7mD --page=1
 *   node out/spike/decode.js --out=D:/tmp/a.wav
 *
 * 退出码非 0 表示任一环节失败——这就是 P0a 的门槛。
 */

import { mkdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';

import { BilibiliApi } from '../bilibili/api';
import { BilibiliClient } from '../bilibili/client';
import { AacFrameDecoder } from '../audio/aacDecoder';
import { demuxAudioTrack } from '../audio/demuxer';
import { encodeWav, predictedPcmBytes, ProgressiveWav, readWavDataBytes, type WavFormat } from '../audio/wav';
import { WbiKeyStore } from '../bilibili/wbi';
import { parseDurationText, stripHtmlTags, type NavData } from '../bilibili/types';
import { createConsoleLogger } from '../util/log';

interface Args {
  keyword: string;
  bvid: string | null;
  page: number;
  out: string | null;
  quality: number;
  keepRaw: string | null;
  progressive: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    keyword: '夜的钢琴曲五',
    bvid: null,
    page: 1,
    out: null,
    quality: 30280,
    keepRaw: null,
    progressive: false,
  };
  for (const raw of argv) {
    const [key, value = ''] = raw.replace(/^--/, '').split('=');
    switch (key) {
      case 'keyword':
        args.keyword = value;
        break;
      case 'bvid':
        args.bvid = value;
        break;
      case 'page':
        args.page = Number(value) || 1;
        break;
      case 'out':
        args.out = value;
        break;
      case 'quality':
        args.quality = Number(value) || 30280;
        break;
      case 'keep-raw':
        args.keepRaw = value;
        break;
      case 'progressive':
        args.progressive = true;
        break;
      default:
        break;
    }
  }
  return args;
}

/** 统计 PCM 的峰值与静音比例，用来证明「不是一段噪音/静音」。 */
function analyzePcm(pcm: Buffer): { peak: number; nonSilentRatio: number; rms: number } {
  let peak = 0;
  let nonSilent = 0;
  let sumSquares = 0;
  const samples = Math.floor(pcm.byteLength / 2);
  for (let index = 0; index < samples; index++) {
    const value = pcm.readInt16LE(index * 2);
    const absolute = Math.abs(value);
    if (absolute > peak) peak = absolute;
    if (absolute > 64) nonSilent++;
    sumSquares += value * value;
  }
  return {
    peak,
    nonSilentRatio: samples === 0 ? 0 : nonSilent / samples,
    rms: samples === 0 ? 0 : Math.sqrt(sumSquares / samples),
  };
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const logger = createConsoleLogger('debug', 'spike');
  const client = new BilibiliClient({ readCookies: () => null, logger });
  const wbi = new WbiKeyStore({
    logger,
    load: async () => {
      const nav = await client.get<NavData>({
        endpoint: '/x/web-interface/nav',
        allowCodes: [-101],
      });
      return { imgUrl: nav.wbi_img.img_url, subUrl: nav.wbi_img.sub_url };
    },
  });
  const api = new BilibiliApi(client, wbi, logger);

  // ---- 1. 定位一个真实视频 -------------------------------------------------
  let bvid = args.bvid;
  let title = '';
  let author = '';
  let durationText: string | undefined;

  if (bvid === null) {
    const search = await api.searchVideos({ keyword: args.keyword, page: 1 });
    const first = search.items[0];
    if (!first?.bvid) throw new Error(`搜索「${args.keyword}」没有结果`);
    bvid = first.bvid;
    title = stripHtmlTags(first.title);
    author = first.author ?? '';
    durationText = first.duration;
    logger.info(`搜索命中：${title} — ${author}（${bvid}）`);
  }

  const pages = await api.getPageList(bvid);
  const page = pages.find((item) => item.page === args.page) ?? pages[0];
  if (!page) throw new Error('没有可用的分 P');
  const durationSeconds = page.duration || parseDurationText(durationText) || 0;
  logger.info(`分 P：P${page.page}「${page.part}」cid=${page.cid} 时长=${durationSeconds}s`);

  // ---- 2. 取音频流 ---------------------------------------------------------
  const stream = await api.getAudioStream({ bvid, cid: page.cid, quality: args.quality });
  logger.info('音频流', {
    container: stream.container,
    quality: stream.quality,
    codecs: stream.codecs,
    mimeType: stream.mimeType,
    durationSeconds: stream.durationSeconds,
  });

  // ---- 3. 取字节（带 Referer，CDN 不带就 403） ------------------------------
  const fetchStart = performance.now();
  const response = await client.fetchRaw({ url: stream.url });
  if (!response.ok) throw new Error(`取音频字节失败：HTTP ${response.status} ${response.statusText}`);
  const contentType = response.headers.get('content-type');
  const contentLength = response.headers.get('content-length');
  const bytes = new Uint8Array(await response.arrayBuffer());
  const fetchMs = performance.now() - fetchStart;
  logger.info(`音频字节：${mb(bytes.byteLength)}（HTTP content-type=${contentType} length=${contentLength}）`, {
    fetchMs: Math.round(fetchMs),
  });

  if (args.keepRaw !== null) {
    await mkdir(dirname(args.keepRaw), { recursive: true });
    await writeFile(args.keepRaw, bytes);
    logger.info(`原始音频已保存：${args.keepRaw}`);
  }

  // ---- 4. 解封装 -----------------------------------------------------------
  const demuxStart = performance.now();
  const demuxed = demuxAudioTrack(bytes, { onWarn: (message) => logger.warn(message) });
  const demuxMs = performance.now() - demuxStart;
  logger.info('解封装结果', {
    trackId: demuxed.info.trackId,
    codec: demuxed.info.codec,
    sampleRate: demuxed.info.sampleRate,
    channels: demuxed.info.channelCount,
    frames: demuxed.frames.length,
    ascBytes: demuxed.info.audioSpecificConfig?.byteLength ?? 0,
    fileDurationSeconds: demuxed.info.durationSeconds,
    demuxMs: Math.round(demuxMs),
  });

  const asc = demuxed.info.audioSpecificConfig;
  if (asc === null) throw new Error('没有取到 AudioSpecificConfig，无法解裸 AAC 帧');
  const codec = (demuxed.info.codec || '').toLowerCase();
  if (!codec.startsWith('mp4a')) {
    throw new Error(`本 spike 只处理 AAC（mp4a），实际是 ${demuxed.info.codec}`);
  }

  // ---- 5. 解码 -------------------------------------------------------------
  const decodeStart = performance.now();
  const decoder = new AacFrameDecoder({
    audioSpecificConfig: asc,
    onWarn: (message) => logger.warn(message),
  });
  await decoder.ready();
  const parts: Buffer[] = [];
  let firstChunkMs = -1;
  const summary = await decoder.decode(demuxed.frames, (chunk) => {
    if (firstChunkMs < 0) firstChunkMs = performance.now() - decodeStart;
    parts.push(chunk.pcm);
  });
  decoder.free();
  const decodeMs = performance.now() - decodeStart;
  const pcm = Buffer.concat(parts);
  logger.info('解码结果', { ...summary, decodeMs: Math.round(decodeMs), firstChunkMs: Math.round(firstChunkMs) });

  // ---- 6. WAV --------------------------------------------------------------
  const format: WavFormat = {
    sampleRate: summary.sampleRate,
    channels: summary.channels,
    bitsPerSample: 16,
  };
  const decodedSeconds = summary.sampleRate === 0 ? 0 : summary.frames / summary.sampleRate;
  const analysis = analyzePcm(pcm);

  // 预测长度优先用 mp4box 从分片表算出的 samples_duration，其次用接口时长。
  const predictedSeconds = demuxed.info.durationSeconds ?? durationSeconds;
  const predictedBytes = predictedPcmBytes(predictedSeconds, format);
  let wav = encodeWav(pcm, format);
  let paddingBytes = 0;
  let predictionNote = '未启用（按实际解码长度写头）';

  if (args.progressive) {
    // 模拟真实推流：先发按预测长度写死的头，再逐块推 PCM，最后补静音对齐。
    const writer = new ProgressiveWav(format, predictedBytes);
    const pieces: Buffer[] = [writer.header()];
    for (const part of parts) {
      const accepted = writer.accept(part);
      if (accepted.byteLength > 0) pieces.push(accepted);
    }
    const padding = writer.finish();
    paddingBytes = padding.byteLength;
    if (padding.byteLength > 0) pieces.push(padding);
    wav = Buffer.concat(pieces);
    predictionNote = `预测 ${predictedBytes} 字节（${predictedSeconds.toFixed(3)}s）vs 实际 ${pcm.byteLength} 字节（${decodedSeconds.toFixed(3)}s），补齐静音 ${paddingBytes} 字节`;
  }

  const outPath = args.out ?? join(tmpdir(), 'vscode-music-player-spike', `${bvid}-${page.cid}.wav`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, wav);
  const fileStat = await stat(outPath);

  // ---- 7. 门槛判定 ---------------------------------------------------------
  const pcmBytes = pcm.byteLength;
  const realtime = decodeMs === 0 ? 0 : (decodedSeconds * 1000) / decodeMs;
  const checks = [
    { name: '解封装取到音轨与帧', pass: demuxed.frames.length > 0 && asc.byteLength > 0 },
    { name: 'PCM 非静音（峰值 > 1000）', pass: analysis.peak > 1000 },
    { name: '声道数与采样率有效', pass: summary.channels >= 1 && summary.sampleRate > 8000 },
    {
      name: '解码时长与接口时长接近（±2s 或 ±2%）',
      pass:
        durationSeconds === 0 ||
        Math.abs(decodedSeconds - durationSeconds) <= Math.max(2, durationSeconds * 0.02),
    },
    { name: '4 分钟歌解码耗时可接受（< 8s）', pass: decodeMs < 8000 },
    { name: 'WAV 文件已写出且尺寸一致', pass: fileStat.size === wav.byteLength && pcmBytes > 0 },
  ];
  if (args.progressive) {
    const declared = readWavDataBytes(wav);
    checks.push(
      {
        name: '预测长度自洽（头部声明的 data 长度 = 预测值）',
        pass: declared === predictedBytes,
      },
      {
        name: '预测长度 WAV 总长自洽（44 + 预测值）',
        pass: wav.byteLength === 44 + predictedBytes,
      },
      {
        name: '预测误差在 2% 内（否则会出现可感知的静音/截断）',
        pass:
          pcmBytes === 0 ||
          Math.abs(predictedBytes - pcmBytes) / pcmBytes <= 0.02,
      },
    );
  }

  console.log('\n================ P0a 结果 ================');
  console.log(`视频      : ${bvid} / cid ${page.cid} P${page.page}`);
  console.log(`时长      : 接口 ${durationSeconds}s / 文件 ${(demuxed.info.durationSeconds ?? 0).toFixed(3)}s / 解码 ${decodedSeconds.toFixed(3)}s`);
  console.log(`格式      : ${summary.sampleRate}Hz ${summary.channels}ch 16bit`);
  console.log(`体积      : 音频 ${mb(bytes.byteLength)} → PCM ${mb(pcmBytes)} → WAV ${mb(wav.byteLength)}`);
  console.log(`耗时      : 下载 ${Math.round(fetchMs)}ms / 解封装 ${Math.round(demuxMs)}ms / 解码 ${Math.round(decodeMs)}ms`);
  console.log(`首个 PCM  : ${Math.round(firstChunkMs)}ms（边解码边推流的起播延迟参考值）`);
  console.log(`解码速度  : ${realtime.toFixed(1)}x 实时`);
  console.log(`预测长度  : ${predictionNote}`);
  console.log(`波形      : 峰值 ${analysis.peak} / RMS ${Math.round(analysis.rms)} / 非静音比例 ${(analysis.nonSilentRatio * 100).toFixed(1)}%`);
  console.log(`内存      : rss ${mb(process.memoryUsage().rss)} / heap ${mb(process.memoryUsage().heapUsed)}`);
  console.log(`输出      : ${outPath}`);
  console.log('------------------------------------------');
  for (const check of checks) console.log(`${check.pass ? '✅' : '❌'} ${check.name}`);

  if (checks.some((check) => !check.pass)) {
    process.exitCode = 1;
    console.log('P0a 未通过：请根据上面失败项调整（换解码器 / 换解封装方式 / 调整预测长度策略）');
  } else {
    console.log('P0a 通过：解封装 → AAC 解码 → WAV 链路成立');
  }
}

main().catch((error: unknown) => {
  console.error('\nP0a 失败：', error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
