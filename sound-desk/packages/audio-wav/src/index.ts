/**
 * @sounddesk/audio-wav
 *
 * Zero-runtime-dependency WAV / BWF (EBU Broadcast Wave Format) parser, PCM decoder,
 * signal-analysis (DSP) feature extractor and multi-resolution peak-pyramid builder.
 *
 * Design notes
 * ------------
 * - Header probing never reads sample data: the RIFF chunk walker reads only chunk
 *   headers (plus small metadata payloads) and seeks past `data`.
 * - Every DSP output is clamped/guarded so it can never be NaN or Infinity.
 * - `RIFX` (big-endian RIFF) headers are parsed; decoding them is rejected explicitly.
 *
 * Node >= 20, ESM only. No runtime dependencies.
 */

import { open } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';

/* --------------------------------------------------------------------------------------------
 * Public API types
 * ------------------------------------------------------------------------------------------ */

export interface WavFormat {
  audioFormat: number; // 1 = PCM int, 3 = IEEE float, 0xFFFE = extensible
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  byteRate: number;
  blockAlign: number;
  isFloat: boolean;
  isExtensible: boolean;
  channelMask?: number;
}

export interface BextChunk {
  description: string;
  originator: string;
  originatorReference: string;
  originationDate: string; // "YYYY-MM-DD"
  originationTime: string; // "HH:MM:SS"
  timeReferenceLow: number;
  timeReferenceHigh: number;
  version: number;
  umid: string; // lowercase hex string, "" if all zero
  loudnessValue?: number; // from chunk v2+, in dB (raw hundredths of dB / 100)
  codingHistory: string[];
}

export interface EmbeddedMetadata {
  bext?: BextChunk;
  /** Flat key/value pairs harvested from iXML, e.g. PROJECT, SCENE, TAKE, CATEGORY, SUBCATEGORY, DESCRIPTION, ORIGINATOR, NOTE */
  ixml?: Record<string, string>;
  /** LIST/INFO tags, e.g. INAM, IART, ICMT, ICRD, IGNR, ISFT, IKEY */
  info?: Record<string, string>;
  /** UCS-style CatID if derivable from iXML <CATEGORY>/<SUBCATEGORY> (concatenate them), else undefined */
  ucsCatId?: string;
}

export interface ChunkInfo {
  id: string;
  size: number;
  /** Byte offset of the chunk header (the first byte of the 4-byte chunk id). */
  offset: number;
}

export interface AudioProbe {
  format: WavFormat;
  durationMs: number;
  frameCount: number;
  dataBytes: number;
  /** true when a non-PCM or compressed format was found (we only decode PCM 1 / float 3 / extensible) */
  unsupportedCodec: boolean;
  embedded: EmbeddedMetadata;
  /** chunks seen, in order, with byte sizes — useful for diagnostics/UI */
  chunks: ChunkInfo[];
}

export interface DspFeatures {
  peak: number; // absolute peak amplitude 0..1
  rms: number; // overall RMS 0..1
  peakDb: number; // 20*log10(peak), -Infinity guarded to -144
  rmsDb: number;
  /** estimated decay time in ms: time from the sample peak until RMS-in-10ms-windows falls below 5% of peak RMS (capped at durationMs) */
  decayMs: number;
  /** spectral centroid in Hz, computed over the whole signal via a simple FFT */
  spectralCentroidHz: number;
  /** fraction of total energy above 4 kHz — a cheap "brightness" proxy 0..1 */
  highFrequencyRatio: number;
  /** 0 = fully mono/mono-compatible, 1 = fully decorrelated (only meaningful when channels>=2) */
  stereoCorrelation: number;
  /** true if a simple energy+zero-crossing VAD finds speech-like activity in >15% of frames */
  hasVoiceLikeActivity: boolean;
  /** rough periodic/pitched detection: 0..1 confidence that the signal is tonal (autocorrelation peak) */
  tonality: number;
}

export interface PeakLevel {
  samplesPerBucket: number;
  buckets: number;
  data: Int16Array;
}

export interface PeakPyramid {
  sampleRate: number;
  channels: number;
  /** levels[0] is the finest. Each level: interleaved per-channel [min,max] pairs as Int16 (scaled by 32767) */
  levels: PeakLevel[];
}

export interface DecodeOptions {
  maxMs?: number;
  mono?: boolean;
}

export interface DecodedAudio {
  sampleRate: number;
  channels: number;
  data: Float32Array[];
}

export interface BuildPeaksOptions {
  base?: number;
  levels?: number;
  /**
   * Extension over the minimum required signature: the pyramid carries a sampleRate, so
   * `buildPeaks` accepts it here (the public `buildPeaks(data, opts)` shape is unchanged
   * for callers that only pass `base` / `levels`). Defaults to 0.
   */
  sampleRate?: number;
}

/* --------------------------------------------------------------------------------------------
 * Constants
 * ------------------------------------------------------------------------------------------ */

const MAX_LEVELS = 6;
const DEFAULT_BASE_BUCKET = 256;
const COARSEN_FACTOR = 8;
/** Upper bound for any text chunk we are willing to pull into memory while probing. */
const TEXT_CHUNK_LIMIT = 8 * 1024 * 1024;
const FMT_CHUNK_LIMIT = 128;

const BEXT_CODING_HISTORY_OFFSET = 602;
const BEXT_UMID_START = 348;
const BEXT_UMID_END = 412;
const BEXT_V2_FIRST = 412; // loudnessValue .. maxShortTermLoudness (5 x i16)
const BEXT_V2_LAST = 422;

const FFT_SIZE = 2048;
const HIGH_FREQ_HZ = 4000;
const SPECTRUM_MAX_SECONDS = 10;
const TONALITY_SEGMENT = 16384;
const TONALITY_MAX_LAGS = 1024;
const VAD_FRAME_SECONDS = 0.02;
const VAD_MAX_SECONDS = 60;
const DECAY_WINDOW_SECONDS = 0.01;
const DECAY_RATIO = 0.05;
const DB_FLOOR = -144;
const PEAKS_MAGIC = 'SDPK';
const PEAKS_VERSION = 1;
const PEAKS_HEADER_BYTES = 14;
const PEAKS_LEVEL_HEADER_BYTES = 12;

