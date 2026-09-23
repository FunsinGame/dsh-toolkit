/**
 * Shared domain contract between the engine, the web UI and the VSCode extension.
 * Keep this file free of runtime dependencies — it is imported by every target,
 * including the browser bundle.
 */

export type IndexStage = 0 | 1 | 2 | 3 | 4;

export const IndexStage = {
  /** discovered, nothing read yet */
  Discovered: 0 as IndexStage,
  /** headers + embedded metadata read — browsable, keyword-searchable, playable */
  Metadata: 1 as IndexStage,
  /** waveform peak pyramid built */
  Waveform: 2 as IndexStage,
  /** audio embedding computed — semantic search covers this file */
  Embedded: 3 as IndexStage,
  /** auto-tagged + UCS-classified */
  Tagged: 4 as IndexStage,
};

export type UcsSource = 'filename' | 'ixml' | 'clap' | 'dsp-rule' | 'llm' | 'manual';

export type LibraryKind = 'local' | 'nas' | 'probe';

export interface Library {
  id: number;
  name: string;
  root: string;
  kind: LibraryKind;
  coverPath: string | null;
  createdAt: number;
  /** asset count, filled in by the API when listing */
  assetCount?: number;
}

export interface AudioFormatInfo {
  codec: string;
  sampleRate: number;
  bitDepth: number | null;
  channels: number;
  isFloat: boolean;
  audioFormatTag: number | null;
}

/** Everything we can read out of the file itself. Read-only: never written back except via an explicit edit call. */
export interface EmbeddedMetadata {
  description: string | null;
  keywords: string[] | null;
  designer: string | null;
  recorder: string | null;
  copyright: string | null;
  library: string | null;
  originator: string | null;
  originationDate: string | null;
  project: string | null;
  scene: string | null;
  take: string | null;
  note: string | null;
  /** the full flattened iXML map, for the details panel */
  ixml: Record<string, string> | null;
  /** LIST/INFO tags */
  info: Record<string, string> | null;
  codingHistory: string[] | null;
  /** audio has a bext chunk */
  hasBext: boolean;
  /** raw chunks discovered, for diagnostics */
  chunks: Array<{ id: string; size: number; offset: number }> | null;
}

export interface DspFeatures {
  /** absolute peak-to-peak amplitude in 0..1 */
  peak: number;
  rms: number;
  peakDb: number;
  rmsDb: number;
  decayMs: number;
  spectralCentroidHz: number;
  highFrequencyRatio: number;
  stereoCorrelation: number;
  hasVoiceLikeActivity: boolean;
  tonality: number;
}

export interface ClassifyCandidate {
  catId: string;
  category: string;
  subCategory: string;
  score: number;
  source: UcsSource;
  /** human-readable justification, e.g. "filename CatID", "iXML CATEGORY", "CLAP p=0.82" */
  evidence: string;
}

export interface Asset {
  id: number;
  libraryId: number;
  path: string;
  filename: string;
  extension: string;
  sizeBytes: number;
  mtimeMs: number;
  contentHash: string | null;

  durationMs: number | null;
  format: AudioFormatInfo | null;

  embedded: EmbeddedMetadata | null;
  dsp: DspFeatures | null;

  ucsCatId: string | null;
  ucsConfidence: number | null;
  ucsSource: UcsSource | null;
  /** alternative candidates kept for the "correct this" UI */
  ucsAlternatives: ClassifyCandidate[] | null;

  /** user tags — stored beside the original file, never inside it */
  tags: string[];
  favorite: boolean;
  rating: number;

  stage: IndexStage;
  hasEmbedding: boolean;
  hasPeaks: boolean;

  createdAt: number;
  updatedAt: number;
  lastError: string | null;
}

/** A lite row for list rendering: enough to draw the result list without loading metadata blobs. */
export interface AssetSummary {
  id: number;
  libraryId: number;
  filename: string;
  path: string;
  /**
   * Folder path relative to the library root, or '' when the file sits at the
   * root. Shown in result rows because real libraries reuse the same filename
   * across areas (`hero_highwayman/char_share_imp_sword.wav` vs
   * `en_weald/char_share_imp_sword.wav`), and the filename alone cannot tell
   * them apart.
   */
  relativeDir?: string;
  durationMs: number | null;
  sampleRate: number | null;
  channels: number | null;
  bitDepth: number | null;
  codec: string | null;
  sizeBytes: number;
  ucsCatId: string | null;
  ucsConfidence: number | null;
  ucsSource: UcsSource | null;
  tags: string[];
  favorite: boolean;
  rating: number;
  stage: IndexStage;
  hasEmbedding: boolean;
  hasPeaks: boolean;
}

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------

export type SearchMode = 'semantic' | 'keyword' | 'hybrid' | 'similar';

/** Which retriever produced a hit — surfaced in the UI so results stay explainable. */
export type Retriever = 'vector' | 'fts' | 'ucs' | 'struct' | 'probe';

export interface SearchFilters {
  libraryIds?: number[];
  ucsCatIds?: string[];
  categories?: string[];
  tags?: string[];
  /** inclusive */
  minDurationMs?: number;
  maxDurationMs?: number;
  sampleRates?: number[];
  channels?: number[];
  bitDepths?: number[];
  codecs?: string[];
  favoritesOnly?: boolean;
  minRating?: number;
  /** only assets whose index has progressed at least this far */
  minStage?: IndexStage;
}

