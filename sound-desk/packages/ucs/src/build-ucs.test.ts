/**
 * src/build-ucs.test.ts — tests for the official UCS dataset generator.
 *
 * Run:  node --test --experimental-strip-types src/*.test.ts
 * Direct: node --experimental-strip-types src/build-ucs.test.ts
 *
 * These tests read the vendored official CSV, so they fail loudly if the
 * vendored file drifts from the pinned SHA-256 — which is the point: the
 * generated dataset is only trustworthy while its source is byte-identical.
 *
 * Type-strippable syntax only (no enums, no namespaces, no parameter properties).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  parseDelimited,
  detectDelimiter,
  rowsToEntries,
  formatUcsLabel,
  rankSynonyms,
  applyOverlay,
  sha256,
  inferVersion,
  main,
} from '../scripts/build-ucs.mjs';

const CSV_URL = new URL('../data/ucs_v8.2.1.csv', import.meta.url);
const GENERATED_URL = new URL('../data/categories.generated.json', import.meta.url);
const CURATED_URL = new URL('../data/curated-zh.json', import.meta.url);

const csvText = await readFile(CSV_URL, 'utf8');
const generated = JSON.parse(await readFile(GENERATED_URL, 'utf8')) as {
  version: string;
  complete: boolean;
  note: string;
  sourceSha256: string;
  sourceVerified: boolean;
  sourceRows: number;
  expectedRows: number;
  expectedCategories: number;
  officialCategories: number;
  skippedRows: number;
  droppedSeedCatIds: number;
  categories: Array<{ catId: string; category: string; subCategory: string; code: string }>;
};
const curated = JSON.parse(await readFile(CURATED_URL, 'utf8')) as {
  categories: Record<string, string>;
  catIds: Record<string, unknown>;
};

/* ------------------------------------------------------------- delimited --- */

test('parseDelimited handles quotes, escaped quotes, embedded newlines and CRLF', () => {
  const text = 'a,b,c\r\n"x,1","he said ""hi""","line\nbreak"\r\nplain,,tail\r\n';
  assert.deepEqual(parseDelimited(text, ','), [
    ['a', 'b', 'c'],
    ['x,1', 'he said "hi"', 'line\nbreak'],
    ['plain', '', 'tail'],
  ]);
});

test('parseDelimited strips a UTF-8 BOM and drops blank rows', () => {
  assert.deepEqual(parseDelimited('\uFEFFh1,h2\n\nv1,v2\n  \n', ','), [
    ['h1', 'h2'],
    ['v1', 'v2'],
  ]);
});

test('detectDelimiter picks tabs and semicolons over commas', () => {
  assert.equal(detectDelimiter('a,b,c'), ',');
  assert.equal(detectDelimiter('a\tb\tc'), '\t');
  assert.equal(detectDelimiter('a;b;c'), ';');
});

/* ----------------------------------------------------------------- label --- */

test('formatUcsLabel turns SHOUTY official names into readable labels', () => {
  assert.equal(formatUcsLabel('WOOD'), 'Wood');
  assert.equal(formatUcsLabel('CRASH & DEBRIS'), 'Crash & Debris');
  assert.equal(formatUcsLabel('HYDRAULIC & PNEUMATIC'), 'Hydraulic & Pneumatic');
  assert.equal(formatUcsLabel('RADIO CONTROLLED'), 'Radio Controlled');
  assert.equal(formatUcsLabel('HITECH'), 'Hitech');
  assert.equal(formatUcsLabel(''), '');
  assert.equal(formatUcsLabel('  '), '');
  assert.equal(formatUcsLabel('MISC'), 'Misc');
});

test('rankSynonyms promotes the subcategory word and keeps official order as tie-break', () => {
  const ranked = rankSynonyms('Percussion', ['Bass', 'Beat', 'Percussion', 'Bongo']);
  assert.equal(ranked[0], 'Percussion', 'the label must lead so the rewriter sees it first');
  assert.deepEqual(ranked.slice(1), ['Bass', 'Beat', 'Bongo'], 'the rest keep their official order');
  // No label token present: order is preserved exactly.
  assert.deepEqual(rankSynonyms('General', ['Misc', 'Ambience']), ['Misc', 'Ambience']);
});

/* ------------------------------------------------------------ official csv --- */

test('the vendored official CSV is the pinned UCS v8.2.1 list', () => {
  const rows = parseDelimited(csvText, detectDelimiter(csvText));
  assert.deepEqual(rows[0], ['Category', 'SubCategory', 'CatID', 'CatShort', 'Explanations', 'Synonyms']);
  assert.equal(rows.length - 1, 753, 'UCS v8.2.1 has exactly 753 subcategory rows');
  assert.equal(new Set(rows.slice(1).map((r) => r[0])).size, 82, 'UCS v8.2.1 has exactly 82 categories');
});

test('rowsToEntries maps every official row without skipping any', () => {
  const { entries, skipped, headerFound } = rowsToEntries(parseDelimited(csvText, detectDelimiter(csvText)));
  assert.equal(headerFound, true, 'the official header must be recognised');
  assert.equal(skipped, 0, 'no official row may be dropped');
  assert.equal(entries.length, 753);
  assert.equal(new Set(entries.map((e) => e.catId)).size, 753, 'every CatID is unique');
  for (const entry of entries) {
    assert.ok(entry.catId.startsWith(entry.code), `${entry.catId} must start with its CatShort ${entry.code}`);
    assert.ok(entry.subCategory.length > 0, `${entry.catId} has no readable label`);
    assert.ok(entry.explanation && entry.explanation.length > 0, `${entry.catId} lost its explanation`);
    assert.ok(entry.synonymsEn.length > 0, `${entry.catId} has no English synonyms`);
  }
});