const PCM_FORMAT = 1;
const IEEE_FLOAT_FORMAT = 3;
const EXTENSIBLE_FORMAT = 0xfffe;

/* --------------------------------------------------------------------------------------------
 * Byte helpers (bounds-safe: out-of-range reads return 0)
 * ------------------------------------------------------------------------------------------ */

function u16(buf: Buffer, off: number, le: boolean): number {
  if (off < 0 || off + 2 > buf.length) return 0;
  return le ? buf.readUInt16LE(off) : buf.readUInt16BE(off);
}

function i16(buf: Buffer, off: number, le: boolean): number {
  if (off < 0 || off + 2 > buf.length) return 0;
  return le ? buf.readInt16LE(off) : buf.readInt16BE(off);
}

function u32(buf: Buffer, off: number, le: boolean): number {
  if (off < 0 || off + 4 > buf.length) return 0;
  return le ? buf.readUInt32LE(off) : buf.readUInt32BE(off);
}

/** Printable view of a 4-byte (or shorter) tag, for error messages. */
function printable(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    out += code >= 32 && code < 127 ? value[i] : '.';
  }
  return out;
}

function cleanChunkId(raw: string): string {
  return raw.replace(/\0/g, '').trim();
}

/** Heuristic: a payload is UTF-16LE when NUL bytes cluster on odd offsets (or a BOM is present). */
function looksLikeUtf16le(buf: Buffer): boolean {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return true;
  if (buf.length < 4) return false;
  let oddZeros = 0;
  for (let i = 1; i < buf.length; i += 2) if (buf[i] === 0) oddZeros++;
  return oddZeros > buf.length / 4;
}

function decodeTextPayload(buf: Buffer): string {
  if (looksLikeUtf16le(buf)) {
    const start = buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe ? 2 : 0;
    return buf.toString('utf16le', start).replace(/\0/g, '').trim();
  }
  return buf.toString('latin1').replace(/\0/g, '').trim();
}

/** Decode UTF-8 with a UTF-16LE fallback and BOM stripping. */
function decodeUtf8(buf: Buffer): string {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.toString('utf16le', 2).replace(/\0/g, '');
  }
  let start = 0;
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) start = 3;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: false }).decode(buf.subarray(start));
  } catch {
    text = buf.toString('latin1', start);
  }
  return text.replace(/^\uFEFF/, '');
}

/* --------------------------------------------------------------------------------------------
 * fmt chunk
 * ------------------------------------------------------------------------------------------ */

interface ParsedFmt {
  format: WavFormat;
  /** Real format tag: for WAVE_FORMAT_EXTENSIBLE this is the first 2 bytes of the SubFormat GUID. */
  realFormatTag: number;
  containerBits: number;
}

function parseFmtChunk(buf: Buffer, le: boolean): ParsedFmt {
  const declaredTag = u16(buf, 0, le);
  const channels = u16(buf, 2, le);
  const sampleRate = u32(buf, 4, le);
  const byteRate = u32(buf, 8, le);
  const blockAlign = u16(buf, 12, le);
  let bitsPerSample = u16(buf, 14, le);

  const isExtensible = declaredTag === EXTENSIBLE_FORMAT;
  let realFormatTag = declaredTag;
  let isFloat = declaredTag === IEEE_FLOAT_FORMAT;
  let channelMask: number | undefined;
  let validBits = 0;

  if (isExtensible) {
    // cbSize (u16 @16), validBitsPerSample (u16 @18), channelMask (u32 @20), SubFormat GUID (16 bytes @24).
    if (buf.length >= 20) validBits = u16(buf, 18, le);
    if (buf.length >= 24) channelMask = u32(buf, 20, le);
    if (buf.length >= 26) {
      const subTag = u16(buf, 24, le);
      if (subTag !== 0) realFormatTag = subTag;
      isFloat = subTag === IEEE_FLOAT_FORMAT;
    } else {
      isFloat = false;
    }
    // Some writers leave bitsPerSample at 0 and only fill validBitsPerSample.
    if (bitsPerSample === 0 && validBits > 0) bitsPerSample = containerBitsFor(validBits);
  }

  const channelMaskValue = channelMask === 0 ? undefined : channelMask;

  const format: WavFormat = {
    audioFormat: declaredTag,
    channels,
    sampleRate,
    bitsPerSample,
    byteRate,
    blockAlign,
    isFloat,
    isExtensible,
  };
  if (channelMaskValue !== undefined) format.channelMask = channelMaskValue;

  return { format, realFormatTag, containerBits: bitsPerSample };
}

function containerBitsFor(validBits: number): number {
  if (validBits <= 8) return 8;
  if (validBits <= 16) return 16;
  if (validBits <= 24) return 24;
  if (validBits <= 32) return 32;
  return 64;
}

function isSupportedCodec(format: WavFormat, realFormatTag: number): boolean {
  const tag = format.isExtensible ? realFormatTag : format.audioFormat;
  if (tag !== PCM_FORMAT && tag !== IEEE_FLOAT_FORMAT) return false;
  const bits = format.bitsPerSample;
  if (tag === IEEE_FLOAT_FORMAT) return bits === 32 || bits === 64;
  return bits === 8 || bits === 16 || bits === 24 || bits === 32;
}

/* --------------------------------------------------------------------------------------------
 * bext chunk
 * ------------------------------------------------------------------------------------------ */

