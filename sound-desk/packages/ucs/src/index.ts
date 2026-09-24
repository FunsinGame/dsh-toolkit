/**
 * @sounddesk/ucs — Universal Category System (UCS) data + schema.
 *
 * Zero runtime dependencies. Pure ESM, type-strippable TypeScript (no enums,
 * no parameter properties, no namespaces) so it can be executed directly by
 * Node >= 22.6 with `--experimental-strip-types`.
 *
 * JSON data is loaded with `node:fs` at module initialisation rather than with
 * an `import ... with { type: 'json' }` attribute. Rationale: import attributes
 * work under Node 24 but the type-stripping CLI pipeline plus `node:test` module
 * resolution made the `fs` path strictly more portable, and `fs` also lets the
 * loader fall back from the curated seed to a generated (official) dataset when
 * one exists. `resolveJsonModule` is still enabled in tsconfig.json so editors
 * type-check `import data from './x.json'` if a consumer wants it.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * `__dirname` in CommonJS. Declared so the module type-checks under both module
 * systems; bundlers targeting CJS provide the real value (see resolveDataDir).
 */
declare const __dirname: string | undefined;

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type Lang = 'en' | 'zh-Hans';

export interface UcsCategory {
  catId: string;
  category: string;
  subCategory: string;
  /**
   * Compact UCS category prefix actually used inside `catId` — AMB for
   * AMBIENCE, DOOR for DOORS, MACHINE for MACHINES, ... Optional so
   * hand-written or official rows that omit it still load;
   * {@link categoryCodeOf} derives it from the CatID when absent.
   */
  code?: string;
  synonymsEn: string[];
  synonymsZh: string[];
  excludes: string[];
}

export interface UcsDataset {
  version: string;
  complete: boolean;
  generatedAt: string;
  note?: string;
  categories: UcsCategory[];
}

export interface UcsFilenameParts {
  catId: string;
  description: string;
  vendor?: string;
  creator?: string;
  source?: string;
  index?: string;
  extension: string;
}

export interface LabelListEntry {
  code: string;
  label: string;
  count: number;
}

export interface SubCategoryListEntry {
  catId: string;
  label: string;
  count: number;
}

export interface QueryMatch {
  term: string;
  en: string[];
  source: 'query-dict' | 'ucs-synonym';
}

export interface QueryExpansion {
  captions: string[];
  rewritten: string;
  matched: QueryMatch[];
  unmatched: string[];
}

interface DictEntry {
  en: string[];
  source: 'query-dict' | 'ucs-synonym';
  /**
   * The dictionary key actually matched, which can differ from what the user
   * typed: "玻璃的" resolves to "玻璃", and "脚步" to "脚步声". Reported so the
   * UI can show which term produced which English caption.
   */
  term?: string;
  /**
   * True when the match required partial/containment matching rather than an
   * exact key hit. `extractTerms` uses this to re-segment a clause instead of
   * accepting a whole phrase that only partly matched.
   */
  partial?: boolean;
}

interface PromptEntry {
  catId: string;
  prompts: string[];
}

/* -------------------------------------------------------------------------- */
/* Loading                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Locate the `data/` directory.
 *
 * Normally `import.meta.url` resolves this correctly from both the source file
 * and the build output. But a bundler targeting CommonJS (the VSCode extension
 * is one) replaces `import.meta.url` with an empty value, so we fall back to
 * `__dirname` — which the bundler does define — and then to any sibling `data`
 * directory. Failing loudly on a missing dataset is deliberate: silently
 * classifying nothing would be far worse than refusing to start.
 */
function resolveDataDir(): { dir: string; via: string } {
  const candidates: Array<{ dir: string; via: string }> = [];

  try {
    const moduleUrl = import.meta.url;
    if (typeof moduleUrl === 'string' && moduleUrl.length > 0) {
      candidates.push({ dir: path.resolve(fileURLToPath(new URL('..', moduleUrl)), 'data'), via: 'import.meta.url' });
    }
  } catch {
    /* bundled CJS: import.meta.url is unavailable */
  }

  try {
    // Present in both the real CJS output and the bundled extension.
    const dirname = typeof __dirname === 'string' ? __dirname : '';
    if (dirname) {
      candidates.push({ dir: path.resolve(dirname, '..', 'data'), via: '__dirname' });
      candidates.push({ dir: path.resolve(dirname, 'data'), via: '__dirname(sibling)' });
    }
  } catch {
    /* not CJS */
  }

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate.dir, 'categories.seed.json'))) return candidate;
  }

  throw new Error(
    `UCS dataset not found. Looked in:\n${candidates.map((c) => `  - ${c.dir} (via ${c.via})`).join('\n')}\n` +
      'If this is a bundled build, copy packages/ucs/data next to the bundle.',
  );
}

