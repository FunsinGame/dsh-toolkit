/**
 * Byte-level RIFF rewriting.
 *
 * Kept separate from the file-level operations in `writerFs.ts` so the
 * interesting part — building a correct RIFF container — is a pure function that
 * can be unit tested without touching a disk.
 *
 * Design constraints:
 *  - The audio bytes are **copied through untouched**. SoundDesk only ever edits
 *    metadata; a tool that silently resamples your library is not a tool you
 *    trust.
 *  - Chunk order is preserved, and unknown chunks (`cue `, `smpl`, `LIST`,
 *    `fact`, …) are carried over verbatim so other tools' data survives.
 *  - `bext`/`iXML`/`LIST-INFO` are replaced in place when present and inserted
 *    after `fmt ` when not, which is the order professional tools write.
 */

import type { BextChunk } from './index.ts';

/** A chunk located in the file: header offset + payload offset/size. */
export interface LocatedChunk {
  id: string;
  /** offset of the 4-byte chunk id */
  headerOffset: number;
  /** offset of the first payload byte */
  payloadOffset: number;
  /** declared payload size (may exceed the bytes actually present) */
  size: number;
  /** size rounded up to a word boundary, as stored in the file */
  paddedSize: number;
}

export interface RiffLayout {
  chunks: LocatedChunk[];
  /** total bytes covered from offset 0 to the end of the last chunk */
  endOffset: number;
}

export interface MetadataEdit {
  /** replace the bext block; `null` removes it, `undefined` leaves it untouched */
  bext?: BextChunk | null;
  /** replace the iXML block with this XML text; `null` removes it */
  ixml?: string | null;
  /** replace LIST/INFO tags; keys are the 4-character codes */
  info?: Record<string, string> | null;
}

export const BEXT_PAYLOAD_SIZE = 602;

/** Walk the chunk table of a RIFF/WAVE buffer. Does not read payloads. */
export function locateChunks(buffer: Buffer): RiffLayout {
  if (buffer.length < 12) throw new Error('file is too short to be a RIFF container');
  const magic = buffer.toString('ascii', 0, 4);
  if (magic === 'RIFX') throw new Error('big-endian (RIFX) files cannot be edited yet');
  if (magic !== 'RIFF') throw new Error(`not a RIFF container (found "${magic}")`);
  if (buffer.toString('ascii', 8, 12) !== 'WAVE') throw new Error('RIFF file is not WAVE');

  const chunks: LocatedChunk[] = [];
  let offset = 12;

  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('latin1', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const payloadOffset = offset + 8;
    const available = Math.min(size, Math.max(0, buffer.length - payloadOffset));
    const paddedSize = size + (size % 2);

    chunks.push({ id, headerOffset: offset, payloadOffset, size: available, paddedSize });
    // Advance by the *declared* size; a truncated final chunk ends the walk.
    offset = payloadOffset + paddedSize;
    if (payloadOffset + available >= buffer.length && size > available) break;
  }

  const last = chunks[chunks.length - 1];
  const endOffset = last ? last.payloadOffset + last.size + (last.size % 2) : 12;
  return { chunks, endOffset: Math.min(endOffset, buffer.length) };
}

/** True when the chunk id is one we are responsible for replacing. */
function isManagedChunk(id: string): boolean {
  return id === 'bext' || id === 'iXML' || id === 'LIST';
}

/** LIST chunks are only ours when they are INFO lists. */
export function isInfoList(buffer: Buffer, chunk: LocatedChunk): boolean {
  return chunk.id === 'LIST' && buffer.toString('ascii', chunk.payloadOffset, chunk.payloadOffset + 4) === 'INFO';
}

function buildChunk(id: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.write(id, 0, 'ascii');
  header.writeUInt32LE(payload.length, 4);
  const pad = payload.length % 2 === 1 ? Buffer.from([0]) : Buffer.alloc(0);
  return Buffer.concat([header, payload, pad]);
}