function parseBextChunk(buf: Buffer): BextChunk {
  const field = (start: number, length: number): string => {
    if (start >= buf.length) return '';
    const end = Math.min(buf.length, start + length);
    return buf.toString('latin1', start, end).replace(/\0/g, '').trim();
  };

  const version = u16(buf, 346, true);

  let umid = '';
  if (buf.length > BEXT_UMID_START) {
    const end = Math.min(buf.length, BEXT_UMID_END);
    const slice = buf.subarray(BEXT_UMID_START, end);
    let anyNonZero = false;
    for (let i = 0; i < slice.length; i++) {
      if (slice[i] !== 0) {
        anyNonZero = true;
        break;
      }
    }
    if (anyNonZero) umid = Buffer.from(slice).toString('hex');
  }

  let loudnessValue: number | undefined;
  if (version >= 2 && buf.length >= BEXT_V2_FIRST + 2) {
    const raw = i16(buf, BEXT_V2_FIRST, true);
    // -32768 (0x8000) is the "not indicated" sentinel in the EBU spec.
    if (raw !== -32768) loudnessValue = raw / 100;
  }

  // Coding history always starts after the fixed 602-byte block. Chunks that are shorter than
  // that (seen in the wild) may already carry history right after the v1 fields, so fall back
  // to the end of the UMID area and let the splitter discard the zero-filled reserved bytes.
  let historyStart = BEXT_CODING_HISTORY_OFFSET;
  if (buf.length <= BEXT_CODING_HISTORY_OFFSET) {
    historyStart = version >= 2 ? Math.max(BEXT_V2_LAST, Math.min(buf.length, BEXT_CODING_HISTORY_OFFSET)) : BEXT_UMID_END;
  }
  const codingHistory: string[] = [];
  if (buf.length > historyStart) {
    const text = buf.toString('latin1', historyStart).replace(/\0/g, '\n');
    for (const part of text.split(/[\r\n]+/)) {
      const trimmed = part.trim();
      if (trimmed.length > 0) codingHistory.push(trimmed);
    }
  }

  return {
    description: field(0, 256),
    originator: field(256, 32),
    originatorReference: field(288, 32),
    originationDate: field(320, 10),
    originationTime: field(330, 8),
    timeReferenceLow: u32(buf, 338, true),
    timeReferenceHigh: u32(buf, 342, true),
    version,
    umid,
    ...(loudnessValue !== undefined ? { loudnessValue } : {}),
    codingHistory,
  };
}

/* --------------------------------------------------------------------------------------------
 * iXML
 * ------------------------------------------------------------------------------------------ */

interface XmlNode {
  name: string;
  parent: string;
  text: string;
  hasChild: boolean;
}

function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    switch (body) {
      case 'amp':
        return '&';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      default:
        return match;
    }
  });
}

function elementName(tag: string): string {
  const match = /^[^\s/>]+/.exec(tag.trim());
  const raw = match ? match[0] : '';
  const colon = raw.lastIndexOf(':');
  return colon >= 0 ? raw.slice(colon + 1) : raw;
}

/**
 * Tolerant element scanner for iXML. It is deliberately not a general XML parser: it ignores
 * attributes, XML declarations, comments, DOCTYPEs and CDATA markers, and flattens the tree into
 * a key/value map. Leaf elements are exposed under their own (uppercased) name — first occurrence
 * wins — and nested leaves are additionally exposed as `PARENT/LEAF`.
 */
function parseIxml(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  const stack: XmlNode[] = [];

  const commit = (node: XmlNode): void => {
    if (node.hasChild) return;
    const value = decodeXmlEntities(node.text).replace(/\s+/g, ' ').trim();
    if (value.length === 0) return;
    const key = node.name.toUpperCase();
    const parentKey = node.parent.toUpperCase();
    if (parentKey.length > 0 && parentKey !== 'BWFXML') {
      const nested = `${parentKey}/${key}`;
      if (!(nested in out)) out[nested] = value;
    }
    if (!(key in out)) out[key] = value;
  };

  let i = 0;
  while (i < xml.length) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) break;
    if (stack.length > 0) stack[stack.length - 1].text += xml.slice(i, lt);
    i = lt;

    if (xml.startsWith('<!--', i)) {
      const end = xml.indexOf('-->', i + 4);
      i = end < 0 ? xml.length : end + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', i)) {
      const end = xml.indexOf(']]>', i + 9);
      const cdata = xml.slice(i + 9, end < 0 ? xml.length : end);
      if (stack.length > 0) stack[stack.length - 1].text += cdata;
      i = end < 0 ? xml.length : end + 3;
      continue;
    }
    if (xml.startsWith('<?', i)) {
      const end = xml.indexOf('?>', i + 2);
      i = end < 0 ? xml.length : end + 2;
      continue;
    }
    if (xml.startsWith('<!', i)) {
      const end = xml.indexOf('>', i + 2);
      i = end < 0 ? xml.length : end + 1;
      continue;
    }

    const gt = xml.indexOf('>', i + 1);
    if (gt < 0) break;
    let tag = xml.slice(i + 1, gt);
    i = gt + 1;

    if (tag.startsWith('/')) {
      const node = stack.pop();
      if (node) commit(node);
      continue;
    }

    const selfClosing = tag.endsWith('/');
    if (selfClosing) tag = tag.slice(0, -1);
    const name = elementName(tag);
    if (name.length === 0) continue;
    const parent = stack.length > 0 ? stack[stack.length - 1].name : '';
    if (stack.length > 0) stack[stack.length - 1].hasChild = true;
    const node: XmlNode = { name, parent, text: '', hasChild: false };
    if (selfClosing) commit(node);
    else stack.push(node);
  }

  while (stack.length > 0) {
    const node = stack.pop();
    if (node) commit(node);
  }

  return out;
}

/* --------------------------------------------------------------------------------------------
 * LIST / INFO
 * ------------------------------------------------------------------------------------------ */

function parseListInfoChunk(buf: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  let pos = 4; // skip the "INFO" type tag
  while (pos + 8 <= buf.length) {
    const id = cleanChunkId(buf.toString('latin1', pos, pos + 4)).toUpperCase();
    const size = buf.readUInt32LE(pos + 4);
    const start = pos + 8;
    const end = Math.min(buf.length, start + size);
    if (id.length > 0 && end > start) out[id] = decodeTextPayload(buf.subarray(start, end));
    const advance = start + size + (size & 1);
    if (advance <= pos) break;
    pos = advance;
  }
  return out;
}

/* --------------------------------------------------------------------------------------------
 * RIFF walking (generator-driven so the same logic serves sync Buffer and async file sources)
 * ------------------------------------------------------------------------------------------ */

interface ReadRequest {
  offset: number;
  length: number;
}

interface AnalysisData {
  format: WavFormat;
  realFormatTag: number;
  bigEndian: boolean;
  dataOffset: number;
  dataBytes: number;
  chunks: ChunkInfo[];
  embedded: EmbeddedMetadata;
}

