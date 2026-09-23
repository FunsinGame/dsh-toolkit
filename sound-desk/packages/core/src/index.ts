export * from './types.js';
export * from './query.js';
export * from './rank.js';

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

/** Default page size for search results. */
export const DEFAULT_SEARCH_LIMIT = 60;