/** Fixed 602-byte BWF `bext` block. */
export function buildBextPayload(bext: BextChunk): Buffer {
  const payload = Buffer.alloc(BEXT_PAYLOAD_SIZE);
  payload.write(truncate(bext.description, 255), 0, 'latin1');
  payload.write(truncate(bext.originator, 31), 256, 'latin1');
  payload.write(truncate(bext.originatorReference, 31), 288, 'latin1');
  payload.write(truncate(bext.originationDate, 10), 320, 'latin1');
  payload.write(truncate(bext.originationTime, 8), 330, 'latin1');
  payload.writeUInt32LE(bext.timeReferenceLow >>> 0, 338);
  payload.writeUInt32LE(bext.timeReferenceHigh >>> 0, 342);
  const version = bext.version > 0 ? bext.version : 1;
  payload.writeUInt16LE(version, 346);

  // UMID: hex string back to 64 raw bytes
  const umid = Buffer.alloc(64);
  if (bext.umid) {
    const hex = bext.umid.replace(/[^0-9a-fA-F]/g, '');
    const bytes = Math.min(64, Math.floor(hex.length / 2));
    for (let i = 0; i < bytes; i += 1) {
      umid[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
  }
  umid.copy(payload, 348);

  if (version >= 2) {
    // loudnessValue etc. are represented in dB*100; -32768 means "not indicated"
    payload.writeInt16LE(bext.loudnessValue === undefined ? -32768 : Math.round(bext.loudnessValue * 100), 412);
  }

  // codingHistory is NUL-terminated ASCII from byte 602 in the real spec, which
  // means the chunk must grow beyond 602 bytes to hold it.
  const history = (bext.codingHistory ?? []).join('\r\n');
  if (history.length > 0) {
    const encoded = Buffer.from(`${history}\r\n`, 'latin1');
    return Buffer.concat([payload, encoded]);
  }
  return payload;
}

/** `LIST`/`INFO` with 4-character keys. */
export function buildInfoPayload(info: Record<string, string>): Buffer {
  const parts: Buffer[] = [Buffer.from('INFO', 'ascii')];
  for (const [key, value] of Object.entries(info)) {
    if (key.length !== 4) continue;
    const text = Buffer.from(`${value}\0`, 'latin1');
    parts.push(buildChunk(key, text));
  }
  return Buffer.concat(parts);
}

/**
 * Rebuild the container with `edit` applied.
 *
 * Single pass over the chunk table. Rewritten metadata is emitted at the spot
 * where the first metadata chunk appeared, or immediately before the audio when
 * the file had none — the order professional tools use, so a rewrite does not
 * shuffle the container.
 *
 * `audioPayload` is called for the `data` chunk so callers can stream the audio
 * instead of holding a whole recording in memory.
 */
export function rewriteRiff(
  original: Buffer,
  layout: RiffLayout,
  edit: MetadataEdit,
  audioPayload: Buffer | ((chunk: LocatedChunk) => Buffer),
): Buffer {
  const pieces: Buffer[] = [];

  const providesBext = edit.bext !== undefined;
  const providesIxml = edit.ixml !== undefined;
  const providesInfo = edit.info !== undefined;

  const emitBext = (): boolean => {
    if (!edit.bext) return false;
    pieces.push(buildChunk('bext', buildBextPayload(edit.bext)));
    return true;
  };
  const emitIxml = (): boolean => {
    if (!edit.ixml) return false;
    pieces.push(buildChunk('iXML', Buffer.from(edit.ixml, 'utf8')));
    return true;
  };
  const emitInfo = (): boolean => {
    if (!edit.info || Object.keys(edit.info).length === 0) return false;
    pieces.push(buildChunk('LIST', buildInfoPayload(edit.info)));
    return true;
  };
  const emitProvided = (): boolean => {
    let emitted = false;
    emitted = emitBext() || emitted;
    emitted = emitIxml() || emitted;
    emitted = emitInfo() || emitted;
    return emitted;
  };

  const isInfoListChunk = (chunk: LocatedChunk): boolean =>
    chunk.id === 'LIST' && isInfoList(original, chunk);

  const hasBext = layout.chunks.some((chunk) => chunk.id === 'bext');
  const hasIxml = layout.chunks.some((chunk) => chunk.id === 'iXML');
  const hasInfo = layout.chunks.some(isInfoListChunk);
  const dataIndex = layout.chunks.findIndex((chunk) => chunk.id === 'data');

  let metadataEmitted = false;

  for (let index = 0; index < layout.chunks.length; index += 1) {
    const chunk = layout.chunks[index]!;
    const isInfoList_ = isInfoListChunk(chunk);

    if (!metadataEmitted && !hasBext && !hasIxml && !hasInfo && index === dataIndex) {
      // No metadata section existed, so create one just before the audio.
      metadataEmitted = emitProvided();
    }

    // Each managed chunk is handled independently: replacing iXML must not
    // disturb a `bext` block or a LIST/INFO tag list that was not part of the edit.
    if (chunk.id === 'bext') {
      if (providesBext) {
        metadataEmitted = emitBext() || metadataEmitted;
        continue;
      }
      // otherwise fall through: carried over verbatim below
    } else if (chunk.id === 'iXML') {
      if (providesIxml) {
        metadataEmitted = emitIxml() || metadataEmitted;
        continue;
      }
    } else if (isInfoList_) {
      if (providesInfo) {
        metadataEmitted = emitInfo() || metadataEmitted;
        continue;
      }
    } else if (chunk.id === 'data') {
      const data = typeof audioPayload === 'function' ? audioPayload(chunk) : audioPayload;
      pieces.push(buildChunk('data', data));
      continue;
    }

    // carry through untouched, padding included
    pieces.push(original.subarray(chunk.headerOffset, chunk.payloadOffset + chunk.size + (chunk.size % 2)));
  }

  if (!metadataEmitted) emitProvided();

  const body = Buffer.concat(pieces);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(body.length, 4);
  header.write('WAVE', 8, 'ascii');
  return Buffer.concat([header, body]);
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

export { isManagedChunk };
