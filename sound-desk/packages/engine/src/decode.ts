/**
 * Decoding audio for analysis, peaks and fingerprints.
 *
 * Two paths, and the split matters:
 *
 *  - **RIFF (WAV/BWF/RF64)** is decoded by our own `@sounddesk/audio-wav` reader. It
 *    is exact, has no external dependency, and preserves the chunk structure we also
 *    *write* to. Going through ffmpeg for a WAV would work but would add a process
 *    spawn to the common case and lose nothing.
 *  - **Everything else** (FLAC, MP3, AIFF, OGG, M4A…) needs ffmpeg. Without it those
 *    files are indexed by name only: searchable, but with no waveform, no DSP
 *    features and no audio fingerprint.
 *
 * The decoder is therefore *optional* in a real sense: the engine has to be usable
 * with no ffmpeg present, and must say clearly what is unavailable rather than
 * silently producing empty peaks. `decodeAudio` returns that decision as data.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';

import { decodeWav, type DecodedAudio } from '@sounddesk/audio-wav';

export interface DecodedSamples {
  /** de-interleaved, one entry per channel */
  channelData: Float32Array[];
  sampleRate: number;
  /** how the audio was obtained, so callers can report it */
  via: 'riff' | 'ffmpeg';
}

export interface DecodeFailure {
  ok: false;
  /** a message a person can act on */
  reason: string;
  /** true when installing ffmpeg would fix it */
  needsFfmpeg: boolean;
}

export type DecodeResult = ({ ok: true } & DecodedSamples) | DecodeFailure;

/** Sample rate everything downstream assumes. ffmpeg resamples to it on the way out. */
export const ANALYSIS_SAMPLE_RATE = 48000;

/** Containers our own reader understands. */
const RIFF_EXTENSIONS = new Set(['.wav', '.wave', '.bwf', '.rf64', '.w64']);

export function isRiffPath(filePath: string): boolean {
  const dot = filePath.lastIndexOf('.');
  return dot >= 0 && RIFF_EXTENSIONS.has(filePath.slice(dot).toLowerCase());
}

// ---------------------------------------------------------------------------
// ffmpeg discovery
// ---------------------------------------------------------------------------

export interface FfmpegInfo {
  path: string;
  /** where it came from, so the UI can explain how to change it */
  source: 'env' | 'path' | 'bundled';
  version: string | null;
}

let cached: FfmpegInfo | null | undefined;

/**
 * Locate an ffmpeg binary.
 *
 * Order: an explicit `SOUNDDESK_FFMPEG` override, then the system PATH, then the
 * bundled `ffmpeg-static`. The bundled copy is checked last because a system build
 * is usually newer and always what the user deliberately installed.
 *
 * Resolved once and cached: a failed lookup is not worth repeating on every file in
 * a 100k scan, and a successful one never changes while the process lives.
 */
export async function findFfmpeg(env = process.env): Promise<FfmpegInfo | null> {
  if (cached !== undefined) return cached;

  const explicit = env.SOUNDDESK_FFMPEG;
  if (explicit && existsSync(explicit)) {
    cached = { path: explicit, source: 'env', version: await probeVersion(explicit) };
    return cached;
  }

  const onPath = await whichFfmpeg(env);
  if (onPath) {
    cached = { path: onPath, source: 'path', version: await probeVersion(onPath) };
    return cached;
  }

  const bundled = await bundledFfmpegPath();
  if (bundled && existsSync(bundled)) {
    cached = { path: bundled, source: 'bundled', version: await probeVersion(bundled) };
    return cached;
  }

  cached = null;
  return null;
}

/** Test hook: forget the cached lookup. */
export function resetFfmpegCache(): void {
  cached = undefined;
}