test('known rows decode to the documented official CatIDs and labels', () => {
  const { entries } = rowsToEntries(parseDelimited(csvText, detectDelimiter(csvText)));
  const byId = new Map(entries.map((e) => [e.catId, e]));
  // The real UCS CatIDs, as opposed to the invented ones the seed shipped.
  assert.equal(byId.get('DOORWood')?.category, 'DOORS');
  assert.equal(byId.get('DOORWood')?.subCategory, 'Wood');
  assert.equal(byId.get('DOORWood')?.code, 'DOOR');
  assert.equal(byId.get('WATRUndwtr')?.category, 'WATER');
  assert.equal(byId.get('WATRUndwtr')?.subCategory, 'Underwater');
  assert.equal(byId.get('METLImpt')?.subCategory, 'Impact');
  assert.equal(byId.get('DSGNRmbl')?.subCategory, 'Rumble');
  // WOOD-HANDLE was renamed to WOODHndl in 8.2.1.
  assert.equal(byId.has('WOODHndl'), true);
  // The ARCHIVED group uses the bare CatShort as its CatID.
  assert.equal(byId.get('MIX')?.category, 'ARCHIVED');
  assert.equal(byId.get('MIX')?.subCategory, 'Mix');
});

test('inferVersion reads the version out of the filename', () => {
  assert.equal(inferVersion('ucs_v8.2.1.csv'), '8.2.1');
  assert.equal(inferVersion('UCS 9.0.tsv'), '9.0');
  assert.equal(inferVersion('categories.csv'), '8.2.1', 'falls back to the pinned version');
});

/* ---------------------------------------------------------------- overlay --- */

test('applyOverlay prepends curated Chinese and never invents a CatID', () => {
  const entries = [
    { catId: 'DOORWood', category: 'DOORS', subCategory: 'Wood', code: 'DOOR', synonymsEn: ['Wood'], synonymsZh: ['Wood'], excludes: [] },
  ];
  const { zhLabels, zhSynonyms, unknown } = applyOverlay(entries, {
    catIds: {
      DOORWood: { label: '木门', zh: ['木门吱呀', '木门开'] },
      NOTAREALCATID: { label: '假的' },
    },
  });
  assert.equal(zhLabels, 1);
  assert.equal(zhSynonyms, 2);
  assert.deepEqual(unknown, ['NOTAREALCATID'], 'an unknown CatID must be reported, not merged');
  assert.equal(entries[0]?.synonymsZh[0], '木门', 'the curated label must come first');
  assert.deepEqual(entries[0]?.synonymsZh.slice(0, 3), ['木门', '木门吱呀', '木门开']);
});

test('applyOverlay deduplicates and keeps the official entry unchanged otherwise', () => {
  const entries = [
    { catId: 'X1', category: 'X', subCategory: 'Y', code: 'X', synonymsEn: ['Y'], synonymsZh: ['已有'], excludes: [] },
  ];
  applyOverlay(entries, { catIds: { X1: { label: '已有', zh: ['已有'] } } });
  assert.deepEqual(entries[0]?.synonymsZh, ['已有'], 'no duplicate Chinese terms');
});

test('the curated overlay only references CatIDs that exist in the dataset', () => {
  const ids = new Set(generated.categories.map((c) => c.catId));
  const missing = Object.keys(curated.catIds).filter((id) => !ids.has(id));
  assert.deepEqual(missing, [], 'every curated CatID must be a real official CatID');
  const categoryCodes = new Set(generated.categories.map((c) => c.category));
  const unknownCodes = Object.keys(curated.categories).filter((code) => !categoryCodes.has(code));
  assert.deepEqual(unknownCodes, [], 'every curated category code must exist');
  assert.equal(Object.keys(curated.categories).length, 82, 'all 82 categories have a Chinese name');
});

/* -------------------------------------------------------------- generated --- */

test('the generated dataset matches the vendored source byte for byte', async () => {
  assert.equal(generated.sourceSha256, sha256(csvText), 'the generated file records a stale source hash');
  assert.equal(generated.sourceVerified, true);
  assert.equal(generated.complete, true, 'the official dataset must be marked complete');
  assert.equal(generated.version, '8.2.1');
  assert.equal(generated.sourceRows, 753);
  assert.equal(generated.expectedRows, 753);
  assert.equal(generated.officialCategories, 82);
  assert.equal(generated.skippedRows, 0);
  assert.equal(generated.categories.length, 753);
});

test('a full official dataset is no longer rejected by a guessed row threshold', () => {
  // Regression guard: the old generator required >= 1000 rows, which the real
  // 753-row UCS list can never satisfy, so it always wrote complete:false.
  assert.equal(generated.complete, true);
  assert.ok(
    generated.note.includes('Official UCS'),
    `the note should describe an official list, got: ${generated.note}`,
  );
  assert.equal(generated.droppedSeedCatIds, 177, 'the 177 invented seed CatIDs must be reported as dropped');
});

test('--check verifies the committed dataset and writes nothing', async () => {
  const before = await readFile(GENERATED_URL, 'utf8');
  const code = await main(['--check']);
  assert.equal(code, 0, 'the committed dataset must match its source');
  const after = await readFile(GENERATED_URL, 'utf8');
  assert.equal(after, before, '--check must not modify the dataset');
});

test('--help exits 0 and prints usage', async () => {
  assert.equal(await main(['--help']), 0);
});

test('an unknown flag exits 1', async () => {
  assert.equal(await main(['--definitely-not-a-flag']), 1);
});

test('a missing source exits 1 instead of silently succeeding', async () => {
  const code = await main(['--source', fileURLToPath(new URL('../data/does-not-exist.csv', import.meta.url))]);
  assert.equal(code, 1, 'a missing local source is a hard error');
});
