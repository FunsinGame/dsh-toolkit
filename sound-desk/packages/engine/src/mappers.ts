/**
 * Row → DTO mapping. Kept in one place so the API shape never leaks raw column
 * names, and so the "lite" list payload stays genuinely lite (no iXML blobs).
 */

import type {
  Asset,
  AssetSummary,
  AudioFormatInfo,
  ClassifyCandidate,
  DspFeatures,
  EmbeddedMetadata,
  IndexStage,
  UcsSource,
} from '@sounddesk/core';

type Row = Record<string, unknown>;

/**
 * Directory part of `filePath` relative to `root`, or '' when the file sits
 * directly in the root. Separators are normalised to '/' so the UI renders the
 * same string on every platform.
 */
function relativeDirOf(filePath: string, root: string): string {
  const normalizedFile = filePath.replace(/\\/g, '/');
  const normalizedRoot = root.replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalizedRoot || !normalizedFile.startsWith(normalizedRoot)) return '';
  const rest = normalizedFile.slice(normalizedRoot.length).replace(/^\/+/, '');
  const slash = rest.lastIndexOf('/');
  return slash > 0 ? rest.slice(0, slash) : '';
}


function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function bool(v: unknown): boolean {
  return v === 1 || v === true;
}

function json<T>(v: unknown, fallback: T): T {
  const s = str(v);
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function rowToSummary(row: Row): AssetSummary {
  return {
    id: Number(row.id),
    libraryId: Number(row.libraryId),
    filename: String(row.filename ?? ''),
    path: String(row.path ?? ''),
    ...(typeof row.libraryRoot === 'string' ? { relativeDir: relativeDirOf(String(row.path ?? ''), row.libraryRoot) } : {}),
    durationMs: num(row.durationMs),
    sampleRate: num(row.sampleRate),
    channels: num(row.channels),
    bitDepth: num(row.bitDepth),
    codec: str(row.codec),
    sizeBytes: Number(row.sizeBytes ?? 0),
    ucsCatId: str(row.ucsCatId),
    ucsConfidence: num(row.ucsConfidence),
    ucsSource: (str(row.ucsSource) as UcsSource | null) ?? null,
    tags: json<string[]>(row.tags, []),
    favorite: bool(row.favorite),
    rating: Number(row.rating ?? 0),
    stage: Number(row.stage ?? 0) as IndexStage,
    hasEmbedding: Number(row.stage ?? 0) >= 3,
    hasPeaks: bool(row.hasPeaks),
  };
}

export function rowToAsset(row: Row): Asset {
  const format: AudioFormatInfo | null =
    row.sampleRate === null || row.sampleRate === undefined
      ? null
      : {
          codec: String(row.codec ?? 'unknown'),
          sampleRate: Number(row.sampleRate),
          bitDepth: num(row.bitDepth),
          channels: Number(row.channels ?? 0),
          isFloat: bool(row.isFloat),
          audioFormatTag: num(row.audioFormatTag),
        };

  const hasEmbedded =
    row.emDescription !== null ||
    row.emIxml !== null ||
    row.hasBext === 1 ||
    row.emKeywords !== null;

  const embedded: EmbeddedMetadata | null = hasEmbedded
    ? {
        description: str(row.emDescription),
        keywords: json<string[] | null>(row.emKeywords, null),
        designer: str(row.emDesigner),
        recorder: str(row.emRecorder),
        copyright: str(row.emCopyright),
        library: str(row.emLibrary),
        originator: str(row.emOriginator),
        originationDate: str(row.emOriginationDate),
        project: str(row.emProject),
        scene: str(row.emScene),
        take: str(row.emTake),
        note: str(row.emNote),
        ixml: json<Record<string, string> | null>(row.emIxml, null),
        info: json<Record<string, string> | null>(row.emInfo, null),
        codingHistory: json<string[] | null>(row.emCodingHistory, null),
        hasBext: bool(row.hasBext),
        chunks: json<Array<{ id: string; size: number; offset: number }> | null>(row.chunks, null),
      }
    : null;

  const dsp: DspFeatures | null =
    row.dspPeakDb === null || row.dspPeakDb === undefined
      ? null
      : {
          // peakDb is not stored separately from peak; recover a monotonic value
          peak: row.dspPeakDb === null ? 0 : Math.pow(10, Number(row.dspPeakDb) / 20),
          rms: row.dspRmsDb === null ? 0 : Math.pow(10, Number(row.dspRmsDb) / 20),
          peakDb: Number(row.dspPeakDb ?? -144),
          rmsDb: Number(row.dspRmsDb ?? -144),
          decayMs: Number(row.dspDecayMs ?? 0),
          spectralCentroidHz: Number(row.dspCentroidHz ?? 0),
          highFrequencyRatio: Number(row.dspHfRatio ?? 0),
          stereoCorrelation: Number(row.dspStereoCorr ?? 1),
          hasVoiceLikeActivity: bool(row.dspHasVoice),
          tonality: Number(row.dspTonality ?? 0),
        };

  const alternatives = json<Array<{ catId: string; score: number; evidence: string }>>(row.ucsAlternatives, []);

  return {
    id: Number(row.id),
    libraryId: Number(row.libraryId),
    path: String(row.path ?? ''),
    filename: String(row.filename ?? ''),
    extension: String(row.extension ?? ''),
    sizeBytes: Number(row.sizeBytes ?? 0),
    mtimeMs: Number(row.mtimeMs ?? 0),
    contentHash: str(row.contentHash),
    durationMs: num(row.durationMs),
    format,
    embedded,
    dsp,
    ucsCatId: str(row.ucsCatId),
    ucsConfidence: num(row.ucsConfidence),
    ucsSource: (str(row.ucsSource) as UcsSource | null) ?? null,
    ucsAlternatives: alternatives.length > 0
      ? alternatives.map<ClassifyCandidate>((a) => ({
          catId: a.catId,
          category: '',
          subCategory: '',
          score: a.score,
          source: 'clap',
          evidence: a.evidence,
        }))
      : null,
    tags: json<string[]>(row.tags, []),
    favorite: bool(row.favorite),
    rating: Number(row.rating ?? 0),
    stage: Number(row.stage ?? 0) as IndexStage,
    hasEmbedding: Number(row.stage ?? 0) >= 3,
    hasPeaks: bool(row.hasPeaks),
    createdAt: Number(row.createdAt ?? 0),
    updatedAt: Number(row.updatedAt ?? 0),
    lastError: str(row.lastError),
  };
}