async function whichFfmpeg(env: NodeJS.ProcessEnv): Promise<string | null> {
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const dirs = (env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':').filter(Boolean);
  for (const dir of dirs) {
    const candidate = `${dir}${dir.endsWith('/') || dir.endsWith('\\') ? '' : process.platform === 'win32' ? '\\' : '/'}${exe}`;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * The `ffmpeg-static` path, if that package is installed.
 *
 * Imported dynamically and tolerated missing: it is an optional dependency, and the
 * engine must start without it. The specifier is built at runtime so a bundler does
 * not try to resolve it statically and fail the build for users who skipped it.
 */
async function bundledFfmpegPath(): Promise<string | null> {
  const specifier = 'ffmpeg-static';
  try {
    const mod: unknown = await import(specifier);
    const value = (mod as { default?: unknown }).default ?? mod;
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function probeVersion(binary: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(binary, ['-version'], { timeout: 10_000, windowsHide: true }, (err, stdout) => {
      if (err) {
        resolve(null);
        return;
      }
      const first = stdout.split('\n')[0] ?? '';
      // "ffmpeg version 6.1.1-essentials_build-… Copyright …"
      const match = /ffmpeg version (\S+)/.exec(first);
      resolve(match ? match[1]! : first.trim() || null);
    });
  });
}

// ---------------------------------------------------------------------------
// decoding
// ---------------------------------------------------------------------------

export interface DecodeOptions {
  /** force mono (what the embedder and the peak builder want) */
  mono?: boolean;
  /** target sample rate; ffmpeg resamples, the RIFF reader reports its own */
  sampleRate?: number;
  /** decode at most this many seconds from the start */
  maxSeconds?: number;
  /** explicit binary, otherwise discovery runs */
  ffmpegPath?: string;
}

/**
 * Decode a file to float samples.
 *
 * Never throws for an expected failure: a missing ffmpeg, an unreadable file and an
 * unsupported codec are all normal conditions during a library scan, and each has a
 * different remedy. They come back as a `DecodeFailure` with `needsFfmpeg` set.
 */
export async function decodeAudio(filePath: string, options: DecodeOptions = {}): Promise<DecodeResult> {
  if (isRiffPath(filePath)) {
    try {
      const decoded = await decodeWav(filePath, options.mono ? { mono: true } : {});
      const samples: DecodedSamples = {
        channelData: decoded.data,
        sampleRate: decoded.sampleRate,
        via: 'riff',
      };
      return { ok: true, ...(trim(samples, options) ?? samples) };
    } catch (err) {
      // A `.wav` that our reader rejects is exactly the case ffmpeg exists for
      // (an exotic codec inside a RIFF container), so fall through rather than give up.
      const viaFfmpeg = await decodeWithFfmpeg(filePath, options);
      if (viaFfmpeg) return viaFfmpeg;
      return {
        ok: false,
        reason: `无法解码这个 WAV：${err instanceof Error ? err.message : String(err)}`,
        needsFfmpeg: false,
      };
    }
  }

  const viaFfmpeg = await decodeWithFfmpeg(filePath, options);
  if (viaFfmpeg) return viaFfmpeg;

  const info = await findFfmpeg();
  return {
    ok: false,
    reason: info
      ? 'ffmpeg 无法解码这个文件（可能不是音频，或编码不被支持）'
      : '这个格式需要 ffmpeg 解码，但本机没有找到 ffmpeg',
    needsFfmpeg: !info,
  };
}

function trim(samples: DecodedSamples, options: DecodeOptions): DecodedSamples | null {
  if (options.maxSeconds === undefined || !Number.isFinite(options.maxSeconds)) return null;
  const limit = Math.max(0, Math.floor(options.maxSeconds * samples.sampleRate));
  if (limit === 0 || samples.channelData.every((channel) => channel.length <= limit)) return null;
  return {
    channelData: samples.channelData.map((channel) => channel.subarray(0, limit)),
    sampleRate: samples.sampleRate,
    via: samples.via,
  };
}

async function decodeWithFfmpeg(filePath: string, options: DecodeOptions): Promise<DecodeResult | null> {
  const info = options.ffmpegPath
    ? { path: options.ffmpegPath, source: 'env' as const }
    : await findFfmpeg();
  if (!info) return null;

  const sampleRate = options.sampleRate ?? ANALYSIS_SAMPLE_RATE;
  const channels = options.mono ? 1 : 2;
  const args = [
    '-v', 'error',
    // `-t` before `-i` limits the *input*, so a long file is not read to the end.
    ...(options.maxSeconds !== undefined && Number.isFinite(options.maxSeconds)
      ? ['-t', String(Math.max(0, options.maxSeconds))]
      : []),
    '-i', filePath,
    // Raw floats on stdout: no temporary files, no WAV header to re-parse, and the
    // sample format we actually want.
    '-f', 'f32le',
    '-ac', String(channels),
    '-ar', String(sampleRate),
    '-',
  ];

  const pcm = await run(info.path, args, 256 * 1024 * 1024);
  if (!pcm) return { ok: false, reason: 'ffmpeg 解码失败', needsFfmpeg: false };

  const frameCount = Math.floor(pcm.length / 4 / channels);
  if (frameCount === 0) {
    return { ok: false, reason: 'ffmpeg 没有解出任何采样', needsFfmpeg: false };
  }

  // Copy rather than view: the Buffer is about to be released, and a view into it
  // would keep the whole allocation alive for as long as any sample is referenced.
  const all = new Float32Array(frameCount * channels);
  for (let i = 0; i < all.length; i += 1) all[i] = pcm.readFloatLE(i * 4);

  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch += 1) {
    const channel = new Float32Array(frameCount);
    for (let i = 0; i < frameCount; i += 1) channel[i] = all[i * channels + ch]!;
    channelData.push(channel);
  }

  // ffmpeg gives 2 channels for a mono source when asked for stereo; drop the
  // duplicate so a mono file is not reported as stereo.
  if (channels === 2 && identical(channelData[0]!, channelData[1]!)) {
    return { ok: true, channelData: [channelData[0]!], sampleRate, via: 'ffmpeg' };
  }

  return { ok: true, channelData, sampleRate, via: 'ffmpeg' };
}

function identical(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return false;
  // Sampling a prefix is enough and keeps this cheap on long files.
  const step = Math.max(1, Math.floor(a.length / 4096));
  for (let i = 0; i < a.length; i += step) {
    if (Math.abs(a[i]! - b[i]!) > 1e-6) return false;
  }
  return true;
}

function run(binary: string, args: string[], maxBuffer: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    execFile(
      binary,
      args,
      { maxBuffer, encoding: 'buffer', windowsHide: true, timeout: 10 * 60 * 1000 },
      (err, stdout) => {
        if (err) resolve(null);
        else resolve(stdout as unknown as Buffer);
      },
    );
  });
}

