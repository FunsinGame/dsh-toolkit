export * from './types.js';
export * from './query.js';
export * from './rank.js';
export * from './personalize.js';

export const SERVER_VERSION = '0.1.0';

/** Embedding dimensionality produced by the CLAP text/audio towers. */
export const EMBEDDING_DIM = 512;

/**
 * Below this cosine similarity a semantic hit is dropped rather than padded in.
 *
 * Calibrated by measurement, not intuition. On CLAP's shared space:
 *   ~0.35  a correct text→audio match for a related sound (e.g. "heavy rain on a
 *          roof" against a rain recording)
 *   ~0.2   loosely related
 *   ~0.0   unrelated (a door caption against rain)
 *
 * The first draft used 0.35 as this gate, which would have discarded every
 * genuine hit. 0.12 rejects the uncorrelated tail while letting weak-but-real
 * matches through, where the UI reports them with low confidence instead of
 * pretending they do not exist.
 */
export const SIMILARITY_THRESHOLD = 0.12;

/**
 * Cosine similarity of a text→audio match that is actually *right*, on CLAP's shared
 * space (see the calibration above).
 *
 * Exported so the UI can describe a similarity without inventing its own scale: below
 * this number a match is weak-but-real, above it the pair really is related. Reporting
 * "声音指纹相似度 62%" with no anchor invites the reader to compare it with a
 * percentage they expect to reach 100.
 */
export const STRONG_SIMILARITY = 0.35;

/** Default page size for search results. */
export const DEFAULT_SEARCH_LIMIT = 60;
