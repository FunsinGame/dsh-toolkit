/**
 * Peak cache access.
 *
 * Peaks are stored per asset in a `.peaks` pack file under the data dir, never
 * next to the user's audio. That matters for the NAS case: the cache lives on
 * local disk so scrubbing a waveform never re-reads over the network. If the
 * cache is missing we build it on demand (and remember it) rather than failing.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { buildPeaks, decodeWav, serializePeaks } from '@sounddesk/audio-wav';

import type { Catalog } from './db.js';

/**
 * Returns the serialized peak pyramid for an asset, building it if needed.
 * Returns null when the file cannot be decoded (e.g. a codec we do not handle
 * yet), which the UI renders as "waveform unavailable" instead of an error.
 */
export async function streamPeaksFor(catalog: Catalog, assetId: number): Promise<Buffer | null> {
  const row = catalog.getAssetRow(assetId);
  if (!row) return null;

  const cached = typeof row.peaksPath === 'string' && row.peaksPath.length > 0 ? row.peaksPath : null;
  if (cached) {
    const buf = await readFile(cached).catch(() => null);
    if (buf) return buf;
  }

  const filePath = typeof row.path === 'string' ? row.path : null;
  if (!filePath) return null;
  if (!/\.(wav|bwf|wave)$/i.test(filePath)) return null;

  let buffer: Buffer;
  try {
    const decoded = await decodeWav(filePath, { maxMs: 10 * 60 * 1000 });
    const peaks = buildPeaks(decoded.data, { sampleRate: decoded.sampleRate });
    buffer = serializePeaks(peaks);
  } catch {
    return null;
  }

  const dir = path.join(catalog.dataDir, 'peaks');
  const target = path.join(dir, `${assetId}.peaks`);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(target, buffer);
    catalog.markPeaks(assetId, target);
  } catch {
    // Cache write failure is not fatal — still serve the buffer we just built.
    void dir;
  }
  return buffer;
}