const dataLocation = resolveDataDir();
const dataDirPath = dataLocation.dir;
const here = dataDirPath;

function dataFile(name: string): URL {
  return pathToFileURL(path.join(dataDirPath, name));
}

const seedFile = dataFile('categories.seed.json');
const generatedFile = dataFile('categories.generated.json');
const zhFile = dataFile('zh-Hans.json');
const curatedFile = dataFile('curated-zh.json');
const dictFile = dataFile('query-dict.zh-en.json');

function readJson<T>(url: URL): T {
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}

interface RawDataset extends Omit<UcsDataset, 'categories'> {
  categories: Array<Partial<UcsCategory>>;
}

function normalizeEntry(raw: Partial<UcsCategory>): UcsCategory {
  const category = String(raw.category ?? '').trim();
  const subCategory = String(raw.subCategory ?? '').trim();
  const catId = String(raw.catId ?? `${category}${subCategory}`).trim();
  const declared = String(raw.code ?? '').trim();
  // A category whose own name is already an all-caps UCS code (AIRCRAFT,
  // WATER, ...) is its own prefix; only abbreviated names (AMBIENCE -> AMB)
  // need the leading-uppercase-run fallback.
  const code = declared || (catId.startsWith(category) ? category : categoryCodeOf(catId));
  return {
    catId,
    category,
    subCategory,
    code,
    synonymsEn: Array.isArray(raw.synonymsEn) ? raw.synonymsEn.slice() : [],
    synonymsZh: Array.isArray(raw.synonymsZh) ? raw.synonymsZh.slice() : [],
    excludes: Array.isArray(raw.excludes) ? raw.excludes.slice() : [],
  };
}

/**
 * The generated (official) dataset wins when present, otherwise the curated
 * seed is used. Either way the exported shape is identical.
 */
function loadDataset(): UcsDataset {
  const hasGenerated = existsSync(fileURLToPath(generatedFile));
  const raw = readJson<RawDataset>(hasGenerated ? generatedFile : seedFile);
  const categories = raw.categories.map(normalizeEntry);
  const dataset: UcsDataset = {
    version: String(raw.version ?? '0.0.0'),
    complete: Boolean(raw.complete),
    generatedAt: String(raw.generatedAt ?? ''),
    categories,
  };
  if (typeof raw.note === 'string') dataset.note = raw.note;
  return dataset;
}

/** The active UCS dataset (generated if `scripts/build-ucs.mjs` has been run, else the seed). */
export const dataset: UcsDataset = loadDataset();

/**
 * Chinese display names, kept in two namespaces.
 *
 * The curated table (`curated-zh.json`) is authoritative: `categoryNames` maps
 * official UCS category codes to their Chinese name and `catIdNames` maps
 * official CatIDs to theirs, merged into the generated dataset by
 * scripts/build-ucs.mjs.
 *
 * `legacyNames` is the older seed-era table (`zh-Hans.json`). Its keys are a mix
 * of legacy category codes and legacy CatIDs which deliberately must NOT share a
 * namespace with the curated codes: the legacy file has a CatID literally called
 * `RAIN`, and letting that land in `categoryNames` would shadow the curated
 * category label "雨". It is consulted only as a last resort, for a checkout
 * that still ships the curated seed instead of the generated dataset.
 */
function loadZhNames(): {
  categoryNames: Record<string, string>;
  catIdNames: Record<string, string>;
  legacyNames: Record<string, string>;
} {
  const categoryNames: Record<string, string> = {};
  const catIdNames: Record<string, string> = {};
  const legacyNames: Record<string, string> = {};

  const legacy = readJson<Record<string, unknown>>(zhFile);
  for (const [key, value] of Object.entries(legacy)) {
    if (key.startsWith('_')) continue;
    if (typeof value === 'string') legacyNames[key] = value;
  }

  if (existsSync(fileURLToPath(curatedFile))) {
    const curated = readJson<{ categories?: Record<string, string>; catIds?: Record<string, { label?: string }> }>(
      curatedFile,
    );
    for (const [code, label] of Object.entries(curated.categories ?? {})) {
      if (typeof label === 'string' && label.length > 0) categoryNames[code] = label;
    }
    for (const [catId, value] of Object.entries(curated.catIds ?? {})) {
      const label = value?.label;
      if (typeof label === 'string' && label.length > 0) catIdNames[catId] = label;
    }
  }
  return { categoryNames, catIdNames, legacyNames };
}

