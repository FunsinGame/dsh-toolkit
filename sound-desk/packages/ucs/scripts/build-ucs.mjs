#!/usr/bin/env node
/**
 * scripts/build-ucs.mjs — build the UCS dataset from the official list.
 *
 * WHAT THIS DOES
 *   Turns the official Universal Category System (UCS) spreadsheet export into
 *   `data/categories.generated.json`, which `src/index.ts` prefers over the
 *   curated `data/categories.seed.json` whenever it exists.
 *
 * OFFICIAL SOURCE
 *   Project / spec ......... https://universalcategorysystem.com/
 *   Resource hub ........... https://resources.universalcategorysystem.com/
 *   Current list (v8.2.1) .. https://github.com/jmrsound/ucs-tools
 *                            -> src/ucs_tools/data/ucs_v8.2.1.csv
 *   The hub itself serves the list through Dropbox/Google Sheets, which is not a
 *   stable, scriptable HTTP endpoint, so this repo vendors the file it was built
 *   from at `data/ucs_v8.2.1.csv` and pins it by SHA-256. Provenance and licence
 *   notes live in `data/PROVENANCE.md`.
 *
 * COMMANDS
 *   node scripts/build-ucs.mjs                 # build from data/ucs_v8.2.1.csv (verified)
 *   node scripts/build-ucs.mjs --check         # verify only; write nothing, exit 1 on drift
 *   node scripts/build-ucs.mjs --source x.csv  # build from another export
 *   node scripts/build-ucs.mjs --help
 *
 * FLAGS
 *   -s, --source <path|url>   input CSV/TSV (default: data/ucs_v8.2.1.csv)
 *   -o, --out <path>          output JSON (default: data/categories.generated.json)
 *   -v, --version <ver>       dataset version string (default: inferred from filename)
 *   -c, --check               verification mode: no writes, non-zero exit on drift
 *       --allow-unpinned      accept a source whose SHA-256 is not the recorded one
 *       --allow-partial       write even when the row-count check fails
 *       --list                print a per-category summary and exit
 *   -h, --help                usage
 *
 * EXIT CODES
 *   0  built (or verified) successfully
 *   0  --help
 *   1  bad CLI usage, unreadable source, unpinned source without --allow-unpinned,
 *      failed row-count check without --allow-partial, or --check found drift
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(SCRIPT_DIR, '..');
const DATA_DIR = path.join(PKG_ROOT, 'data');
const SEED_PATH = path.join(DATA_DIR, 'categories.seed.json');
const OVERLAY_PATH = path.join(DATA_DIR, 'curated-zh.json');
const DEFAULT_SOURCE = path.join(DATA_DIR, 'ucs_v8.2.1.csv');
const DEFAULT_OUT = path.join(DATA_DIR, 'categories.generated.json');
const CATALOG_PATH = path.join(DATA_DIR, 'official-catalog.json');

/**
 * The vendored official list and the row counts it must produce. `complete` is
 * only ever true when the parsed rows match a pinned catalogue exactly — a
 * guessed ">= 1000 rows" threshold would be wrong, because the real UCS 8.2.1
 * list has 753 subcategories, not 1000+.
 */
const PINNED = {
  version: '8.2.1',
  file: 'ucs_v8.2.1.csv',
  /** Subcategory rows in the official list (header excluded). */
  rows: 753,
  /** Distinct top-level UCS categories (the `Category` column). */
  categories: 82,
  /** SHA-256 of data/ucs_v8.2.1.csv exactly as vendored in this repo. */
  sha256: 'aebc8bf4f8b0dd7cafc1231c25b6664250087ab1acb8d4e6ed18ef8bf9d47986',
};

/**
 * Category-name normalisation for comparison: the official `Category` column is
 * upper-case, but a hand-edited export may not be.
 */
