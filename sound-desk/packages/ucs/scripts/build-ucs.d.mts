/**
 * Type declarations for `scripts/build-ucs.mjs`.
 *
 * The build script is plain JavaScript (it is run directly by Node, not
 * compiled), so TypeScript needs an explicit surface to type-check the tests
 * that import it. Keep this in sync with the exports in build-ucs.mjs.
 */

/** One parsed official UCS row, in dataset shape. */
export interface UcsBuildEntry {
  catId: string;
  category: string;
  subCategory: string;
  code: string;
  synonymsEn: string[];
  synonymsZh: string[];
  excludes: string[];
  explanation?: string;
}

export interface RowsToEntriesResult {
  entries: UcsBuildEntry[];
  headerIndex: Record<string, number>;
  headerFound: boolean;
  skipped: number;
}

export interface ApplyOverlayResult {
  zhLabels: number;
  zhSynonyms: number;
  unknown: string[];
}

/** Split delimited text into rows of cells (RFC-4180-ish: quotes, CRLF, BOM). */
export declare function parseDelimited(text: string, delimiter: string): string[][];

/** Guess the delimiter from the header line. */
export declare function detectDelimiter(text: string): string;

/** Turn parsed rows into dataset entries. */
export declare function rowsToEntries(rows: string[][]): RowsToEntriesResult;

/** `CRASH & DEBRIS` -> `Crash & Debris`. */
export declare function formatUcsLabel(raw: string): string;

/** Promote the subcategory's own words to the front of the synonym list. */
export declare function rankSynonyms(label: string, synonyms: string[]): string[];

/** Merge the curated Chinese overlay into entries, in place. */
export declare function applyOverlay(
  entries: UcsBuildEntry[],
  overlay: { categories?: Record<string, string>; catIds?: Record<string, unknown> },
): ApplyOverlayResult;

/** Hex SHA-256 of a UTF-8 string. */
export declare function sha256(text: string): string;

/** `ucs_v8.2.1.csv` -> `8.2.1`. */
export declare function inferVersion(sourcePath: string): string;

/**
 * Compare a freshly-built dataset description against what is on disk.
 * Returns the list of mismatches; empty means the file is up to date.
 */
export declare function compareGenerated(
  current: unknown,
  entries: UcsBuildEntry[],
  expected: { version: string; sourceSha256: string; complete: boolean },
): string[];

/** CLI entry point; returns a process exit code and never throws. */
export declare function main(argv?: string[]): Promise<number>;