function deriveUcsCatId(ixml: Record<string, string> | undefined): string | undefined {
  if (!ixml) return undefined;
  const category = ixml.CATEGORY;
  const subcategory = ixml.SUBCATEGORY;
  if (!category && !subcategory) return undefined;
  const combined = `${category ?? ''}${subcategory ?? ''}`.replace(/\s+/g, '').trim();
  return combined.length > 0 ? combined : undefined;
}

const TEXT_CHUNK_IDS: Record<string, 'bext' | 'ixml' | 'list'> = {
  BEXT: 'bext',
  IXML: 'ixml',
  LIST: 'list',
};

/**
 * Walks the RIFF container, yielding read requests. The driver feeds each yielded request back
 * with the corresponding bytes (sync for buffers, awaited for files). Only `fmt `, `bext`, `iXML`
 * and `LIST` payloads are ever read; everything else (notably `data`) is skipped by arithmetic.
 */
function* walkRiff(byteLength: number): Generator<ReadRequest, AnalysisData, Buffer> {
  if (byteLength < 12) throw new Error('Not a WAV file: smaller than a 12-byte RIFF header');

  const header = yield { offset: 0, length: 12 };
  if (header.length < 12) throw new Error('Not a WAV file: truncated RIFF header');

  const magic = header.toString('latin1', 0, 4);
  const bigEndian = magic === 'RIFX';
  if (magic !== 'RIFF' && magic !== 'RIFX') {
    throw new Error(`Not a WAV file: expected "RIFF" or "RIFX" magic, found "${printable(magic)}"`);
  }
  const formType = header.toString('latin1', 8, 12);
  if (formType !== 'WAVE') {
    throw new Error(`Not a WAV file: expected "WAVE" form type, found "${printable(formType)}"`);
  }
  const le = !bigEndian;

  const chunks: ChunkInfo[] = [];
  const embedded: EmbeddedMetadata = {};
  let format: WavFormat | null = null;
  let realFormatTag = 0;
  let dataOffset = -1;
  let dataBytes = 0;
  let pos = 12;

  while (pos + 8 <= byteLength) {
    const head = yield { offset: pos, length: 8 };
    if (head.length < 8) break;

    const id = cleanChunkId(head.toString('latin1', 0, 4));
    const upper = id.toUpperCase();
    const declaredSize = u32(head, 4, le);
    const payloadOffset = pos + 8;
    const available = Math.max(0, byteLength - payloadOffset);
    // RF64 / streaming writers use 0xFFFFFFFF, and truncated files lie: clamp to what exists.
    const size = declaredSize === 0xffffffff || declaredSize > available ? available : declaredSize;
    chunks.push({ id, size, offset: pos });

    const textKind = TEXT_CHUNK_IDS[upper];
    if (upper === 'FMT') {
      const body = yield { offset: payloadOffset, length: Math.min(size, FMT_CHUNK_LIMIT) };
      const parsed = parseFmtChunk(body, le);
      format = parsed.format;
      realFormatTag = parsed.realFormatTag;
    } else if (textKind === 'bext') {
      const body = yield { offset: payloadOffset, length: Math.min(size, TEXT_CHUNK_LIMIT) };
      embedded.bext = parseBextChunk(body);
    } else if (textKind === 'ixml') {
      const body = yield { offset: payloadOffset, length: Math.min(size, TEXT_CHUNK_LIMIT) };
      embedded.ixml = parseIxml(decodeUtf8(body));
    } else if (textKind === 'list') {
      const body = yield { offset: payloadOffset, length: Math.min(size, TEXT_CHUNK_LIMIT) };
      if (body.length >= 4 && body.toString('latin1', 0, 4).toUpperCase() === 'INFO') {
        embedded.info = parseListInfoChunk(body);
      }
    } else if (upper === 'DATA' && dataOffset < 0) {
      dataOffset = payloadOffset;
      dataBytes = size;
    }

    const advance = payloadOffset + size + (size & 1); // chunks are word-aligned: 2-byte padding
    if (advance <= pos) break;
    pos = advance;
  }

  if (format === null) throw new Error('Invalid WAV: missing "fmt " chunk');

  const ucsCatId = deriveUcsCatId(embedded.ixml);
  if (ucsCatId !== undefined) embedded.ucsCatId = ucsCatId;

  return { format, realFormatTag, bigEndian, dataOffset, dataBytes, chunks, embedded };
}

function runWalkerSync(byteLength: number, read: (offset: number, length: number) => Buffer): AnalysisData {
  const walker = walkRiff(byteLength);
  let step = walker.next();
  while (!step.done) {
    step = walker.next(read(step.value.offset, step.value.length));
  }
  return step.value;
}

async function runWalkerAsync(
  byteLength: number,
  read: (offset: number, length: number) => Promise<Buffer>,
): Promise<AnalysisData> {
  const walker = walkRiff(byteLength);
  let step = walker.next();
  while (!step.done) {
    const buf = await read(step.value.offset, step.value.length);
    step = walker.next(buf);
  }
  return step.value;
}

function toProbe(data: AnalysisData): AudioProbe {
  const { format } = data;
  const frameCount = format.blockAlign > 0 ? Math.floor(data.dataBytes / format.blockAlign) : 0;
  const durationMs = format.sampleRate > 0 ? (frameCount / format.sampleRate) * 1000 : 0;
  const supported = isSupportedCodec(format, data.realFormatTag) && format.blockAlign > 0;
  return {
    format,
    durationMs: Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0,
    frameCount,
    dataBytes: data.dataBytes,
    unsupportedCodec: !supported,
    embedded: data.embedded,
    chunks: data.chunks,
  };
}

/* --------------------------------------------------------------------------------------------
 * Sources
 * ------------------------------------------------------------------------------------------ */

function sliceBuffer(buf: Buffer, offset: number, length: number): Buffer {
  const start = Math.max(0, Math.min(buf.length, offset));
  const end = Math.max(start, Math.min(buf.length, start + Math.max(0, length)));
  return buf.subarray(start, end);
}