function normCategory(value) {
  return String(value ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
}

const HEADER_ALIASES = {
  category: ['category', 'category name', 'cat name', 'top category', 'main category', 'category code'],
  subCategory: ['subcategory', 'sub category', 'sub-category', 'sub cat', 'subcategory name', 'sub'],
  catId: ['catid', 'cat id', 'cat-id', 'id', 'ucs id', 'ucc id'],
  catShort: ['catshort', 'cat short', 'cat-short', 'short code', 'category short', 'code'],
  explanation: ['explanations', 'explanation', 'description', 'definition', 'notes', 'comment'],
  synonyms: ['synonyms', 'synonym', 'synonymes', 'keywords', 'search terms', 'index words'],
  excludes: ['excludes', 'exclude', 'exclusion', 'exclusions', 'not', 'do not use'],
};

/* ------------------------------------------------------------------ CLI --- */

function parseArgs(argv) {
  const args = {
    source: undefined,
    version: undefined,
    out: DEFAULT_OUT,
    check: false,
    allowUnpinned: false,
    allowPartial: false,
    list: false,
    printHash: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const take = (name) => {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${name} requires a value`);
      return value;
    };
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--check') args.check = true;
    else if (arg === '--allow-unpinned') args.allowUnpinned = true;
    else if (arg === '--allow-partial') args.allowPartial = true;
    else if (arg === '--list') args.list = true;
    else if (arg === '--print-hash') args.printHash = true;
    else if (arg === '--source' || arg === '-s') args.source = take(arg);
    else if (arg.startsWith('--source=')) args.source = arg.slice('--source='.length);
    else if (arg === '--version' || arg === '-v') args.version = take(arg);
    else if (arg.startsWith('--version=')) args.version = arg.slice('--version='.length);
    else if (arg === '--out' || arg === '-o') args.out = path.resolve(process.cwd(), take(arg));
    else if (arg.startsWith('--out=')) args.out = path.resolve(process.cwd(), arg.slice('--out='.length));
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function printInstructions() {
  console.log(
    [
      '',
      'UCS dataset build',
      '',
      `  default source : ${path.relative(PKG_ROOT, DEFAULT_SOURCE)}`,
      `  default output : ${path.relative(PKG_ROOT, DEFAULT_OUT)}`,
      '',
      'Commands:',
      '  node scripts/build-ucs.mjs                  build (verifies the pinned source first)',
      '  node scripts/build-ucs.mjs --check          verify only; no writes; exit 1 on drift',
      '  node scripts/build-ucs.mjs --list           per-category summary',
      '  node scripts/build-ucs.mjs --source x.csv   build from a different export',
      '',
      'To refresh from a newly published official list:',
      '  1. download the UCS CSV from https://resources.universalcategorysystem.com/',
      '  2. replace data/ucs_v8.2.1.csv (or pass --source)',
      '  3. run with --allow-unpinned, then update PINNED in this script (rows, categories, sha256)',
      '',
      'Recognised headers (tolerant, case/spacing insensitive):',
      `  Category   : ${HEADER_ALIASES.category.join(', ')}`,
      `  SubCategory: ${HEADER_ALIASES.subCategory.join(', ')}`,
      `  CatID      : ${HEADER_ALIASES.catId.join(', ')}`,
      `  CatShort   : ${HEADER_ALIASES.catShort.join(', ')}`,
      `  Explanations: ${HEADER_ALIASES.explanation.join(', ')}`,
      `  Synonyms   : ${HEADER_ALIASES.synonyms.join(', ')}`,
      '',
    ].join('\n'),
  );
}

/* --------------------------------------------------------------- parsing --- */

/**
 * Minimal, correct RFC-4180-style delimited parser.
 * Handles: quoted fields, escaped "" quotes, embedded delimiters/newlines,
 * CRLF, a UTF-8 BOM, and a trailing newline. Returns an array of string rows.
 */
export function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  while (i < src.length) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r') {
      if (src[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  row.push(field);
  rows.push(row);

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

/** Guess the delimiter from the header line (tab wins over comma over semicolon). */
export function detectDelimiter(text) {
  const headerLine = text.split(/\r?\n/, 1)[0] ?? '';
  const tabs = (headerLine.match(/\t/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  const semis = (headerLine.match(/;/g) ?? []).length;
  if (tabs >= commas && tabs >= semis && tabs > 0) return '\t';
  if (semis > commas) return ';';
  return ',';
}

function normalizeHeader(cell) {
  return String(cell ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./]+/g, '');
}

function mapHeaders(headerRow) {
  const index = {};
  const normalized = headerRow.map(normalizeHeader);
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      const at = normalized.indexOf(normalizeHeader(alias));
      if (at !== -1) {
        index[key] = at;
        break;
      }
    }
  }
  return index;
}

function splitList(value) {
  if (value === undefined || value === null) return [];
  return String(value)
    .split(/[;,/|\n]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Human-readable subcategory label from the official SHOUTY-CASE form:
 * `WOOD` -> `Wood`, `CRASH & DEBRIS` -> `Crash & Debris`, `HITECH` -> `Hitech`.
 * The official spreadsheet only ships the shouty form; the compressed spelling
 * used inside CatID (`Crsh`, `Hndl`) is NOT a label, so it is never used here.
 */
export function formatUcsLabel(raw) {
  const source = String(raw ?? '').trim();
  if (source.length === 0) return '';
  // Preserve SHOUTY all-caps tokens, split the rest on separators.
  return source
    .split(/(\s+|[-_/])/)
    .map((token) => {
      if (token.length === 0 || /^[\s\-_/]+$/.test(token)) return token;
      const lower = token.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
}

/**
 * Parse rows into dataset entries.
 *
 * `code` comes from the official `CatShort` column when present, because the
 * CatID's leading upper-case run is NOT always the category code
 * (`BOATSail` -> `BOAT`, `DSGNRmbl` -> `DSGN`, `AMBAir` -> `AMB`).
 */
export function rowsToEntries(rows) {
  if (rows.length === 0) return { entries: [], headerIndex: {}, headerFound: false, skipped: 0 };

  const headerIndex = mapHeaders(rows[0]);
  const headerFound = headerIndex.category !== undefined || headerIndex.catId !== undefined;
  const body = headerFound ? rows.slice(1) : rows;
  const index = headerFound
    ? headerIndex
    : { category: 0, subCategory: 1, catId: 2, catShort: 3, explanation: 4, synonyms: 5 };

  const cell = (row, key) => (index[key] === undefined ? '' : String(row[index[key]] ?? '').trim());

  const entries = [];
  let skipped = 0;
  for (const row of body) {
    const category = normCategory(cell(row, 'category'));
    const subRaw = cell(row, 'subCategory');
    let catId = cell(row, 'catId');
    const catShort = normCategory(cell(row, 'catShort'));

    if (!catId) catId = `${catShort || category}${formatUcsLabel(subRaw).replace(/[^A-Za-z0-9]+/g, '')}`;
    catId = catId.replace(/[^A-Za-z0-9]+/g, '');

    if (!category || !catId || !/^[A-Za-z][A-Za-z0-9]*$/.test(catId)) {
      skipped += 1;
      continue;
    }

    // Official CatIDs are CatShort + compressed subcategory. Anything left over
    // (or, for the ARCHIVED group, nothing at all) becomes the label.
    const derivedCode = /^[A-Z]+/.exec(catId)?.[0] ?? category;
    const code = catShort || derivedCode;
    const tail = catId.startsWith(code) ? catId.slice(code.length) : '';
    const label = formatUcsLabel(subRaw) || tail || category;

    const synonymsEn = splitList(cell(row, 'synonyms'));
    const excludes = splitList(cell(row, 'excludes'));

    // Make sure the subcategory's own name is searchable even when the official
    // synonym list omits it (e.g. DOORS/WOOD ships "Wood" but DOORS/CREAK's list
    // does not reliably lead with "Creak").
    const labelWord = label.toLowerCase();
    const ordered = rankSynonyms(label, synonymsEn);
    if (labelWord.length >= 3 && !ordered.some((t) => t.toLowerCase() === labelWord)) {
      ordered.unshift(labelWord);
    }

    const entry = {
      catId,
      category,
      subCategory: label,
      code,
      synonymsEn: ordered.length > 0 ? ordered.slice(0, 12) : [labelWord],
      synonymsZh: [],
      excludes: excludes.slice(0, 6),
    };
    const explanation = cell(row, 'explanation');
    if (explanation) entry.explanation = explanation;
    entries.push(entry);
  }
  return { entries, headerIndex: index, headerFound, skipped };
}

/* --------------------------------------------------------------- sources --- */

export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

async function readSource(source) {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source, { redirect: 'follow' });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    return await response.text();
  }
  return await readFile(path.resolve(process.cwd(), source), 'utf8');
}

/** Infer `8.2.1` from `ucs_v8.2.1.csv`, else fall back to the pinned version. */
export function inferVersion(sourcePath) {
  const m = /(\d+\.\d+(?:\.\d+)*)/.exec(path.basename(String(sourcePath ?? '')));
  return m ? m[1] : PINNED.version;
}

/* ------------------------------------------------------------ curated zh --- */

/**
 * The curated overlay (`data/curated-zh.json`) supplements the official list
 * with hand-written Chinese display names and search synonyms. It is keyed by
 * OFFICIAL CatID / category code, so it can never reintroduce an invented CatID.
 */
async function loadOverlay() {
  if (!existsSync(OVERLAY_PATH)) return { categories: {}, catIds: {} };
  try {
    const parsed = JSON.parse(await readFile(OVERLAY_PATH, 'utf8'));
    return {
      categories: parsed.categories && typeof parsed.categories === 'object' ? parsed.categories : {},
      catIds: parsed.catIds && typeof parsed.catIds === 'object' ? parsed.catIds : {},
    };
  } catch (error) {
    console.warn(`[build-ucs] could not read ${path.relative(PKG_ROOT, OVERLAY_PATH)}: ${error.message}`);
    return { categories: {}, catIds: {} };
  }
}

function splitOverlayList(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return splitList(value);
}

/**
 * Apply the curated Chinese overlay. Only entries that exist in the official
 * list can be touched, and the overlay may never add or rename a CatID.
 *
 * The curated label and synonyms are PREPENDED, because `src/index.ts` only
 * reads the first few synonyms per entry when building the Chinese query
 * dictionary (`zhLookup`). The official list is alphabetically sorted and is
 * therefore a poor prefix — leaving it in front would hide terms like 太鼓
 * behind "Bass", "Beat", "Block".
 */
export function applyOverlay(entries, overlay) {
  let zhLabels = 0;
  let zhSynonyms = 0;
  const perCatId = overlay.catIds ?? {};
  const known = new Set(entries.map((e) => e.catId));

  for (const entry of entries) {
    const curated = perCatId[entry.catId];
    if (curated && typeof curated === 'object') {
      const front = [];
      if (typeof curated.label === 'string' && curated.label.trim()) {
        front.push(curated.label.trim());
        zhLabels += 1;
      }
      for (const extra of splitOverlayList(curated.zh)) {
        if (!front.includes(extra)) {
          front.push(extra);
          zhSynonyms += 1;
        }
      }
      if (front.length > 0) {
        entry.synonymsZh = [...front, ...entry.synonymsZh.filter((v) => !front.includes(v))];
      }
      const curatedExcludes = splitOverlayList(curated.excludes);
      if (curatedExcludes.length > 0) entry.excludes = curatedExcludes.slice(0, 6);
    }
  }

  const unknown = Object.keys(perCatId).filter((id) => !known.has(id));
  return { zhLabels, zhSynonyms, unknown };
}

/* ----------------------------------------------------------------- merge --- */

async function loadSeed() {
  if (!existsSync(SEED_PATH)) {
    return { version: '0.0.0', complete: false, generatedAt: '', categories: [] };
  }
  try {
    const parsed = JSON.parse(await readFile(SEED_PATH, 'utf8'));
    if (!Array.isArray(parsed.categories)) parsed.categories = [];
    return parsed;
  } catch (error) {
    console.warn(`[build-ucs] could not read seed (${error.message}); continuing with official rows only.`);
    return { version: '0.0.0', complete: false, generatedAt: '', categories: [] };
  }
}

/**
 * Order the official synonym list so the most broadly useful terms come first.
 *
 * The official spreadsheet lists synonyms alphabetically, which is a bad ranking
 * for search: the Chinese query rewriter reads only the first few English terms
 * of an entry, and for e.g. MUSICAL/PERCUSSION the alphabetically-first terms
 * are "Bass", "Beat", "Block", "Bongo" — none of which says "percussion". The
 * subcategory's own words are therefore promoted to the front, then shorter
 * terms, keeping the official order as the tie-break.
 */
export function rankSynonyms(label, synonyms) {
  const labelTokens = new Set(
    String(label ?? '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3),
  );
  return synonyms
    .map((term, index) => {
      const lower = term.toLowerCase();
      const inLabel = labelTokens.has(lower);
      return { term, index, inLabel };
    })
    .sort((a, b) => {
      if (a.inLabel !== b.inLabel) return a.inLabel ? -1 : 1;
      if (a.inLabel && b.inLabel && a.term.length !== b.term.length) return a.term.length - b.term.length;
      return a.index - b.index;
    })
    .map((item) => item.term);
}

function summarize(entries) {
  const categories = new Map();
  let withZh = 0;
  let withExplanation = 0;
  for (const entry of entries) {
    categories.set(entry.category, (categories.get(entry.category) ?? 0) + 1);
    if (entry.synonymsZh.length > 0) withZh += 1;
    if (entry.explanation) withExplanation += 1;
  }
  return { categories, withZh, withExplanation };
}

/* ------------------------------------------------------------------ main --- */

/** Main entry. Returns a process exit code; never throws. */
export async function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(`[build-ucs] ${error instanceof Error ? error.message : String(error)}`);
    console.error('[build-ucs] run `node scripts/build-ucs.mjs --help` for usage.');
    return 1;
  }
  if (args.help) {
    printInstructions();
    return 0;
  }

  const source = args.source ?? DEFAULT_SOURCE;
  const isDefaultSource = path.resolve(process.cwd(), source) === path.resolve(DEFAULT_SOURCE);

  let text;
  try {
    text = await readSource(source);
  } catch (error) {
    console.error(`[build-ucs] could not read source "${source}": ${error.message}`);
    if (isDefaultSource) {
      console.error('[build-ucs] the vendored official list is missing. Restore it from');
      console.error('            https://github.com/jmrsound/ucs-tools (src/ucs_tools/data/ucs_v8.2.1.csv)');
      console.error('            or pass --source with your own export.');
    }
    return 1;
  }

  const digest = sha256(text);
  const pinnedMatch = digest === PINNED.sha256;
  if (args.printHash) {
    // Used when refreshing PINNED for a newly published official list.
    console.log(digest);
    return 0;
  }
  if (isDefaultSource && !pinnedMatch && !args.allowUnpinned) {
    console.error('[build-ucs] SOURCE INTEGRITY CHECK FAILED');
    console.error(`[build-ucs]   expected sha256 ${PINNED.sha256}`);
    console.error(`[build-ucs]   actual   sha256 ${digest}`);
    console.error('[build-ucs] refusing to build from a modified pinned source.');
    console.error('[build-ucs] pass --allow-unpinned if you intentionally replaced the file.');
    return 1;
  }

  const rows = parseDelimited(text, detectDelimiter(text));
  const { entries, skipped, headerFound } = rowsToEntries(rows);
  if (entries.length === 0) {
    console.error('[build-ucs] parsed 0 usable UCS rows — check the header names and delimiter.');
    console.error(`[build-ucs] first row seen: ${JSON.stringify((rows[0] ?? []).slice(0, 8))}`);
    return 1;
  }

  const version = String(args.version ?? inferVersion(source));
  const officialCategories = new Set(entries.map((e) => e.category));
  const structuralOk = entries.length === PINNED.rows && officialCategories.size === PINNED.categories;
  // `complete` asserts "this dataset is the unmodified official list for the
  // declared version". A --allow-unpinned build waives the integrity check, so
  // it must not be able to claim completeness.
  const unverified = isDefaultSource && !pinnedMatch;
  const complete = structuralOk && !unverified && skipped === 0;

  if (args.list) {
    const { categories, withZh } = summarize(entries);
    console.log(`[build-ucs] ${entries.length} subcategories in ${categories.size} categories (version ${version})`);
    console.log(`[build-ucs] curated Chinese coverage: ${withZh}/${entries.length}`);
    for (const [name, count] of [...categories.entries()].sort()) {
      console.log(`  ${name.padEnd(22)} ${String(count).padStart(3)}`);
    }
    return 0;
  }

  if (args.check) {
    if (!existsSync(DEFAULT_OUT)) {
      console.error(`[build-ucs] ${path.relative(PKG_ROOT, DEFAULT_OUT)} does not exist — run without --check first.`);
      return 1;
    }
    const current = JSON.parse(await readFile(DEFAULT_OUT, 'utf8'));
    const problems = [];
    if (current.version !== version) problems.push(`version ${current.version} != ${version}`);
    if (current.sourceSha256 !== digest) {
      problems.push(`sourceSha256 ${current.sourceSha256 ?? '(none)'} != ${digest}`);
    }
    if (!Array.isArray(current.categories) || current.categories.length !== entries.length) {
      problems.push(`category count ${current.categories?.length ?? 0} != ${entries.length}`);
    }
    const currentIds = new Set((current.categories ?? []).map((c) => c.catId));
    const missing = entries.filter((e) => !currentIds.has(e.catId));
    if (missing.length > 0) problems.push(`${missing.length} official CatIDs missing (e.g. ${missing[0].catId})`);
    if (problems.length > 0) {
      console.error('[build-ucs] CHECK FAILED — generated dataset is out of date:');
      for (const p of problems) console.error(`[build-ucs]   - ${p}`);
      console.error('[build-ucs] run `node scripts/build-ucs.mjs` to regenerate.');
      return 1;
    }
    console.log(
      `[build-ucs] OK: ${path.relative(PKG_ROOT, DEFAULT_OUT)} matches ${entries.length} official rows ` +
        `(version ${version}, sha256 ${digest.slice(0, 12)}…)`,
    );
    return 0;
  }

  if (!structuralOk && !args.allowPartial) {
    console.error('[build-ucs] ROW-COUNT CHECK FAILED');
    console.error(`[build-ucs]   parsed   : ${entries.length} rows / ${officialCategories.size} categories`);
    console.error(`[build-ucs]   expected : ${PINNED.rows} rows / ${PINNED.categories} categories (UCS v${PINNED.version})`);
    console.error('[build-ucs] the export is incomplete or a different UCS version.');
    console.error('[build-ucs] pass --allow-partial to write an explicitly incomplete dataset.');
    return 1;
  }

  const seed = await loadSeed();
  const overlay = await loadOverlay();
  const { zhLabels, zhSynonyms, unknown } = applyOverlay(entries, overlay);
  if (unknown.length > 0) {
    console.warn(`[build-ucs] ${unknown.length} curated CatID(s) are not in the official list and were ignored:`);
    console.warn(`[build-ucs]   ${unknown.slice(0, 8).join(', ')}${unknown.length > 8 ? ', …' : ''}`);
  }

  // Report which curated seed entries the official list supersedes. Their
  // CatIDs were hand-invented and do NOT exist in the real UCS, so they are
  // dropped rather than merged — an invalid CatID in the dataset would be
  // offered to the user and written into filenames.
  const seedIds = new Set(seed.categories.map((c) => c?.catId).filter((id) => typeof id === 'string'));
  const superseded = entries.filter((e) => seedIds.has(e.catId)).length;
  const droppedSeed = seedIds.size - superseded;

  const { categories: byCategory, withZh, withExplanation } = summarize(entries);
  const out = {
    version,
    complete,
    generatedAt: new Date().toISOString(),
    note: complete
      ? `Official UCS v${version} list (${entries.length} subcategories across ${byCategory.size} categories), ` +
        `generated by scripts/build-ucs.mjs. CatIDs are authoritative.`
      : `INCOMPLETE parse of ${source} by scripts/build-ucs.mjs (${entries.length} rows).`,
    source: path.basename(source),
    sourceSha256: digest,
    sourceVerified: !unverified,
    sourceRows: entries.length,
    expectedRows: PINNED.rows,
    expectedCategories: PINNED.categories,
    skippedRows: skipped,
    headerFound,
    officialCategories: byCategory.size,
    curatedZh: { labels: zhLabels, synonyms: zhSynonyms },
    coverage: { withChineseSynonyms: withZh, withExplanation },
    droppedSeedCatIds: droppedSeed,
    categories: entries,
  };

  await writeFile(args.out, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(
    `[build-ucs] wrote ${path.relative(PKG_ROOT, args.out)}: ${entries.length} subcategories / ${byCategory.size} categories ` +
      `(complete=${complete}, skipped=${skipped})`,
  );
  console.log(
    `[build-ucs] curated Chinese: ${zhLabels} labels, ${zhSynonyms} extra synonyms -> ${withZh}/${entries.length} entries have Chinese`,
  );
  console.log(`[build-ucs] dropped ${droppedSeed} curated seed CatID(s) that are not real UCS IDs; seed superseded ${superseded}`);
  if (!complete) {
    console.log('[build-ucs] NOTE: complete=false — this dataset is not a verified full official list.');
  }
  return 0;
}

/**
 * Run the CLI only when this file is the process entry point.
 *
 * `process.argv[1]` is the test file when a `node --test` run imports this
 * module, but the pattern also matches for the test process's own argv[1] under
 * some Node versions, so an explicit test-runner check keeps `--test` runs from
 * exiting the whole suite.
 */
const isTestRunner =
  process.env.NODE_TEST_CONTEXT !== undefined ||
  process.argv.some((arg) => /(^|[\\/])node_modules[\\/]|--test\b/.test(arg)) ||
  /\.test\.(mjs|js|ts|mts)$/.test(process.argv[1] ?? '');

const invokedDirectly =
  !isTestRunner &&
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const code = await main();
  process.exit(code);
}
