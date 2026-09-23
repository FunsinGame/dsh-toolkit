#!/usr/bin/env node
/**
 * scripts/build-ucs.mjs — ingest the official UCS (Universal Category System)
 * spreadsheet export and merge it with the curated seed.
 *
 * OFFICIAL SOURCE (documented here on purpose):
 *   UCS resources hub ....... https://resources.universalcategorysystem.com/
 *   UCS project / spec ...... https://universalcategorysystem.com/
 *   UCS reference (GitHub) .. https://github.com/UniversalCategorySystem
 *   Raw list (Google Sheets used by the community, "UCS 8.2.1"):
 *     export as CSV/TSV from the official spreadsheet linked on the resources
 *     page above, then pass it with `--source`.
 *
 * The official list is distributed through a Dropbox/Google-Sheets resource
 * folder, not a stable HTTP endpoint, so this script CANNOT download it for you
 * and will never fail the package when the network/source is unavailable.
 *
 * Usage
 *   node scripts/build-ucs.mjs                       # prints instructions, exit 0, touches nothing
 *   node scripts/build-ucs.mjs --source ucs.csv      # parse a local CSV/TSV export
 *   node scripts/build-ucs.mjs --source ucs.tsv --version 8.2.1
 *   node scripts/build-ucs.mjs --source https://host/ucs.csv   # optional, best effort
 *   node scripts/build-ucs.mjs --source ucs.csv --out data/categories.generated.json
 *
 * Behaviour
 *   - Tolerant header mapping (see HEADER_ALIASES below).
 *   - Merges with data/categories.seed.json: seed entries are kept unless the
 *     official row overrides the same CatID; official rows are appended.
 *   - `complete: true` only when a full official list was parsed (>= 1000 rows
 *     and every row produced a valid CatID). Otherwise the output stays marked
 *     incomplete so consumers never mistake a partial parse for the real thing.
 *   - Writes only data/categories.generated.json, and only when a source was
 *     actually parsed and yielded at least one usable row.
 *   - Exit code is 0 for every "source missing / network down / nothing parsed"
 *     case; exit 1 only for a malformed CLI invocation or an unreadable local
 *     file that the user explicitly passed.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(SCRIPT_DIR, '..');
const SEED_PATH = path.join(PKG_ROOT, 'data', 'categories.seed.json');
const DEFAULT_OUT = path.join(PKG_ROOT, 'data', 'categories.generated.json');

const HEADER_ALIASES = {
  category: ['category', 'category name', 'cat name', 'top category', 'main category', 'category code'],
  subCategory: ['subcategory', 'sub category', 'sub-category', 'sub cat', 'subcategory name', 'sub'],
  catId: ['catid', 'cat id', 'cat-id', 'id', 'ucs id', 'ucc id'],
  synonyms: ['synonyms', 'synonym', 'synonymes', 'keywords', 'search terms', 'index words'],
  excludes: ['excludes', 'exclude', 'exclusion', 'exclusions', 'not', 'do not use'],
  description: ['description', 'explanation', 'notes', 'comment', 'definition'],
};

/* ------------------------------------------------------------------ CLI --- */

function parseArgs(argv) {
  const args = { source: undefined, version: undefined, out: DEFAULT_OUT, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--source' || arg === '-s') args.source = argv[++i];
    else if (arg.startsWith('--source=')) args.source = arg.slice('--source='.length);
    else if (arg === '--version' || arg === '-v') args.version = argv[++i];
    else if (arg.startsWith('--version=')) args.version = arg.slice('--version='.length);
    else if (arg === '--out' || arg === '-o') args.out = path.resolve(process.cwd(), argv[++i]);
    else if (arg.startsWith('--out=')) args.out = path.resolve(process.cwd(), arg.slice('--out='.length));
    else {
      console.error(`[build-ucs] unknown argument: ${arg}`);
      console.error('[build-ucs] run `node scripts/build-ucs.mjs --help` for usage.');
      process.exit(1);
    }
  }
  return args;
}

function printInstructions() {
  const lines = [
    '',
    'UCS dataset build — no --source given, nothing was written.',
    '',
    'The official UCS list is a spreadsheet in the UCS resource folder:',
    '  https://resources.universalcategorysystem.com/',
    '  (reference: https://universalcategorysystem.com/  |  https://github.com/UniversalCategorySystem)',
    '',
    'How to build the full dataset:',
    '  1. Open the official UCS spreadsheet from the resource folder above.',
    '  2. File > Download > CSV (or TSV) — keep the header row.',
    '  3. Run:',
    '       node scripts/build-ucs.mjs --source ./UCS_8.2.1.csv --version 8.2.1',
    '',
    'Recognised headers (tolerant, case/spacing insensitive):',
    `  Category   : ${HEADER_ALIASES.category.join(', ')}`,
    `  SubCategory: ${HEADER_ALIASES.subCategory.join(', ')}`,
    `  CatID      : ${HEADER_ALIASES.catId.join(', ')}`,
    `  Synonyms   : ${HEADER_ALIASES.synonyms.join(', ')}`,
    `  Excludes   : ${HEADER_ALIASES.excludes.join(', ')}`,
    '',
    `Output: ${path.relative(PKG_ROOT, DEFAULT_OUT)} (override with --out)`,
    'Without this step the package keeps using the curated seed subset',
    '(data/categories.seed.json, complete: false).',
    '',
  ];
  console.log(lines.join('\n'));
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
    .replace(/[\s_\-./]+/g, ' ');
}

