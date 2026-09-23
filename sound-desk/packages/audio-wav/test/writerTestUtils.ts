/**
 * RIFF builders shared by the writer tests.
 *
 * Kept separate from the main test suite's builders so writing tests can
 * construct the exact chunk layouts they need (bext, iXML, INFO, plus arbitrary
 * extra chunks) without duplicating the format knowledge.
 */

export interface BextFixture {
  description?: string;
  originator?: string;
  originatorReference?: string;
  originationDate?: string;
  originationTime?: string;
  timeReferenceLow?: number;
  timeReferenceHigh?: number;
  version?: number;
  umid?: string;
  loudnessValue?: number;
  codingHistory?: string[];
}

export function buildChunkForTest(id: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.write(id, 0, 'ascii');
  header.writeUInt32LE(payload.length, 4);
  const pad = payload.length % 2 === 1 ? Buffer.from([0]) : Buffer.alloc(0);
  return Buffer.concat([header, payload, pad]);
}

export function buildBextForTest(bext: BextFixture): Buffer {
  const fixed = Buffer.alloc(602);
  fixed.write((bext.description ?? '').slice(0, 255), 0, 'latin1');
  fixed.write((bext.originator ?? '').slice(0, 31), 256, 'latin1');
  fixed.write((bext.originatorReference ?? '').slice(0, 31), 288, 'latin1');
  fixed.write((bext.originationDate ?? '').slice(0, 10), 320, 'latin1');
  fixed.write((bext.originationTime ?? '').slice(0, 8), 330, 'latin1');
  fixed.writeUInt32LE(bext.timeReferenceLow ?? 0, 338);
  fixed.writeUInt32LE(bext.timeReferenceHigh ?? 0, 342);
  const version = bext.version ?? 1;
  fixed.writeUInt16LE(version, 346);
  if (version >= 2) {
    fixed.writeInt16LE(bext.loudnessValue === undefined ? -32768 : Math.round(bext.loudnessValue * 100), 412);
  }
  const history = (bext.codingHistory ?? []).join('\r\n');
  const tail = history.length > 0 ? Buffer.from(`${history}\r\n`, 'latin1') : Buffer.alloc(0);
  return Buffer.concat([fixed, tail]);
}

export function buildListInfoForTest(tags: Record<string, string>): Buffer {
  const parts: Buffer[] = [Buffer.from('INFO', 'ascii')];
  for (const [key, value] of Object.entries(tags)) {
    parts.push(buildChunkForTest(key, Buffer.from(`${value}\0`, 'latin1')));
  }
  return Buffer.concat(parts);
}

export interface MakeRiffOptions {
  bext?: BextFixture;
  ixml?: string;
  info?: Record<string, string>;
  /** raw chunks appended after the data chunk */
  extraChunks?: Buffer;
  /** raw chunks inserted before the data chunk */
  preDataChunks?: Buffer;
  sampleRate?: number;
}

/** Build a mono 16-bit PCM WAVE container around `samples`. */
export function makeRiff(samples: Float32Array, sampleRate = 48000, options: MakeRiffOptions = {}): Buffer {
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(1, 0); // PCM
  fmt.writeUInt16LE(1, 2); // mono
  fmt.writeUInt32LE(sampleRate, 4);
  fmt.writeUInt32LE(sampleRate * 2, 8);
  fmt.writeUInt16LE(2, 12);
  fmt.writeUInt16LE(16, 14);

  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    data.writeInt16LE(Math.round(clamped * 32767), i * 2);
  }

  const middle: Buffer[] = [];
  if (options.bext) middle.push(buildChunkForTest('bext', buildBextForTest(options.bext)));
  if (options.ixml) middle.push(buildChunkForTest('iXML', Buffer.from(options.ixml, 'utf8')));
  if (options.info) middle.push(buildChunkForTest('LIST', buildListInfoForTest(options.info)));
  if (options.preDataChunks) middle.push(options.preDataChunks);

  const tail: Buffer[] = [];
  if (options.extraChunks) tail.push(options.extraChunks);

  const body = Buffer.concat([
    buildChunkForTest('fmt ', fmt),
    ...middle,
    buildChunkForTest('data', data),
    ...tail,
  ]);

  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(body.length, 4);
  header.write('WAVE', 8, 'ascii');
  return Buffer.concat([header, body]);
}

/** A decaying sine tone. */
export function sineSamples(freq: number, seconds: number, sampleRate: number, decay = 2): Float32Array {
  const n = Math.max(1, Math.floor(seconds * sampleRate));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / sampleRate;
    out[i] = 0.8 * Math.exp(-decay * t) * Math.sin(2 * Math.PI * freq * t);
  }
  return out;
}

/** Deterministic broadband noise. */
export function pcmNoise(seconds: number, sampleRate: number, seed = 999): Float32Array {
  const n = Math.max(1, Math.floor(seconds * sampleRate));
  const out = new Float32Array(n);
  let state = seed >>> 0;
  for (let i = 0; i < n; i += 1) {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    out[i] = 0.7 * ((state / 0xffffffff) * 2 - 1);
  }
  return out;
}