function makeFileReader(handle: FileHandle, byteLength: number): (offset: number, length: number) => Promise<Buffer> {
  return async (offset: number, length: number): Promise<Buffer> => {
    const start = Math.max(0, Math.min(byteLength, offset));
    const len = Math.max(0, Math.min(length, byteLength - start));
    if (len === 0) return Buffer.alloc(0);
    const out = Buffer.allocUnsafe(len);
    let got = 0;
    while (got < len) {
      const { bytesRead } = await handle.read(out, got, len - got, start + got);
      if (bytesRead <= 0) break;
      got += bytesRead;
    }
    return got === len ? out : out.subarray(0, got);
  };
}

/* --------------------------------------------------------------------------------------------
 * probe
 * ------------------------------------------------------------------------------------------ */

/** Parse headers only. Never reads the whole file: reads RIFF chunks and skips `data` by seeking. */
export async function probeWav(filePath: string): Promise<AudioProbe> {
  const handle = await open(filePath, 'r');
  try {
    const stat = await handle.stat();
    const data = await runWalkerAsync(stat.size, makeFileReader(handle, stat.size));
    return toProbe(data);
  } finally {
    await handle.close();
  }
}

export function probeWavBuffer(buf: Buffer): AudioProbe {
  if (!Buffer.isBuffer(buf)) throw new TypeError('probeWavBuffer expects a Buffer');
  const data = runWalkerSync(buf.length, (offset, length) => sliceBuffer(buf, offset, length));
  return toProbe(data);
}

/* --------------------------------------------------------------------------------------------
 * decode
 * ------------------------------------------------------------------------------------------ */

function decodeBlock(
  bytes: Buffer,
  format: WavFormat,
  startFrame: number,
  frames: number,
  out: Float32Array[],
): void {
  const channels = format.channels;
  const bits = format.bitsPerSample;
  const isFloat = format.isFloat;
  const bytesPerSample = bits >> 3;
  if (bytesPerSample <= 0) throw new Error(`Unsupported WAV: bitsPerSample=${bits}`);

  const clampUnit = (v: number): number => (v > 1 ? 1 : v < -1 ? -1 : v);

  for (let f = 0; f < frames; f++) {
    const frameOffset = f * format.blockAlign;
    const target = startFrame + f;
    for (let c = 0; c < channels; c++) {
      const o = frameOffset + c * bytesPerSample;
      let value: number;
      if (isFloat) {
        value = bits === 64 ? bytes.readDoubleLE(o) : bytes.readFloatLE(o);
        if (!Number.isFinite(value)) value = 0;
        value = clampUnit(value);
      } else if (bits === 8) {
        value = (bytes[o] - 128) / 128; // 8-bit PCM is unsigned
      } else if (bits === 16) {
        value = bytes.readInt16LE(o) / 32768;
      } else if (bits === 24) {
        const raw = bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16);
        value = (raw & 0x800000 ? raw - 0x1000000 : raw) / 8388608; // sign-extend 24-bit
      } else if (bits === 32) {
        value = bytes.readInt32LE(o) / 2147483648;
      } else {
        throw new Error(`Unsupported WAV: ${bits}-bit samples`);
      }
      out[c][target] = value;
    }
  }
}

/**
 * Decode to normalized Float32 per channel. Throws if the codec is unsupported.
 * `maxMs` limits how much is decoded (default: all).
 */
export async function decodeWav(filePath: string, opts: DecodeOptions = {}): Promise<DecodedAudio> {
  const handle = await open(filePath, 'r');
  try {
    const stat = await handle.stat();
    const read = makeFileReader(handle, stat.size);
    const data = await runWalkerAsync(stat.size, read);
    const { format } = data;

    if (data.bigEndian) {
      throw new Error('Big-endian (RIFX) WAV is not decodable by this decoder; convert it to RIFF first');
    }
    if (!isSupportedCodec(format, data.realFormatTag)) {
      throw new Error(
        `Unsupported WAV codec: audioFormat=${format.audioFormat}` +
          (format.isExtensible ? ` subFormat=${data.realFormatTag}` : '') +
          ` bits=${format.bitsPerSample}`,
      );
    }
    if (data.dataOffset < 0) throw new Error('Invalid WAV: missing "data" chunk');
    if (format.blockAlign <= 0) throw new Error('Invalid WAV: blockAlign is 0');

    const sampleRate = format.sampleRate;
    const channels = Math.max(1, format.channels);
    let frames = Math.floor(data.dataBytes / format.blockAlign);
    if (typeof opts.maxMs === 'number' && Number.isFinite(opts.maxMs)) {
      const maxFrames = Math.floor((sampleRate * Math.max(0, opts.maxMs)) / 1000);
      frames = Math.min(frames, maxFrames);
    }
    if (frames < 0 || !Number.isFinite(frames)) frames = 0;

    const out: Float32Array[] = [];
    for (let c = 0; c < channels; c++) out.push(new Float32Array(frames));

    // Stream the sample data in ~1 MiB blocks so huge files never need one giant allocation.
    const framesPerBlock = Math.max(1, Math.floor((1 << 20) / format.blockAlign));
    let done = 0;
    while (done < frames) {
      const count = Math.min(framesPerBlock, frames - done);
      const bytes = await read(data.dataOffset + done * format.blockAlign, count * format.blockAlign);
      const usable = Math.floor(bytes.length / format.blockAlign);
      if (usable <= 0) break;
      decodeBlock(bytes, format, done, Math.min(count, usable), out);
      if (usable < count) {
        // Truncated file: zero-fill the remainder instead of leaving it undefined.
        done += usable;
        break;
      }
      done += count;
    }

    if (opts.mono === true && channels > 1) {
      const mono = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) sum += out[c][i];
        const value = sum / channels;
        mono[i] = value > 1 ? 1 : value < -1 ? -1 : value;
      }
      return { sampleRate, channels: 1, data: [mono] };
    }

    return { sampleRate, channels, data: out };
  } finally {
    await handle.close();
  }
}

/* --------------------------------------------------------------------------------------------
 * FFT + DSP
 * ------------------------------------------------------------------------------------------ */

