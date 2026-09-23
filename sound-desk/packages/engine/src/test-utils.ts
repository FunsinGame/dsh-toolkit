/**
 * Test-only helpers. Synthesizing WAV bytes in-process keeps the suite free of
 * binary fixtures, which matters because this project's fixtures would
 * otherwise be large and licensing-sensitive.
 */

/** Minimal 16-bit PCM mono WAV container around the given samples. */
export function createWav(samples: Float32Array, sampleRate: number): Buffer {
  const dataBytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 'ascii');

  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // fmt chunk size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample

  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  return buffer;
}

/** A sine tone with an exponential decay envelope — a stand-in for a real SFX. */
export function sine(freqHz: number, seconds: number, sampleRate: number, decay = 3): Float32Array {
  const length = Math.max(1, Math.floor(seconds * sampleRate));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    const env = Math.exp(-decay * t);
    out[i] = 0.8 * env * Math.sin(2 * Math.PI * freqHz * t);
  }
  return out;
}

/** Deterministic pseudo-random noise, with a fast attack. */
export function noise(seconds: number, sampleRate: number, seed = 12345): Float32Array {
  const length = Math.max(1, Math.floor(seconds * sampleRate));
  const out = new Float32Array(length);
  let state = seed >>> 0;
  for (let i = 0; i < length; i += 1) {
    // xorshift32 — deterministic across runs and platforms
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    const r = (state / 0xffffffff) * 2 - 1;
    const env = Math.exp(-8 * (i / sampleRate));
    out[i] = 0.7 * env * r;
  }
  return out;
}

/** A multi-chunk WAV carrying BWF `bext` and `iXML` metadata, for the metadata stage. */
export function createBwf(
  samples: Float32Array,
  sampleRate: number,
  bext: { description?: string; originator?: string; originatorReference?: string; date?: string; time?: string },
  ixml?: string,
): Buffer {
  const fmt = Buffer.alloc(24);
  fmt.write('fmt ', 0, 'ascii');
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(1, 8);
  fmt.writeUInt16LE(1, 10);
  fmt.writeUInt32LE(sampleRate, 12);
  fmt.writeUInt32LE(sampleRate * 2, 16);
  fmt.writeUInt16LE(2, 18);
  fmt.writeUInt16LE(16, 20);

  const bextPayload = Buffer.alloc(602);
  bextPayload.write((bext.description ?? '').slice(0, 255), 0, 'latin1');
  bextPayload.write((bext.originator ?? '').slice(0, 31), 256, 'latin1');
  bextPayload.write((bext.originatorReference ?? '').slice(0, 31), 288, 'latin1');
  bextPayload.write((bext.date ?? '').slice(0, 10), 320, 'latin1');
  bextPayload.write((bext.time ?? '').slice(0, 8), 330, 'latin1');
  // timeReferenceLow/High (8 bytes) stay zero; version 1 at offset 346
  bextPayload.writeUInt16LE(1, 346);
  const bextChunk = Buffer.concat([chunkHeader('bext', bextPayload.length), bextPayload]);

  const ixmlChunk = ixml
    ? (() => {
        const payload = Buffer.from(ixml, 'utf8');
        return Buffer.concat([chunkHeader('iXML', payload.length), pad(payload)]);
      })()
    : Buffer.alloc(0);

  const dataBytes = samples.length * 2;
  const dataPayload = Buffer.alloc(dataBytes);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    dataPayload.writeInt16LE(Math.round(clamped * 32767), i * 2);
  }
  const dataChunk = Buffer.concat([chunkHeader('data', dataBytes), dataPayload]);

  const body = Buffer.concat([fmt, bextChunk, ixmlChunk, dataChunk]);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(body.length, 4);
  header.write('WAVE', 8, 'ascii');
  return Buffer.concat([header, body]);
}

function chunkHeader(id: string, size: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.write(id, 0, 'ascii');
  buf.writeUInt32LE(size, 4);
  return buf;
}

/** RIFF chunks are word-aligned: odd sizes get one NUL pad byte. */
function pad(payload: Buffer): Buffer {
  if (payload.length % 2 === 0) return payload;
  return Buffer.concat([payload, Buffer.from([0])]);
}