const { categoryNames, catIdNames, legacyNames } = loadZhNames();
const rawDict = readJson<Record<string, unknown>>(dictFile);
const queryDict: Record<string, string[]> = {};
for (const [key, value] of Object.entries(rawDict)) {
  if (key.startsWith('_')) continue;
  if (Array.isArray(value)) {
    const list = value.filter((v): v is string => typeof v === 'string');
    if (list.length > 0) queryDict[key] = list;
  }
}

/* -------------------------------------------------------------------------- */
/* Derived indexes                                                            */
/* -------------------------------------------------------------------------- */

const byCatId = new Map<string, UcsCategory>();
const byCatIdLower = new Map<string, UcsCategory>();
for (const entry of dataset.categories) {
  if (!byCatId.has(entry.catId)) byCatId.set(entry.catId, entry);
  const lower = entry.catId.toLowerCase();
  if (!byCatIdLower.has(lower)) byCatIdLower.set(lower, entry);
}

/**
 * The UCS category prefix embedded in a CatID: the leading uppercase run
 * (`AMBDesignedDark` -> `AMB`, `DOORWood` -> `DOOR`, `IMPACTMetal` -> `IMPACT`).
 * Falls back to any leading letters, then to the input unchanged.
 */
export function categoryCodeOf(catId: string): string {
  const raw = String(catId ?? '').trim();
  const upper = /^[A-Z]+/.exec(raw);
  if (upper) return upper[0];
  const any = /^[A-Za-z]+/.exec(raw);
  return any ? any[0] : raw;
}

const categoryCounts = new Map<string, number>();
for (const entry of dataset.categories) {
  categoryCounts.set(entry.category, (categoryCounts.get(entry.category) ?? 0) + 1);
}

const subCategoryCounts = new Map<string, number>();
for (const entry of dataset.categories) {
  subCategoryCounts.set(entry.catId, (subCategoryCounts.get(entry.catId) ?? 0) + 1);
}

/**
 * Chinese lookup table: dictionary entries first, then UCS synonyms (dictionary wins).
 *
 * `zhLookup` keeps a short English slice per Chinese term because it feeds the
 * caption rewriter, which must stay readable. The curated synonyms are sorted
 * first by scripts/build-ucs.mjs, so the slice favours hand-written terms over
 * the official list's alphabetical ones.
 */
const ZH_SYNONYM_SLICE = 8;
const zhLookup = new Map<string, DictEntry>();
for (const entry of dataset.categories) {
  for (const zh of entry.synonymsZh) {
    const key = zh.trim();
    if (key.length > 0 && !zhLookup.has(key)) {
      zhLookup.set(key, { en: entry.synonymsEn.slice(0, ZH_SYNONYM_SLICE), source: 'ucs-synonym' });
    }
  }
}
for (const [key, en] of Object.entries(queryDict)) {
  zhLookup.set(key, { en: en.slice(0, ZH_SYNONYM_SLICE), source: 'query-dict' });
}

/** All Chinese/reference terms sorted longest-first for greedy longest-match segmentation. */
const zhTerms = [...zhLookup.keys()].sort((a, b) => b.length - a.length || (a < b ? -1 : 1));

/* -------------------------------------------------------------------------- */
/* Text helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Fold case and strip punctuation so lookups are case/punct-insensitive.
 * CJK and other Unicode letters are preserved — only punctuation and separators
 * are collapsed, so `"木门。"` and `"木门"` normalise to the same needle.
 */