export interface ParsedQuery {
  /** the raw string the user typed */
  raw: string;
  /** whitespace-separated terms that must all match (FTS AND) */
  required: string[];
  /** groups where any one term matches: `(gust* blow*)` */
  optionalGroups: string[][];
  /** term-leading `-` exclusions */
  excluded: string[];
  /** true when the query is a bare filename / has a known audio extension */
  looksLikeFilename: boolean;
  /** filename without extension, when looksLikeFilename */
  filenameHint?: string;
  /** a natural-language sentence rather than a keyword query — drives the semantic path */
  isNaturalLanguage: boolean;
}

export interface ScoreBreakdown {
  vector: number | null;
  fts: number | null;
  ucs: number | null;
  struct: number | null;
  /** each retriever's rank, 1-based, null when that retriever did not return the item */
  ranks: Partial<Record<Retriever, number>>;
  /** final fused score */
  final: number;
  /** 0..1 confidence derived from the retriever agreement */
  confidence: number;
}

export interface SearchHit {
  asset: AssetSummary;
  score: ScoreBreakdown;
  /** why this appeared — the rewritten caption and/or matched terms */
  highlights: string[];
}

export interface SearchRequest {
  q: string;
  mode?: SearchMode;
  filters?: SearchFilters;
  limit?: number;
  offset?: number;
  /** 'mean' compares whole-file embeddings, 'onset' compares first-window embeddings (better for impacts) */
  vectorField?: 'mean' | 'onset';
  /** query-by-example: an existing asset id to find similar sounds for */
  similarToAssetId?: number;
  /** optional time window for the probe/similarity query */
  probe?: { offsetMs?: number; durationMs?: number };
  /** include per-retriever diagnostics (dev / explain mode) */
  explain?: boolean;
}

export interface SearchResponse {
  hits: SearchHit[];
  total: number;
  tookMs: number;
  /** captions actually encoded, so the user can correct the rewrite */
  captionsUsed: string[];
  /** terms the rewriter could not translate */
  unmatchedTerms: string[];
  /** honest empty-ness: results were below the similarity threshold */
  belowThreshold: boolean;
  /**
   * True when semantic search was skipped (or only partly applied) because too
   * few assets have embeddings yet. The UI must say so rather than presenting a
   * keyword-only result set as if it were semantic.
   */
  semanticIncomplete?: boolean;
  diagnostics?: {
    perRetriever: Array<{ retriever: Retriever; candidates: number; tookMs: number }>;
    vectorCoverage: { embedded: number; total: number };
  };
}

// ---------------------------------------------------------------------------
// indexing jobs (pushed over WebSocket)
// ---------------------------------------------------------------------------

export type JobKind = 'scan' | 'waveform' | 'embed' | 'tag' | 'reindex' | 'classify';
export type JobState = 'queued' | 'running' | 'paused' | 'done' | 'failed' | 'cancelled';

export interface JobProgress {
  id: string;
  kind: JobKind;
  libraryId: number | null;
  state: JobState;
  total: number;
  done: number;
  failed: number;
  /** smoothed, ms */
  etaMs: number | null;
  currentPath: string | null;
  error: string | null;
  startedAt: number;
  updatedAt: number;
}

export interface StatsResponse {
  assets: number;
  byStage: Record<string, number>;
  byCategory: Array<{ category: string; count: number }>;
  /** assets that have an audio embedding (semantic search coverage) */
  embedded: number;
  /** assets with a cached waveform pyramid */
  peaks: number;
  totalBytes: number;
  libraries: number;
  dbBytes: number;
  modelsReady: boolean;
}

// ---------------------------------------------------------------------------
// WebSocket envelope
// ---------------------------------------------------------------------------

export type ServerEvent =
  | { type: 'hello'; serverVersion: string; capabilities: ServerCapabilities }
  | { type: 'job'; job: JobProgress }
  | { type: 'library.changed'; libraryId: number; assetCount: number }
  | { type: 'toast'; level: 'info' | 'warn' | 'error'; message: string };

export interface ServerCapabilities {
  semantic: boolean;
  embeddingModel: string | null;
  llmRewrite: boolean;
  waveform: boolean;
}

export type ClientEvent = { type: 'ping' } | { type: 'subscribe'; jobs: boolean };

// ---------------------------------------------------------------------------
// pluggable ML layer (phase P0-3). Implementations may be no-ops.
// ---------------------------------------------------------------------------

export interface EmbeddingResult {
  /** whole-file embedding, L2-normalized */
  mean: Float32Array;
  /** first-window embedding, L2-normalized — better recall for transient sounds */
  onset: Float32Array;
  /** optional sub-window matrix for slice/similar search */
  frames?: Float32Array[];
}

export interface Embedder {
  readonly id: string;
  readonly dim: number;
  readonly ready: boolean;
  embedText(texts: string[]): Promise<Float32Array[]>;
  embedAudio(samples: Float32Array, sampleRate: number): Promise<EmbeddingResult>;
}

export interface Classifier {
  readonly id: string;
  readonly ready: boolean;
  /** zero-shot scoring of one audio file against a candidate catId list */
  classify(samples: Float32Array, sampleRate: number, candidateCatIds: string[]): Promise<Array<{ catId: string; score: number }>>;
}
