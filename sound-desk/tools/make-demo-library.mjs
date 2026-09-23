// Demo library generator — synthesizes a small, varied SFX set for UI checks.
// Kept out of the main source tree because it is a fixture, not shipped code.
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
if (!root) {
  console.error('usage: node make-demo-library.mjs <target-dir>');
  process.exit(1);
}

function wav(samples, sr) {
  const n = samples.length;
  const d = n * 2;
  const b = Buffer.alloc(44 + d);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + d, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(d, 40);
  for (let i = 0; i < n; i += 1) {
    b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  }
  return b;
}

function sine(freq, seconds, sr, decay = 3) {
  const n = Math.floor(seconds * sr);
  const o = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    o[i] = 0.85 * Math.exp((-decay * i) / sr) * Math.sin((2 * Math.PI * freq * i) / sr);
  }
  return o;
}

function noiseBurst(seconds, sr, decay = 8, seed = 12345) {
  const n = Math.floor(seconds * sr);
  const o = new Float32Array(n);
  let st = seed >>> 0;
  for (let i = 0; i < n; i += 1) {
    st ^= st << 13; st >>>= 0;
    st ^= st >>> 17;
    st ^= st << 5; st >>>= 0;
    o[i] = 0.8 * Math.exp((-decay * i) / sr) * ((st / 0xffffffff) * 2 - 1);
  }
  return o;
}

/** Noise through a crude one-pole low-pass — sounds like a thud rather than a click. */
function thud(seconds, sr, cutoff = 0.08) {
  const raw = noiseBurst(seconds, sr, 14, 999);
  const o = new Float32Array(raw.length);
  let prev = 0;
  for (let i = 0; i < raw.length; i += 1) {
    prev = prev + cutoff * (raw[i] - prev);
    o[i] = prev * 2.2;
  }
  return o;
}

/** Rising sine sweep — a "riser". */
function riser(seconds, sr) {
  const n = Math.floor(seconds * sr);
  const o = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / n;
    const freq = 120 + 1400 * t * t;
    phase += (2 * Math.PI * freq) / sr;
    o[i] = 0.6 * t * Math.sin(phase);
  }
  return o;
}

/** Filtered noise with a slow swell — ambience-ish. */
function ambience(seconds, sr) {
  const n = Math.floor(seconds * sr);
  const o = new Float32Array(n);
  let st = 4242;
  let lp = 0;
  for (let i = 0; i < n; i += 1) {
    st ^= st << 13; st >>>= 0;
    st ^= st >>> 17;
    st ^= st << 5; st >>>= 0;
    const white = (st / 0xffffffff) * 2 - 1;
    lp = lp + 0.02 * (white - lp);
    const env = Math.sin((Math.PI * i) / n);
    o[i] = lp * 3 * env * 0.5;
  }
  return o;
}

const files = [
  ['Doors/Wood/DOORWood_WoodenDoorClose_MyLib_RecA_01.wav', sine(190, 1.1, 48000, 3.2)],
  ['Doors/Metal/metal_door_slam_heavy_02.wav', thud(0.9, 48000, 0.10)],
  ['Impacts/Metal/IMPACTMetal_sheet_clang_ring_01.wav', sine(880, 2.2, 48000, 1.1)],
  ['Impacts/Glass/glass_shatter_small_pieces_03.wav', noiseBurst(0.7, 48000, 12, 7)],
  ['Footsteps/Wood/footstep_wood_floor_slow_01.wav', thud(0.35, 44100, 0.06)],
  ['Whooshes/WHOOSHESPassBy_whoosh_fast_04.wav', noiseBurst(0.5, 48000, 6, 31)],
  ['Designed/DESIGNEDRiser_riser_dark_tension_01.wav', riser(2.4, 48000)],
  ['Ambience/AMBExtForest_forest_birds_distant_loop.wav', ambience(4.0, 48000)],
];

for (const [rel, samples] of files) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, wav(samples, 48000 === 44100 ? 44100 : (rel.includes('footstep') ? 44100 : 48000)));
}
fs.mkdirSync(path.join(root, 'Unsorted'), { recursive: true });
fs.writeFileSync(path.join(root, 'Unsorted/cool_impact_03.wav'), wav(thud(0.4, 48000, 0.12), 48000));

console.log(`wrote ${files.length + 1} files to ${root}`);
for (const [rel] of files) console.log('  ' + rel);
console.log('  Unsorted/cool_impact_03.wav');