/**
 * Probe container and stream properties with ffmpeg.
 *
 * Deliberately uses **ffmpeg**, not ffprobe: `ffmpeg-static` ships only ffmpeg, and
 * requiring a second binary for format details would mean half the feature works.
 * The first stderr line of an ffmpeg run already carries `Duration` and the stream
 * description, which is all we need.
 */
export interface FfmpegProbe {
  durationMs: number | null;
  sampleRate: number | null;
  channels: number | null;
  codec: string | null;
  bitDepth: number | null;
}

export async function probeWithFfmpeg(filePath: string): Promise<FfmpegProbe | null> {
  const info = await findFfmpeg();
  if (!info) return null;

  const stderr = await runCaptureStderr(info.path, ['-hide_banner', '-i', filePath]);
  if (!stderr) return null;

  const result: FfmpegProbe = { durationMs: null, sampleRate: null, channels: null, codec: null, bitDepth: null };

  const duration = /Duration:\s*(\d+):(\d{2}):(\d{2})\.(\d+)/.exec(stderr);
  if (duration) {
    const [, h, m, s, frac] = duration;
    const seconds = Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(`0.${frac}`);
    if (Number.isFinite(seconds)) result.durationMs = Math.round(seconds * 1000);
  }

  const stream = /Stream #\d+:\d+.*?: Audio:\s*([A-Za-z0-9_]+).*?(\d+)\s*Hz,\s*([^,\n]+)/.exec(stderr);
  if (stream) {
    result.codec = stream[1] ?? null;
    result.sampleRate = Number(stream[2]) || null;
    const layout = (stream[3] ?? '').trim();
    if (layout === 'mono') result.channels = 1;
    else if (layout === 'stereo') result.channels = 2;
    else {
      const count = /^(\d+)\./.exec(layout);
      if (count) result.channels = Number(count[1]);
    }
  }

  const depth = /,\s*(u8|s16|s32|flt|fltp|s16p|s32p|dbl)\b/.exec(stderr);
  if (depth) {
    const map: Record<string, number> = { u8: 8, s16: 16, s16p: 16, s32: 32, s32p: 32, flt: 32, fltp: 32, dbl: 64 };
    result.bitDepth = map[depth[1]!] ?? null;
  }

  return result;
}

function runCaptureStderr(binary: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      binary,
      args,
      { maxBuffer: 4 * 1024 * 1024, windowsHide: true, timeout: 60_000 },
      // ffmpeg exits non-zero when there is no output file; the information is in
      // stderr either way, so the error is not a failure here.
      (_err, _stdout, stderr) => resolve(stderr || null),
    );
  });
}

export type { DecodedAudio };

// ---------------------------------------------------------------------------
// transcoding for playback
// ---------------------------------------------------------------------------

/**
 * Transcode a file to a complete in-memory WAV.
 *
 * Exists so a FLAC or MP3 can be *played*, not merely indexed: an `<audio>` element
 * has no reliable decoder for those, so the engine hands it PCM it can always read.
 *
 * 16-bit rather than float keeps the payload half the size for no audible
 * difference on playback, and `-vn` drops any embedded artwork that a media file
 * might carry — a sound effect with a cover image is not something we want to ship
 * to the browser.
 *
 * Returns null on any failure; the caller decides what to say.
 */
export async function transcodeToWav(
  ffmpegBinary: string,
  filePath: string,
  options: { sampleRate?: number; bitDepth?: 16 | 24 } = {},
): Promise<Buffer | null> {
  const sampleRate = options.sampleRate ?? ANALYSIS_SAMPLE_RATE;
  const codec = (options.bitDepth ?? 16) === 24 ? 'pcm_s24le' : 'pcm_s16le';
  return run(ffmpegBinary, [
    '-v', 'error',
    '-i', filePath,
    '-vn',
    '-map_metadata', '-1',
    '-c:a', codec,
    '-ar', String(sampleRate),
    '-f', 'wav',
    '-',
  ], 512 * 1024 * 1024);
}

/** ffmpeg availability, for reporting to the UI. */
export async function ffmpegStatus(): Promise<
  { available: true; version: string | null; source: 'env' | 'path' | 'bundled' } | { available: false }
> {
  const info = await findFfmpeg();
  if (!info) return { available: false };
  return { available: true, version: info.version, source: info.source };
}