function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; (j & bit) !== 0; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < half; j++) {
        const a = i + j;
        const b = a + half;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

function monoMix(data: Float32Array[], frames: number): Float32Array {
  const channels = data.length;
  const mono = new Float32Array(frames);
  if (channels === 1) {
    mono.set(data[0].subarray(0, frames));
    return mono;
  }
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += data[c][i];
    mono[i] = sum / channels;
  }
  return mono;
}

function analyzeSpectrum(mono: Float32Array, sampleRate: number): { centroid: number; highRatio: number } {
  const n = FFT_SIZE;
  if (mono.length < 64 || sampleRate <= 0) return { centroid: 0, highRatio: 0 };

  const hann = new Float64Array(n);
  for (let i = 0; i < n; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));

  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const hop = n >> 1;
  const binHz = sampleRate / n;

  let centroidNum = 0;
  let centroidDen = 0;
  let hfNum = 0;
  let hfDen = 0;
  let windows = 0;

  for (let start = 0; start < mono.length; start += hop) {
    const available = Math.min(n, mono.length - start);
    if (windows > 0 && available < n) break; // ignore a ragged tail; zero-pad only short signals
    for (let i = 0; i < n; i++) {
      const sample = i < available ? mono[start + i] : 0;
      re[i] = sample * hann[i];
      im[i] = 0;
    }
    fftInPlace(re, im);

    for (let k = 1; k < n / 2; k++) {
      const rr = re[k];
      const ii = im[k];
      const power = rr * rr + ii * ii;
      const mag = Math.sqrt(power);
      const freq = k * binHz;
      centroidNum += freq * mag;
      centroidDen += mag;
      hfDen += power;
      if (freq > HIGH_FREQ_HZ) hfNum += power;
    }
    windows++;
  }

  if (windows === 0 || centroidDen <= 0) return { centroid: 0, highRatio: 0 };
  const centroid = centroidNum / centroidDen;
  const highRatio = hfDen > 0 ? hfNum / hfDen : 0;
  return {
    centroid: Number.isFinite(centroid) && centroid > 0 ? centroid : 0,
    highRatio: clamp(Number.isFinite(highRatio) ? highRatio : 0, 0, 1),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function vadHasActivity(mono: Float32Array, sampleRate: number): boolean {
  const frameSize = Math.max(1, Math.round(sampleRate * VAD_FRAME_SECONDS));
  const hop = Math.max(1, frameSize >> 1);
  if (mono.length < frameSize * 2) return false;

  const frames = Math.min(
    Math.floor((mono.length - frameSize) / hop) + 1,
    Math.max(1, Math.floor((sampleRate * VAD_MAX_SECONDS - frameSize) / hop) + 1),
  );
  if (frames < 2) return false;

  const rmsValues = new Float64Array(frames);
  const zcrValues = new Float64Array(frames);
  let rmsSum = 0;
  for (let f = 0; f < frames; f++) {
    const start = f * hop;
    let sumSq = 0;
    let crossings = 0;
    let previous = mono[start];
    for (let i = 0; i < frameSize; i++) {
      const sample = mono[start + i];
      sumSq += sample * sample;
      if (i > 0 && ((sample >= 0 && previous < 0) || (sample < 0 && previous >= 0))) crossings++;
      previous = sample;
    }
    const rms = Math.sqrt(sumSq / frameSize);
    rmsValues[f] = rms;
    zcrValues[f] = crossings / Math.max(1, frameSize - 1);
    rmsSum += rms;
  }

  const meanRms = rmsSum / frames;
  const energyThreshold = Math.max(0.01, meanRms * 0.35);
  let active = 0;
  for (let f = 0; f < frames; f++) {
    const zcr = zcrValues[f];
    if (rmsValues[f] >= energyThreshold && rmsValues[f] > 1e-4 && zcr >= 0.015 && zcr <= 0.4) active++;
  }
  return active / frames > 0.15;
}

function estimateTonality(mono: Float32Array, sampleRate: number): number {
  if (mono.length < 512 || sampleRate <= 0) return 0;

  // Pick the loudest contiguous segment so silence at the head does not dominate.
  const segmentLength = Math.min(TONALITY_SEGMENT, mono.length);
  let bestStart = 0;
  let bestEnergy = -1;
  const scanHop = Math.max(1, Math.min(4096, Math.floor(mono.length / 32) || 1));
  for (let start = 0; start < mono.length; start += scanHop) {
    const end = Math.min(mono.length, start + segmentLength);
    let energy = 0;
    for (let i = start; i < end; i++) energy += mono[i] * mono[i];
    if (energy > bestEnergy) {
      bestEnergy = energy;
      bestStart = start;
    }
  }

  const segEnd = Math.min(mono.length, bestStart + segmentLength);
  const length = segEnd - bestStart;
  if (length < 512) return 0;

  let mean = 0;
  for (let i = bestStart; i < segEnd; i++) mean += mono[i];
  mean /= length;

  const x = new Float64Array(length);
  for (let i = 0; i < length; i++) x[i] = mono[bestStart + i] - mean;

  const minLag = Math.max(2, Math.floor(sampleRate / 2000)); // <= 2 kHz
  const maxLag = Math.min(Math.floor(sampleRate / 50), length - 1); // >= 50 Hz
  if (maxLag <= minLag) return 0;

  const lagStep = Math.max(1, Math.ceil((maxLag - minLag) / TONALITY_MAX_LAGS));
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag += lagStep) {
    const limit = length - lag;
    let num = 0;
    let energyA = 0;
    let energyB = 0;
    for (let i = 0; i < limit; i++) {
      const a = x[i];
      const b = x[i + lag];
      num += a * b;
      energyA += a * a;
      energyB += b * b;
    }
    const den = Math.sqrt(energyA * energyB);
    if (den > 0) {
      const r = num / den;
      if (r > best) best = r;
    }
  }
  return clamp(best, 0, 1);
}

function stereoCorrelation(data: Float32Array[], frames: number): number {
  if (data.length < 2) return 1;
  const left = data[0];
  const right = data[1];
  let sumL = 0;
  let sumR = 0;
  for (let i = 0; i < frames; i++) {
    sumL += left[i];
    sumR += right[i];
  }
  const meanL = frames > 0 ? sumL / frames : 0;
  const meanR = frames > 0 ? sumR / frames : 0;

  let cov = 0;
  let varL = 0;
  let varR = 0;
  for (let i = 0; i < frames; i++) {
    const dl = left[i] - meanL;
    const dr = right[i] - meanR;
    cov += dl * dr;
    varL += dl * dl;
    varR += dr * dr;
  }
  const den = Math.sqrt(varL * varR);
  if (!(den > 0)) return 1; // one side (or both) is silent: treat as mono-compatible
  return clamp(cov / den, -1, 1);
}

