/**
 * 结构探查工具：把 mp4box 解析出来的音轨结构打出来，用于定位
 * AudioSpecificConfig（`esds` → DecoderSpecificInfo）在 mp4box 里的真实字段名。
 *
 * 用法：node out/spike/inspect.js <path-to-m4s>
 */

import { readFile } from 'node:fs/promises';

import { createFile, type MP4BoxBuffer, type Track } from 'mp4box';

function describe(prefix: string, value: unknown, depth = 0): void {
  if (value === null || value === undefined) {
    console.log(`${prefix} = ${String(value)}`);
    return;
  }
  if (value instanceof Uint8Array) {
    const hex = Buffer.from(value.subarray(0, 32)).toString('hex');
    console.log(`${prefix} = Uint8Array(${value.byteLength}) ${hex}`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      console.log(`${prefix} = []`);
      return;
    }
    console.log(`${prefix} = Array(${value.length})`);
    if (depth < 4) describe(`${prefix}[0]`, value[0], depth + 1);
    return;
  }
  if (typeof value === 'object') {
    console.log(`${prefix} = {${Object.keys(value as object).join(', ')}}`);
    if (depth >= 4) return;
    for (const key of Object.keys(value as object)) {
      const child = (value as Record<string, unknown>)[key];
      if (typeof child === 'function') continue;
      describe(`${prefix}.${key}`, child, depth + 1);
    }
    return;
  }
  console.log(`${prefix} = ${String(value)}`);
}

async function main(): Promise<void> {
  const path = process.argv[2];
  if (!path) throw new Error('用法：node out/spike/inspect.js <m4s 文件>');
  const bytes = new Uint8Array(await readFile(path));
  console.log(`文件：${path}  ${bytes.byteLength} 字节`);

  const file = createFile();
  file.onError = (module, message) => console.error(`mp4box error ${module}: ${message}`);
  file.onReady = (movie) => {
    const tracks = (movie as unknown as { tracks: Track[] }).tracks;
    console.log(`\n轨道数：${tracks.length}`);
    for (const track of tracks) {
      const internals = track as unknown as Record<string, unknown>;
      console.log('\n---------------- 轨道 ----------------');
      describe('track', {
        id: internals.id,
        codec: internals.codec,
        timescale: internals.timescale,
        duration: internals.duration,
        nb_samples: internals.nb_samples,
        audio: internals.audio,
      });

      // 关键：公开的 Track 对象不含盒子树，必须走 getTrackById() 拿 trakBox。
      const trak = (file as unknown as { getTrackById(id: number): unknown }).getTrackById(
        internals.id as number,
      ) as Record<string, unknown>;
      const mdia = trak.mdia as Record<string, unknown> | undefined;
      const minf = mdia?.minf as Record<string, unknown> | undefined;
      const stbl = minf?.stbl as Record<string, unknown> | undefined;
      const stsd = stbl?.stsd as Record<string, unknown> | undefined;
      console.log(`\ntrak keys : ${Object.keys(trak).join(', ')}`);
      console.log(`stsd keys : ${stsd ? Object.keys(stsd).join(', ') : '(缺失)'}`);
      const entries = (stsd?.entries ?? []) as Array<Record<string, unknown>>;
      console.log(`stsd.entries: ${entries.length}`);
      for (const entry of entries) {
        console.log(`\n  entry keys: ${Object.keys(entry).join(', ')}`);
        const esds = (entry.esds ?? (entry.wave as Record<string, unknown> | undefined)?.esds) as
          | Record<string, unknown>
          | undefined;
        console.log(`  esds: ${esds ? '有' : '无'}`);
        if (esds) {
          console.log(`  esds keys: ${Object.keys(esds).join(', ')}`);
          const esd = esds.esd as Record<string, unknown> | undefined;
          console.log(`  esd keys: ${esd ? Object.keys(esd).join(', ') : '(缺失)'}`);
          const descs = esd?.descs as Array<Record<string, unknown>> | undefined;
          console.log(`  esd.descs: ${descs ? `Array(${descs.length})` : '(缺失)'}`);
          for (const desc of descs ?? []) {
            console.log(
              `    desc tag=${String(desc.tag)} keys=${Object.keys(desc).join(',')} dataLen=${
                desc.data instanceof Uint8Array ? desc.data.byteLength : 'n/a'
              }`,
            );
            const nested = desc.descs as Array<Record<string, unknown>> | undefined;
            for (const child of nested ?? []) {
              console.log(
                `      child tag=${String(child.tag)} dataLen=${
                  child.data instanceof Uint8Array ? child.data.byteLength : 'n/a'
                } hex=${
                  child.data instanceof Uint8Array
                    ? Buffer.from(child.data).toString('hex')
                    : 'n/a'
                }`,
              );
            }
          }
        }
      }
    }
  };

  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  Object.assign(buffer, { fileStart: 0 });
  file.appendBuffer(buffer as unknown as MP4BoxBuffer);
  file.flush();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