function mapHeaders(headerRow) {
  const index = {};
  const normalized = headerRow.map(normalizeHeader);
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      const at = normalized.indexOf(alias);
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

function pascalCase(value) {
  return String(value ?? '')
    .trim()
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

function rowsToEntries(rows) {
  if (rows.length === 0) return { entries: [], headerIndex: {}, headerFound: false, skipped: 0 };

  const headerIndex = mapHeaders(rows[0]);
  const headerFound = headerIndex.category !== undefined || headerIndex.catId !== undefined;
  const body = headerFound ? rows.slice(1) : rows;
  const index = headerFound
    ? headerIndex
    : { category: 0, subCategory: 1, catId: 2, synonyms: 3, excludes: 4 };

  const entries = [];
  let skipped = 0;
  for (const row of body) {
    const category = String(row[index.category] ?? '').trim().toUpperCase().replace(/\s+/g, '');
    const subRaw = String(row[index.subCategory] ?? row[index.subCategory === 1 ? 2 : 1] ?? '').trim();
    let catId = index.catId !== undefined ? String(row[index.catId] ?? '').trim() : '';
    const subCategory = pascalCase(subRaw);

    if (!catId) catId = `${category}${subCategory}`;
    catId = catId.replace(/[^A-Za-z0-9]+/g, '');

    if (!category || !catId || !/^[A-Za-z][A-Za-z0-9]*$/.test(catId)) {
      skipped += 1;
      continue;
    }

    const synonymsEn = splitList(index.synonyms !== undefined ? row[index.synonyms] : '');
    const excludes = splitList(index.excludes !== undefined ? row[index.excludes] : '');

    entries.push({
      catId,
      category,
      subCategory: subCategory || catId.slice(category.length) || category,
      synonymsEn: synonymsEn.length > 0 ? synonymsEn.slice(0, 12) : [subRaw.toLowerCase()].filter(Boolean),
      synonymsZh: [],
      excludes: excludes.slice(0, 6),
    });
  }
  return { entries, headerIndex: index, headerFound, skipped };
}

/* --------------------------------------------------------------- sources --- */

async function readSource(source) {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source, { redirect: 'follow' });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    return await response.text();
  }
  return await readFile(path.resolve(process.cwd(), source), 'utf8');
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

/** Main entry. Returns a process exit code; never throws. */
export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    printInstructions();
    return 0;
  }
  if (!args.source) {
    printInstructions();
    return 0;
  }

  let text;
  try {
    text = await readSource(args.source);
  } catch (error) {
    console.warn(`[build-ucs] could not read source "${args.source}": ${error.message}`);
    console.warn('[build-ucs] the official UCS list usually lives behind a Dropbox folder — download the CSV/TSV');
    console.warn('            manually from https://resources.universalcategorysystem.com/ and pass it with --source.');
    console.warn('[build-ucs] no file written; the package keeps using data/categories.seed.json.');
    return 0;
  }

  let rows;
  try {
    rows = parseDelimited(text, detectDelimiter(text));
  } catch (error) {
    console.warn(`[build-ucs] failed to parse "${args.source}": ${error.message}`);
    console.warn('[build-ucs] no file written.');
    return 0;
  }

  const { entries, skipped, headerFound } = rowsToEntries(rows);
  if (entries.length === 0) {
    console.warn('[build-ucs] parsed 0 usable UCS rows — check the header names and delimiter.');
    console.warn(`[build-ucs] first row seen: ${JSON.stringify((rows[0] ?? []).slice(0, 8))}`);
    console.warn('[build-ucs] no file written; the package keeps using data/categories.seed.json.');
    return 0;
  }

  const seed = await loadSeed();
  const byCatId = new Map();
  for (const entry of seed.categories) {
    if (entry && typeof entry.catId === 'string') byCatId.set(entry.catId, entry);
  }
  let overridden = 0;
  let added = 0;
  for (const entry of entries) {
    if (byCatId.has(entry.catId)) {
      const previous = byCatId.get(entry.catId);
      byCatId.set(entry.catId, {
        ...previous,
        ...entry,
        // never lose the hand-written Chinese synonyms
        synonymsZh: Array.isArray(previous.synonymsZh) && previous.synonymsZh.length > 0
          ? previous.synonymsZh
          : entry.synonymsZh,
        excludes: entry.excludes.length > 0 ? entry.excludes : (previous.excludes ?? []),
      });
      overridden += 1;
    } else {
      byCatId.set(entry.catId, entry);
      added += 1;
    }
  }

  const categories = [...byCatId.values()];
  const likelyComplete = entries.length >= 1000 && skipped === 0;
  const out = {
    version: String(args.version ?? seed.version ?? '0.0.0'),
    complete: likelyComplete,
    generatedAt: new Date().toISOString(),
    note: likelyComplete
      ? `Generated from ${args.source} by scripts/build-ucs.mjs; merged with the curated seed (${seed.categories.length} seed entries, ${overridden} overridden, ${added} added).`
      : `PARTIAL parse of ${args.source} by scripts/build-ucs.mjs (${entries.length} official rows, ${skipped} skipped). Marked complete:false because a full official list is expected to have >=1000 rows.`,
    source: args.source,
    seedMerged: true,
    headerFound,
    officialRows: entries.length,
    skippedRows: skipped,
    categories,
  };

  await writeFile(args.out, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(
    `[build-ucs] wrote ${path.relative(PKG_ROOT, args.out)}: ${categories.length} entries ` +
      `(${entries.length} official rows, ${overridden} overridden, ${added} added, ${skipped} skipped), ` +
      `complete=${out.complete}`,
  );
  if (!out.complete) {
    console.log('[build-ucs] NOTE: complete=false — the merged dataset is not a verified full official list.');
  }
  return 0;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const code = await main();
  process.exit(code);
}