function toDb(value: number): number {
  if (!(value > 0)) return DB_FLOOR;
  const db = 20 * Math.log10(value);
  return Number.isFinite(db) ? Math.max(DB_FLOOR, db) : DB_FLOOR;
}

function emptyFeatures(): DspFeatures {
  return {
    peak: 0,
    rms: 0,
    peakDb: DB_FLOOR,
    rmsDb: DB_FLOOR,
    decayMs: 0,
    spectralCentroidHz: 0,
    highFrequencyRatio: 0,
    stereoCorrelation: 1,
    hasVoiceLikeActivity: false,
    tonality: 0,
  };
}

/** DSP features. Pass mono or multi-channel float data. */
export function analyzeDsp(data: Float32Array[], sampleRate: number): DspFeatures {
  if (!Array.isArray(data) || data.length === 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    return emptyFeatures();
  }
  let frames = Infinity;
  for (const channel of data) frames = Math.min(frames, channel.length);
  frames = Math.floor(frames);
  if (!Number.isFinite(frames) || frames < 1) return emptyFeatures();

  const channels = data.length;
  let peak = 0;
  let peakFrame = 0;
  let sumSquares = 0;
  for (let c = 0; c < channels; c++) {
    const channel = data[c];
    for (let i = 0; i < frames; i++) {
      const sample = channel[i];
      if (!Number.isFinite(sample)) continue;
      const abs = sample < 0 ? -sample : sample;
      if (abs > peak) {
        peak = abs;
        peakFrame = i;
      }
      sumSquares += sample * sample;
    }
  }
  const rms = Math.sqrt(sumSquares / (frames * channels));
  const durationMs = (frames / sampleRate) * 1000;

  // Decay: RMS in 10 ms windows from the peak sample until it drops under 5% of the peak window.
  // Deliberately allocation-free (no full-length mix-down), so multi-hour files stay cheap.
  let decayMs = durationMs;
  const windowSize = Math.max(1, Math.round(sampleRate * DECAY_WINDOW_SECONDS));
  if (peakFrame + windowSize <= frames) {
    const reference = windowRmsMulti(data, peakFrame, windowSize, frames);
    if (!(reference > 0)) {
      decayMs = durationMs;
    } else {
      const threshold = reference * DECAY_RATIO;
      let found = -1;
      for (let start = peakFrame + windowSize; start < frames; start += windowSize) {
        const value = windowRmsMulti(data, start, Math.min(windowSize, frames - start), frames);
        if (value < threshold) {
          found = start;
          break;
        }
      }
      decayMs = found < 0 ? durationMs : ((found - peakFrame) / sampleRate) * 1000;
    }
  }
  decayMs = clamp(decayMs, 0, durationMs);

  // Spectrum / VAD / tonality are computed from at most the first 10 seconds of the mono mix.
  const analysisFrames = Math.min(frames, Math.max(1, Math.round(sampleRate * SPECTRUM_MAX_SECONDS)));
  const mono = monoMix(data, analysisFrames);
  const spectrum = analyzeSpectrum(mono, sampleRate);

  return {
    peak: clamp(peak, 0, 1),
    rms: clamp(Number.isFinite(rms) ? rms : 0, 0, 1),
    peakDb: toDb(peak),
    rmsDb: toDb(rms),
    decayMs,
    spectralCentroidHz: spectrum.centroid,
    highFrequencyRatio: spectrum.highRatio,
    stereoCorrelation: stereoCorrelation(data, frames),
    hasVoiceLikeActivity: vadHasActivity(mono, sampleRate),
    tonality: estimateTonality(mono, sampleRate),
  };
}

/** RMS across every channel of a frame window, without materializing a mix-down buffer. */
function windowRmsMulti(data: Float32Array[], start: number, length: number, frames: number): number {
  const end = Math.min(frames, start + length);
  const count = end - start;
  if (count <= 0 || data.length === 0) return 0;
  let sum = 0;
  for (let c = 0; c < data.length; c++) {
    const channel = data[c];
    for (let i = start; i < end; i++) {
      const sample = channel[i];
      if (Number.isFinite(sample)) sum += sample * sample;
    }
  }
  return Math.sqrt(sum / (count * data.length));
}

/* --------------------------------------------------------------------------------------------
 * Peak pyramid
 * ------------------------------------------------------------------------------------------ */

function scaleToInt16(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const scaled = Math.round(clamp(value, -1, 1) * 32767);
  return scaled < -32768 ? -32768 : scaled > 32767 ? 32767 : scaled;
}