export function normalizeText(text: string): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function unique(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

function toLang(lang: Lang | undefined): Lang {
  return lang === 'zh-Hans' ? 'zh-Hans' : 'en';
}

/* -------------------------------------------------------------------------- */
/* Listing / labels                                                           */
/* -------------------------------------------------------------------------- */

/** Distinct top-level category codes, sorted alphabetically. */
export function listCategories(lang?: Lang): LabelListEntry[] {
  const resolved = toLang(lang);
  return [...categoryCounts.entries()]
    .map(([code, count]) => ({
      code,
      label: labelFor(code, resolved),
      count,
    }))
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

/** Subcategories within a category (case-insensitive code), sorted by label then catId. */
export function listSubCategories(category: string, lang?: Lang): SubCategoryListEntry[] {
  const resolved = toLang(lang);
  const wanted = String(category ?? '').trim().toLowerCase();
  return dataset.categories
    .filter((entry) => entry.category.toLowerCase() === wanted)
    .map((entry) => ({
      catId: entry.catId,
      label: labelFor(entry.catId, resolved),
      count: subCategoryCounts.get(entry.catId) ?? 1,
    }))
    .sort((a, b) =>
      a.label < b.label ? -1 : a.label > b.label ? 1 : a.catId < b.catId ? -1 : 1,
    );
}

/**
 * Display label for a CatID (`DOORWood` -> "Wood", 木门) or a category code
 * (`DOORS` -> "DOORS", 门). Unknown input is returned unchanged (except that a
 * CatID whose category prefix is known degrades to its subCategory part).
 */
export function labelFor(catIdOrCode: string, lang?: Lang): string {
  const resolved = toLang(lang);
  const raw = String(catIdOrCode ?? '').trim();
  if (raw.length === 0) return '';

  // Chinese display names are keyed by `CATEGORY/SubCategory`, by category code
  // and by CatID. Several UCS categories use the same string for the code and a
  // bare CatID (`AIR`, `RAIN`, `HAIL`, `WIND`, `STORM`, `WTHR`, `MIX`), and the
  // CatID label there is a subcategory phrase ("雨声户外"), so a pure code wins
  // over the CatID. Consult this explicit curation first — but only for the
  // Chinese language, so English labels keep coming from the dataset.
  if (resolved === 'zh-Hans') {
    const entry0 = byCatId.get(raw) ?? byCatIdLower.get(raw.toLowerCase());
    if (entry0) {
      const categoryLabel = categoryNames[entry0.category];
      // An exact CatID ("DOORWood") is normally unambiguous: its own label wins.
      if (entry0.catId === raw) {
        // But when the CatID IS the category code (RAIN, MIX, ...) the semantic
        // unit is the category, not this one subcategory, so the category name
        // wins.
        if (entry0.catId === entry0.category && categoryLabel) return categoryLabel;
        const own = catIdNames[entry0.catId] ?? legacyNames[`${entry0.category}/${entry0.subCategory}`];
        if (own) return own;
        return categoryLabel ?? entry0.subCategory;
      }
      // Otherwise this is a category code. Several UCS categories use the same
      // string for the code and a bare CatID (AIR, RAIN, HAIL, WIND, STORM,
      // WTHR, MIX); there the CatID-level Chinese label describes only one
      // subcategory ("雨声户外" for a category that also covers rain on glass,
      // cloth, metal, vegetation and wood), so the category name wins.
      if (categoryCounts.has(entry0.category) && categoryLabel) return categoryLabel;
      const curated =
        catIdNames[entry0.catId] ??
        legacyNames[`${entry0.category}/${entry0.subCategory}`] ??
        legacyNames[entry0.catId];
      if (typeof curated === 'string' && curated.length > 0) return curated;
    } else {
      const upper = raw.toUpperCase();
      const byCode = categoryNames[upper] ?? legacyNames[upper];
      if (byCode) return byCode;
    }
  }

  const entry = byCatId.get(raw) ?? byCatIdLower.get(raw.toLowerCase());
  if (entry) {
    if (resolved === 'zh-Hans') {
      return (
        catIdNames[entry.catId] ?? legacyNames[`${entry.category}/${entry.subCategory}`] ?? entry.subCategory
      );
    }
    return entry.subCategory;
  }

  const code = raw.toUpperCase();
  if (categoryCounts.has(code)) {
    if (resolved === 'zh-Hans') return categoryNames[code] ?? legacyNames[code] ?? code;
    return code;
  }

  return raw;
}

/* -------------------------------------------------------------------------- */
/* Lookup                                                                     */
/* -------------------------------------------------------------------------- */

function scoreEntry(entry: UcsCategory, needle: string, lang: Lang): number {
  const catId = entry.catId.toLowerCase();
  const category = entry.category.toLowerCase();
  const sub = entry.subCategory.toLowerCase();
  // Both synonym lists are always considered; the requested language just wins
  // ties. This keeps a Chinese query working with the default `lang: 'en'`.
  const preferred = lang === 'zh-Hans' ? entry.synonymsZh : entry.synonymsEn;
  const other = lang === 'zh-Hans' ? entry.synonymsEn : entry.synonymsZh;
  const primary = new Set(preferred.map((s) => s.toLowerCase()));
  const secondary = new Set(other.map((s) => s.toLowerCase()));

  if (catId === needle) return 100;
  if (category === needle) return 90;
  if (sub === needle) return 80;
  if (catId.includes(needle)) return 60;
  if (category.includes(needle)) return 55;
  if (primary.has(needle)) return 50;
  if (secondary.has(needle)) return 48;
  if (sub.includes(needle)) return 40;
  if (preferred.some((s) => normalizeText(s).includes(needle))) return 30;
  if (other.some((s) => normalizeText(s).includes(needle))) return 28;

  // Multi-word queries ("wood door creak"): a single salient token is enough.
  const tokens = needle.split(' ').filter((t) => t.length >= 3);
  if (tokens.length > 1) {
    if (tokens.some((t) => primary.has(t))) return 25;
    if (tokens.some((t) => secondary.has(t))) return 24;
    if (tokens.some((t) => catId === t || sub === t)) return 22;

    // A query like "wooden door" matches neither the synonym "Wood" nor the
    // exact substring "wooden", and the official synonym list is short. Score
    // every token against the CatID / subCategory by 4-character prefix, then
    // order by how much of the query was actually consumed: DOORWood beats
    // BELLDoor on "wooden door" because its stem is longer.
    let matched = 0;
    let stemChars = 0;
    for (const token of tokens) {
      const stem = token.slice(0, 4);
      const hay = `${catId} ${sub}`;
      if (hay.includes(token)) {
        matched += 1;
        stemChars += token.length;
      } else if (hay.includes(stem)) {
        matched += 1;
        stemChars += stem.length;
      }
    }
    if (matched > 0) return matched * 10 + stemChars;
    if (tokens.some((t) => preferred.some((s) => normalizeText(s).includes(t)))) return 15;
    if (tokens.some((t) => other.some((s) => normalizeText(s).includes(t)))) return 14;
  }

  if (entry.excludes.some((s) => s.toLowerCase() === needle)) return -1;
  return 0;
}

/**
 * Find entries whose catId, category, subCategory or any synonym matches the
 * given text (case/punct-insensitive). Deterministic: sorted by score, then catId.
 */
export function lookup(text: string, opts?: { lang?: Lang; limit?: number }): UcsCategory[] {
  const lang = toLang(opts?.lang);
  const limit = typeof opts?.limit === 'number' && opts.limit > 0 ? Math.floor(opts.limit) : Number.POSITIVE_INFINITY;
  const needle = normalizeText(String(text ?? ''));
  if (needle.length === 0) return [];
  const rawNeedle = String(text ?? '').trim().toLowerCase();

  const scored: Array<{ entry: UcsCategory; score: number }> = [];
  for (const entry of dataset.categories) {
    const score = Math.max(scoreEntry(entry, needle, lang), scoreEntry(entry, rawNeedle, lang));
    if (score > 0) scored.push({ entry, score });
  }
  scored.sort((a, b) =>
    b.score - a.score || (a.entry.catId < b.entry.catId ? -1 : a.entry.catId > b.entry.catId ? 1 : 0),
  );
  return scored.slice(0, limit).map((s) => s.entry);
}

/** True when the string is a known CatID (case-insensitive). */
export function isKnownCatId(s: string): boolean {
  if (typeof s !== 'string') return false;
  const trimmed = s.trim();
  if (trimmed.length === 0) return false;
  return byCatId.has(trimmed) || byCatIdLower.has(trimmed.toLowerCase());
}

/* -------------------------------------------------------------------------- */
/* CLAP prompts                                                               */
/* -------------------------------------------------------------------------- */

/**
 * All English prompt phrases for zero-shot CLAP classification of one CatID.
 * Deterministic ordering (input synonym order). Unknown CatIDs get an empty array.
 */
export function promptsFor(catId: string): string[] {
  const entry = byCatId.get(String(catId ?? '').trim()) ?? byCatIdLower.get(String(catId ?? '').trim().toLowerCase());
  if (!entry) return [];

  const syn = entry.synonymsEn.map((s) => s.trim()).filter((s) => s.length > 0);
  const lower = String(entry.catId).toLowerCase();
  const human = lower.replace(/([a-z])([A-Z])/g, '$1 $2');

  const prompts: string[] = [`a sound effect of ${syn[0] ?? human}`];
  if (syn.length >= 2) prompts.push(`${syn[0]}, ${syn[1]}`);
  if (syn.length >= 3) prompts.push(`${entry.category.toLowerCase()} sound: ${syn[2]}`);
  return unique(prompts);
}

/** Flat list for bulk pre-computation of text embeddings. Covers every dataset entry. */
export function allPrompts(): PromptEntry[] {
  return dataset.categories.map((entry) => ({
    catId: entry.catId,
    prompts: promptsFor(entry.catId),
  }));
}

/* -------------------------------------------------------------------------- */
/* Filename convention                                                        */
/* -------------------------------------------------------------------------- */

const AUDIO_EXTENSIONS = new Set([
  'wav',
  'wave',
  'aif',
  'aiff',
  'aifc',
  'flac',
  'mp3',
  'm4a',
  'aac',
  'ogg',
  'oga',
  'opus',
  'wma',
  'caf',
  'rf64',
  'bwf',
  'sd2',
]);

/**
 * UCS filename convention:
 *   `CATID_Description_Vendor_Creator_Source_NN.wav`
 * Optional fields may be omitted; the index is the trailing `_NN` segment.
 *
 * Returns null for empty input, for a non-audio extension (only the
 * {@link AUDIO_EXTENSIONS} allowlist is accepted) or when the leading segment
 * is not a CatID-shaped token (`^[A-Za-z][A-Za-z0-9]*$`).
 *
 * Note: UCS writes a space inside a field as a dash. `parseUcsFilename` restores
 * the space (`Wooden-Door-Close` -> `Wooden Door Close`), so the byte-exact
 * round trip through {@link buildUcsFilename} holds whenever the input already
 * used dashes — see the round-trip test.
 */
export function parseUcsFilename(filename: string): UcsFilenameParts | null {
  const name = String(filename ?? '').trim();
  if (name.length === 0) return null;

  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return null;
  const extension = name.slice(dot + 1).toLowerCase();
  if (!/^[a-z0-9]+$/.test(extension)) return null;
  if (!AUDIO_EXTENSIONS.has(extension)) return null;
  const stem = name.slice(0, dot);
  // A leading separator means there is no CatID segment at all.
  if (/^[_\-. ]/.test(stem)) return null;

  const segments = stem.split('_').filter((s) => s.length > 0);
  if (segments.length === 0) return null;

  const head = segments[0] as string;
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(head)) return null;

  const rest = segments.slice(1);
  let index: string | undefined;
  const tail = rest[rest.length - 1];
  if (rest.length >= 2 && tail !== undefined && /^(?:[0-9]{1,4}(?:[.-][0-9]{1,3})?|r[0-9]{1,3}|R[0-9]{1,3}|[A-Z]{1,3}[0-9]{1,3})$/.test(tail)) {
    index = rest.pop() as string;
  }

  // UCS renders spaces inside a field as dashes; restore them for display.
  const fields = rest.map((s) => s.replace(/-/g, ' '));
  const parts: UcsFilenameParts = {
    catId: head,
    description: fields[0] ?? '',
    extension,
  };
  if (fields[1] !== undefined) parts.vendor = fields[1];
  if (fields[2] !== undefined) parts.creator = fields[2];
  if (fields[3] !== undefined) parts.source = fields[3];
  if (fields[4] !== undefined) parts.source = `${parts.source ?? ''}_${fields[4]}`.replace(/^_/, '');
  if (index !== undefined) parts.index = index;
  return parts;
}

/**
 * Build a UCS filename. Fields are sanitised: spaces become dashes (UCS
 * convention), separators are stripped so the segment count stays parseable.
 */
export function buildUcsFilename(p: UcsFilenameParts): string {
  const catId = String(p?.catId ?? '').trim();
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(catId)) {
    throw new TypeError(`buildUcsFilename: invalid catId ${JSON.stringify(p?.catId)}`);
  }

  const clean = (value: string | undefined): string =>
    String(value ?? '')
      .trim()
      .replace(/[\\/:*?"<>|_]+/g, ' ')
      .replace(/\s+/g, '-')
      .replace(/^-+|-+$/g, '');

  const description = clean(p.description) || catId;
  const segments = [catId, description];
  for (const optional of [p.vendor, p.creator, p.source]) {
    if (optional !== undefined && optional !== null && String(optional).trim().length > 0) {
      segments.push(clean(optional));
    }
  }
  if (p.index !== undefined && p.index !== null && String(p.index).trim().length > 0) {
    segments.push(clean(p.index));
  }

  const extension = String(p.extension ?? '').trim().replace(/^\.+/, '') || 'wav';
  return `${segments.join('_')}.${extension}`;
}

/**
 * Best-effort parse of an arbitrary filename. Returns null only for empty or
 * clearly non-audio input. `catId` is set only when the first token is a known
 * CatID (case-insensitive).
 */
export function sniffFilename(filename: string): { catId?: string; tokens: string[] } | null {
  const name = String(filename ?? '').trim();
  if (name.length === 0) return null;

  const dot = name.lastIndexOf('.');
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  const isAudio = AUDIO_EXTENSIONS.has(extension);
  const stem = dot > 0 && extension.length > 0 ? name.slice(0, dot) : name;
  const tokens = stem
    .split(/[_\-\s.]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (tokens.length === 0) return null;
  if (!isAudio && !/^[A-Za-z0-9]+$/.test(tokens[0] as string)) return null;
  // Without a recognisable audio extension we still sniff, but only if there is
  // something to sniff (at least one alphanumeric token).
  if (!isAudio && !tokens.some((t) => /[A-Za-z]/.test(t))) return null;

  const head = tokens[0] as string;
  const known = byCatId.get(head) ?? byCatIdLower.get(head.toLowerCase());
  return known ? { catId: known.catId, tokens } : { tokens };
}

/* -------------------------------------------------------------------------- */
/* Query rewriting                                                            */
/* -------------------------------------------------------------------------- */

const SEPARATOR_RE = /[,，、;；/|]+|\s+/;
const PARTICLE_RE = /^(?:的|了|着|地|得|很|有点|带点|稍微|非常|一个|一些|那种|这个)+|(?:的|了|着|地|得)+$/;

/**
 * Remove leading/trailing grammatical particles.
 *
 * Stripping to empty is a legitimate answer — a term that is nothing but
 * particles ("的", "带点") carries no search intent, and callers rely on the
 * empty string to detect that. An earlier version broke out of the loop when
 * the result became empty and therefore returned the *unstripped* term, which
 * silently defeated that check.
 */
function stripParticles(term: string): string {
  let out = term;
  for (let i = 0; i < 4; i += 1) {
    const next = out.replace(PARTICLE_RE, '').trim();
    if (next === out) break; // converged
    out = next;
    if (out.length === 0) break; // nothing but particles
  }
  return out;
}

/**
 * Split a query into terms. Separators (Chinese/ASCII commas, spaces,
 * `、`/`；`/`;`) always split first; any resulting clause that is not itself a
 * dictionary key is then broken up with longest-match-first greedy
 * segmentation, so `"金属门重重关上，空仓库"` yields `金属门` + `重重关上` + the
 * `空仓库` clause rather than one unmatchable blob.
 */
function extractTerms(input: string): string[] {
  const separated = input
    .split(SEPARATOR_RE)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (separated.length <= 1) return segmentGreedy(input);

  const out: string[] = [];
  for (const clause of separated) {
    const entry = dictEntryFor(clause);
    // Only accept the clause whole on an exact match. A *partial* match means the
    // clause merely contains a known key — "金属门重重关上" contains "金属门" — and
    // accepting it whole would throw away the rest of the phrase and report the
    // wrong term. Re-segmenting recovers "金属门" plus whatever else is known.
    if (entry && !entry.partial) {
      out.push(clause);
      continue;
    }
    const pieces = segmentGreedy(clause);
    if (pieces.length > 0) out.push(...pieces);
    else if (entry) out.push(clause);
  }
  return out;
}

/** Longest-match-first greedy segmentation against every known Chinese term. */
function segmentGreedy(input: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i] as string;
    if (!/[\p{Script=Han}\p{L}\p{N}]/u.test(ch)) {
      i += 1;
      continue;
    }
    let matched = '';
    for (const term of zhTerms) {
      if (term.length <= matched.length) continue;
      if (input.startsWith(term, i)) matched = term;
    }
    if (matched.length > 0) {
      // Drop pure particles before they become tokens. A dictionary key can
      // itself be a particle ("的"), and emitting it would duplicate the
      // preceding noun's meaning under a separate term — "玻璃的" would report
      // both "玻璃" and "的" as matches.
      const useful = stripParticles(matched);
      if (useful.length > 0) out.push(useful);
      i += matched.length;
    } else {
      let span = '';
      while (i < input.length && /[\p{Script=Han}\p{L}\p{N}]/u.test(input[i] as string)) {
        span += input[i] as string;
        i += 1;
        const probe = stripParticles(span);
        if (probe.length > 0 && zhLookup.has(probe)) break;
      }
      const cleaned = stripParticles(span);
      // A pure particle span ("的", "带点") carries no search intent: drop it
      // instead of reporting it as an unmatched term.
      if (cleaned.length > 0) out.push(cleaned);
    }
  }
  return out;
}

function dictEntryFor(term: string): DictEntry | undefined {
  // Exact match on the term, then on the particle-stripped form ("玻璃的" → "玻璃").
  const stripped = stripParticles(term);
  for (const candidate of unique([term, stripped]).filter((c) => c.length > 0)) {
    const hit = zhLookup.get(candidate);
    if (hit) return { ...hit, term: candidate };
  }
  const folded = term.toLowerCase();
  if (folded !== term) {
    const hit = zhLookup.get(folded);
    if (hit) return { ...hit, term: folded };
  }

  // A term that strips to nothing is a pure particle ("的", "了", "带点"). It
  // carries no search intent, and partial matching on it would let the leftover
  // character match an unrelated entry.
  if (stripped.length === 0) return undefined;

  // Partial matching runs on the **stripped** form only. Matching the raw term
  // would let a trailing particle satisfy the containment rule — "玻璃的" would
  // report itself as the matched term instead of the cleaner "玻璃".
  //
  //  (a) a shorter *key* inside the term — "震耳欲聋的金属碰撞声" still picks up
  //      "金属碰撞". Keys shorter than two characters are skipped, otherwise the
  //      single-character particles in the dictionary would match everything.
  //
  //  (b) the term inside a longer key — the user types "脚步" while the entry is
  //      "脚步声". This is the common case for compounds, and dropping it would
  //      silently remove the word from the caption so that sound could never be
  //      found. Restricted to Han characters, with a capped length difference so
  //      "门" cannot match "门把手弹簧".
  //
  // Longer partials win, so "空仓库" beats "仓库".
  const MAX_PREFIX_EXTRA = 3;
  let best: { key: string; entry: DictEntry } | null = null;
  for (const [key, entry] of zhLookup) {
    const keyInsideTerm = key.length >= 2 && stripped.includes(key);
    const hanOnly = /^[\p{Script=Han}]+$/u.test(stripped);
    const termInsideKey =
      key.includes(stripped) && key.length > stripped.length && key.length - stripped.length <= MAX_PREFIX_EXTRA;
    if (!keyInsideTerm && !(hanOnly && termInsideKey)) continue;
    if (!best || key.length > best.key.length) best = { key, entry };
  }
  if (best) return { ...best.entry, term: stripped, partial: true };

  return undefined;
}

const MAX_MATCHED = 24;
const MAX_UNMATCHED = 12;

// TEMP DEBUG (removed before handoff)
export const __dbg = {
  dictEntryFor,
  extractTerms,
  stripParticles,
  has: (k: string) => zhLookup.has(k),
  size: () => zhLookup.size,
  isTerm: (k: string) => zhTerms.includes(k),
};

function buildExpansion(input: string): QueryExpansion {
  const original = String(input ?? '');
  const trimmed = original.trim();
  if (trimmed.length === 0) {
    return { captions: [original], rewritten: '', matched: [], unmatched: [] };
  }

  const terms = extractTerms(trimmed);
  const matched: QueryMatch[] = [];
  const unmatched: string[] = [];
  const choices: string[][] = [];

  for (const term of terms) {
    const entry = dictEntryFor(term);
    if (entry && entry.en.length > 0) {
      if (matched.length < MAX_MATCHED) {
        // Report the key that actually matched, so "玻璃的" shows as "玻璃" and
        // the user can see the particle was ignored.
        matched.push({ term: entry.term ?? term, en: entry.en.slice(0, 4), source: entry.source });
        choices.push(entry.en.slice(0, 4));
      }
    } else {
      // UCS synonyms are already folded into zhLookup; nothing else to try.
      if (unmatched.length < MAX_UNMATCHED) unmatched.push(term);
    }
  }

  const pick = (variant: number): string =>
    choices
      .map((list) => list[Math.min(variant, list.length - 1)] ?? '')
      .filter((s) => s.length > 0)
      .join(', ');

  const rewritten = pick(0);
  const captions = unique([rewritten, pick(1), pick(2), original].filter((c) => c.length > 0)).slice(0, 4);
  if (captions.length === 0) captions.push(original);

  return { captions, rewritten, matched, unmatched };
}

/**
 * Rewrite a natural-language Chinese sound description into CLAP-friendly
 * English captions. Never throws; `captions` is never empty.
 */
export function expandQueryZh(input: string): QueryExpansion {
  try {
    return buildExpansion(input);
  } catch {
    const original = String(input ?? '');
    return { captions: [original], rewritten: '', matched: [], unmatched: [] };
  }
}

/**
 * Language-aware wrapper. `zh-Hans` delegates to {@link expandQueryZh}; `en`
 * only normalises whitespace and splits on commas, returning the input itself
 * as the single caption.
 */
export function expandQuery(input: string, lang?: Lang): QueryExpansion {
  if (toLang(lang) === 'zh-Hans') return expandQueryZh(input);

  const original = String(input ?? '');
  const normalized = original.replace(/\s+/g, ' ').trim();
  const terms = normalized
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const rewritten = terms.join(', ');
  const captions = unique([rewritten, original].filter((c) => c.length > 0));
  if (captions.length === 0) captions.push(original);
  return { captions, rewritten, matched: [], unmatched: terms };
}

/* -------------------------------------------------------------------------- */
/* Small extras                                                               */
/* -------------------------------------------------------------------------- */

/** Absolute path of the data directory (handy for CLIs and scripts). */
export const dataDir = here;

/** Number of entries in the active dataset. */
export const entryCount: number = dataset.categories.length;

export default {
  dataset,
  listCategories,
  listSubCategories,
  labelFor,
  lookup,
  isKnownCatId,
  promptsFor,
  allPrompts,
  parseUcsFilename,
  buildUcsFilename,
  sniffFilename,
  expandQueryZh,
  expandQuery,
};