/** Build a peak pyramid. Level 0 = `base` samples per bucket (default 256), each level 8x coarser. */
export function buildPeaks(data: Float32Array[], opts: BuildPeaksOptions = {}): PeakPyramid {
  const base = Math.max(1, Math.floor(opts.base ?? DEFAULT_BASE_BUCKET));
  const maxLevels = Math.max(1, Math.min(MAX_LEVELS, Math.floor(opts.levels ?? MAX_LEVELS)));
  const sampleRate = Number.isFinite(opts.sampleRate) ? Math.max(0, Math.floor(opts.sampleRate ?? 0)) : 0;
  const channels = Array.isArray(data) ? data.length : 0;

  let frames = 0;
  if (channels > 0) {
    frames = Infinity;
    for (const channel of data) frames = Math.min(frames, channel.length);
    frames = Number.isFinite(frames) ? Math.floor(frames) : 0;
  }

  const levels: PeakLevel[] = [];
  let samplesPerBucket = base;

  for (let level = 0; level < maxLevels; level++) {
    const buckets = frames > 0 ? Math.ceil(frames / samplesPerBucket) : 0;
    const stride = channels * 2;
    const store = new Int16Array(buckets * stride);

    if (level === 0) {
      for (let bucket = 0; bucket < buckets; bucket++) {
        const start = bucket * samplesPerBucket;
        const end = Math.min(frames, start + samplesPerBucket);
        for (let c = 0; c < channels; c++) {
          const channel = data[c];
          let min = Infinity;
          let max = -Infinity;
          for (let i = start; i < end; i++) {
            const sample = channel[i];
            if (sample < min) min = sample;
            if (sample > max) max = sample;
          }
          const offset = bucket * stride + c * 2;
          if (min === Infinity) {
            store[offset] = 0;
            store[offset + 1] = 0;
          } else {
            store[offset] = scaleToInt16(min);
            store[offset + 1] = scaleToInt16(max);
          }
        }
      }
    } else {
      const previous = levels[level - 1];
      const previousStride = channels * 2;
      for (let bucket = 0; bucket < buckets; bucket++) {
        const start = bucket * COARSEN_FACTOR;
        const end = Math.min(previous.buckets, start + COARSEN_FACTOR);
        for (let c = 0; c < channels; c++) {
          let min = Infinity;
          let max = -Infinity;
          for (let b = start; b < end; b++) {
            const offset = b * previousStride + c * 2;
            const lo = previous.data[offset];
            const hi = previous.data[offset + 1];
            if (lo < min) min = lo;
            if (hi > max) max = hi;
          }
          const offset = bucket * stride + c * 2;
          if (min === Infinity) {
            store[offset] = 0;
            store[offset + 1] = 0;
          } else {
            store[offset] = min;
            store[offset + 1] = max;
          }
        }
      }
    }

    levels.push({ samplesPerBucket, buckets, data: store });
    if (buckets <= 1) break;
    samplesPerBucket *= COARSEN_FACTOR;
  }

  return { sampleRate, channels, levels };
}

/** Serialize a pyramid to one compact little-endian binary buffer. */
export function serializePeaks(p: PeakPyramid): Buffer {
  const levels = Array.isArray(p.levels) ? p.levels : [];
  let total = PEAKS_HEADER_BYTES;
  for (const level of levels) total += PEAKS_LEVEL_HEADER_BYTES + level.data.length * 2;

  const out = Buffer.alloc(total);
  out.write(PEAKS_MAGIC, 0, 4, 'latin1');
  out.writeUInt16LE(PEAKS_VERSION, 4);
  out.writeUInt32LE(Math.max(0, Math.floor(p.sampleRate) || 0), 6);
  out.writeUInt16LE(clamp(Math.floor(p.channels) || 0, 0, 0xffff), 10);
  out.writeUInt16LE(clamp(levels.length, 0, 0xffff), 12);

  let offset = PEAKS_HEADER_BYTES;
  for (const level of levels) {
    out.writeUInt32LE(level.samplesPerBucket >>> 0, offset);
    out.writeUInt32LE(level.buckets >>> 0, offset + 4);
    out.writeUInt32LE(level.data.length * 2, offset + 8);
    offset += PEAKS_LEVEL_HEADER_BYTES;
    for (let i = 0; i < level.data.length; i++) {
      out.writeInt16LE(level.data[i], offset + i * 2);
    }
    offset += level.data.length * 2;
  }
  return out;
}

/** Deserialize a pyramid written by {@link serializePeaks}. */
export function deserializePeaks(buf: Buffer): PeakPyramid {
  if (!Buffer.isBuffer(buf)) throw new TypeError('deserializePeaks expects a Buffer');
  if (buf.length < PEAKS_HEADER_BYTES) throw new Error('Invalid peak pack: shorter than the 14-byte header');
  if (buf.toString('latin1', 0, 4) !== PEAKS_MAGIC) throw new Error('Invalid peak pack: bad magic (expected "SDPK")');
  const version = buf.readUInt16LE(4);
  if (version !== PEAKS_VERSION) throw new Error(`Unsupported peak pack version: ${version}`);
  const sampleRate = buf.readUInt32LE(6);
  const channels = buf.readUInt16LE(10);
  const levelCount = buf.readUInt16LE(12);

  const levels: PeakLevel[] = [];
  let offset = PEAKS_HEADER_BYTES;
  for (let i = 0; i < levelCount; i++) {
    if (offset + PEAKS_LEVEL_HEADER_BYTES > buf.length) throw new Error('Invalid peak pack: truncated level header');
    const samplesPerBucket = buf.readUInt32LE(offset);
    const buckets = buf.readUInt32LE(offset + 4);
    const byteLength = buf.readUInt32LE(offset + 8);
    offset += PEAKS_LEVEL_HEADER_BYTES;

    const samples = Math.floor(byteLength / 2);
    if (offset + byteLength > buf.length) throw new Error('Invalid peak pack: truncated level data');
    const store = new Int16Array(samples);
    for (let s = 0; s < samples; s++) store[s] = buf.readInt16LE(offset + s * 2);
    offset += byteLength;
    levels.push({ samplesPerBucket, buckets, data: store });
  }

  return { sampleRate, channels, levels };
}

/** Read the pyramid directly from a WAV file (decode + build). Convenience for the indexer. */
export async function peaksForFile(filePath: string, opts: { base?: number } = {}): Promise<PeakPyramid> {
  const decoded = await decodeWav(filePath);
  return buildPeaks(decoded.data, { base: opts.base, sampleRate: decoded.sampleRate });
}

/* -------------------------------------------------------------------------- */
/* Metadata writing                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Editing is a separate concern from parsing, so it lives in its own modules:
 * `writer.ts` is the pure byte-level RIFF rewriting; `writerFs.ts` adds the
 * backup / atomic-replace / verify-before-commit rules. Re-exported here so
 * consumers have a single entry point.
 */
export {
  locateChunks,
  rewriteRiff,
  buildBextPayload,
  buildInfoPayload,
  isInfoList,
} from './writer.js';
export type { MetadataEdit, RiffLayout, LocatedChunk } from './writer.js';

export {
  updateWavMetadata,
  updateWavMetadataFields,
  restoreFromBackup,
  hasBackup,
  isEditableWav,
  backupDirFor,
  backupPathFor,
  buildIxml,
} from './writerFs.js';
export type { UpdateOptions, UpdateResult } from './writerFs.js';
