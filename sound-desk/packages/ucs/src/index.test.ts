/**
 * src/index.test.ts — node:test + node:assert/strict.
 *
 * Run:  node --test --experimental-strip-types src/*.test.ts
 * Direct: node --experimental-strip-types src/index.test.ts
 *
 * Type-strippable syntax only (no enums, no namespaces, no parameter properties).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
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
} from './index.ts';

import type { Lang, UcsCategory, UcsDataset, UcsFilenameParts } from './index.ts';

const AUDIO_RE = /\.(wav|aif|aiff|flac|mp3|ogg)$/i;

/* -------------------------------------------------------------------------- */
/* 1. Dataset integrity                                                       */
/* -------------------------------------------------------------------------- */

test('dataset loads with a version and the full official UCS list', () => {
  const ds: UcsDataset = dataset;
  assert.equal(typeof ds.version, 'string');
  assert.match(ds.version, /^\d+\.\d+/);
  assert.equal(typeof ds.complete, 'boolean');
  assert.equal(ds.complete, true, 'the generated official dataset must claim completeness');
  assert.equal(ds.version, '8.2.1');
  assert.ok(Array.isArray(ds.categories));
  // The official UCS v8.2.1 list is exactly 753 subcategories across 82 categories.
  assert.equal(ds.categories.length, 753, `expected the official 753 entries, got ${ds.categories.length}`);
  assert.equal(new Set(ds.categories.map((c) => c.category)).size, 82);
  assert.ok(typeof ds.note === 'string' && ds.note.length > 0);
});

test('every CatID is a real official UCS ID, not a hand-invented one', () => {
  // Regression guard: the seed shipped CatIDs like AIRCRAFTCabin and
  // AMBDesignedDark that do not exist in UCS. Only DOORWood was real.
  for (const bogus of ['AIRCRAFTCabin', 'AMBDesignedDark', 'FOLEYFootstepsBoots', 'IMPACTMetal']) {
    assert.equal(isKnownCatId(bogus), false, `${bogus} is not a real UCS CatID`);
  }
  assert.equal(isKnownCatId('DOORWood'), true);
  assert.equal(isKnownCatId('WATRUndwtr'), true);
  assert.equal(isKnownCatId('DSGNRmbl'), true);
});

test('every catId is unique and matches /^[A-Za-z]+$/', () => {
  const seen = new Set<string>();
  for (const entry of dataset.categories) {
    assert.match(entry.catId, /^[A-Za-z]+$/, `catId not alphabetic: ${entry.catId}`);
    assert.ok(!seen.has(entry.catId), `duplicate catId: ${entry.catId}`);
    seen.add(entry.catId);
  }
});

test('every entry has a non-empty category/subCategory and >=1 en synonym', () => {
  let withZh = 0;
  for (const entry of dataset.categories) {
    assert.ok(entry.category.length > 0, `${entry.catId}: empty category`);
    assert.match(entry.category, /^[A-Z][A-Z &0-9]*$/, `${entry.catId}: category not an uppercase code`);
    assert.ok(entry.subCategory.length > 0, `${entry.catId}: empty subCategory`);
    assert.ok(entry.synonymsEn.length >= 1, `${entry.catId}: no English synonyms`);
    assert.ok(Array.isArray(entry.excludes), `${entry.catId}: excludes is not an array`);
    for (const synonym of entry.synonymsEn) {
      assert.equal(typeof synonym, 'string');
      assert.ok(synonym.trim().length > 0, `${entry.catId}: blank English synonym`);
    }
    // Chinese synonyms are curated for a subset of the official list, never for
    // all of it, so a missing list is fine but a present one must be Chinese.
    if (entry.synonymsZh.length > 0) {
      withZh += 1;
      for (const synonym of entry.synonymsZh) {
        assert.equal(typeof synonym, 'string');
        assert.ok(/[\u4e00-\u9fff]/.test(synonym), `${entry.catId}: Chinese synonym without Han chars: ${synonym}`);
      }
    }
  }
  assert.ok(withZh >= 145, `expected the curated Chinese overlay on >= 145 entries, got ${withZh}`);
});

test('catId always starts with its category code', () => {
  for (const entry of dataset.categories) {
    const code = entry.code ?? entry.category;
    assert.ok(
      entry.catId.startsWith(code),
      `${entry.catId} does not start with ${code} (category ${entry.category})`,
    );
    // CatShort is always a prefix of CatID, but the official compression means
    // the remainder is NOT the readable subcategory (AIRBrst -> "Brst" vs
    // "Burst"), so only the prefix relation is asserted.
    assert.ok(entry.catId.length >= code.length, `${entry.catId}: shorter than its code ${code}`);
  }
});

test('abbreviated categories carry an explicit code (AMB, DOOR, MACHINE, ...)', () => {
  const abbreviated = dataset.categories.filter((c) => c.code !== undefined && c.code !== c.category);
  assert.ok(abbreviated.length > 0, 'expected at least one category whose CatID prefix differs from its name');
  const codes = new Set(abbreviated.map((c) => c.code));
  for (const expected of ['AMB', 'DOOR', 'MACH', 'MOVE', 'WATR', 'AERO']) {
    assert.ok(codes.has(expected), `expected an entry with code ${expected}`);
  }
  // Every abbreviation is short and upper-case.
  for (const entry of abbreviated) {
    assert.match(entry.code as string, /^[A-Z0-9]{2,5}$/, `${entry.code} is not a UCS-style code`);
  }
  // Most codes are a vowel-elided form of the category name, where the code's
  // letters appear in order inside the name (WATER -> WATR, ALARMS -> ALRM,
  // CROWDS -> CRWD). The rest are semantic: the CatShort names the group rather
  // than the parent category. That set is enumerated below and the assertion is
  // bidirectional, so a code that stops being elided without being registered
  // here fails the test.
  const isElided = (category: string, code: string) => {
    const name = category.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (name.charAt(0) !== code.charAt(0)) return false;
    // (a) the code's letters appear in order somewhere in the name
    //     (WATER -> WATR, ALARMS -> ALRM, CROWDS -> CRWD, SWOOSHES -> SWSH)
    let at = 0;
    let inOrder = true;
    for (const ch of code) {
      at = name.indexOf(ch, at);
      if (at === -1) {
        inOrder = false;
        break;
      }
      at += 1;
    }
    if (inOrder) return true;
    // (b) the code is an initialism of the name's words (USER INTERFACE -> UI)
    const initials = category
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase())
      .join('');
    return initials === code;
  };

  // ARCHIVED is special: its CatIDs are the bare CatShort (ADR, MIX, RAW, WIP,
  // WTF), so no code relates to the name "ARCHIVED" at all.
  const ARCHIVED_CODES = new Set([
    'ADR', 'ASSET', 'BNCE', 'IR', 'LPGRP', 'MIX', 'PFX', 'PROD', 'RAW', 'REF', 'SCNE', 'TEST', 'TMARK', 'WIP', 'WTF',
  ]);
  const SEMANTIC_CODES: Record<string, string[]> = {
    AIRCRAFT: ['AERO'],
    CARTOON: ['TOON'],
    FOOTSTEPS: ['FEET'],
    SWOOSHES: ['WHSH'],
    VOICES: ['VOX'],
    // WEATHER is four one-off members, each carrying its own CatShort.
    WEATHER: ['HAIL', 'STORM', 'THUN'],
  };
  const semanticCodes = new Set(Object.values(SEMANTIC_CODES).flat());

  const observedSemantic = new Set<string>();
  for (const entry of abbreviated) {
    const code = entry.code as string;
    if (isElided(entry.category, code)) continue;
    if (entry.category === 'ARCHIVED' && ARCHIVED_CODES.has(code)) continue;
    observedSemantic.add(code);
    assert.ok(
      semanticCodes.has(code),
      `${code} for ${entry.category} is not a vowel-elided form of the name; add it to SEMANTIC_CODES with a reason`,
    );
  }
  for (const code of semanticCodes) {
    assert.ok(observedSemantic.has(code), `${code} is listed in SEMANTIC_CODES but is no longer in the dataset`);
  }

  // every ARCHIVED CatID is exactly its code
  for (const entry of dataset.categories.filter((c) => c.category === 'ARCHIVED')) {
    assert.equal(entry.catId, entry.code, `ARCHIVED entry ${entry.catId} should be its bare CatShort`);
  }
  // entries whose CatID prefix equals their category name still expose a code
  for (const entry of dataset.categories) {
    assert.equal(typeof entry.code, 'string', `${entry.catId}: missing code`);
    assert.ok(entry.catId.startsWith(entry.code as string));
  }
});

/* -------------------------------------------------------------------------- */
/* 2. listCategories / listSubCategories                                      */
/* -------------------------------------------------------------------------- */

test('listCategories counts are consistent with the dataset', () => {
  const categories = listCategories();
  const expectedCodes = [...new Set(dataset.categories.map((c) => c.category))].sort();
  assert.deepEqual(categories.map((c) => c.code), expectedCodes);

  let total = 0;
  for (const item of categories) {
    const actual = dataset.categories.filter((c) => c.category === item.code).length;
    assert.equal(item.count, actual, `${item.code}: count mismatch`);
    assert.ok(item.label.length > 0, `${item.code}: empty label`);
    total += item.count;
  }
  assert.equal(total, dataset.categories.length);
});

test('listSubCategories counts are consistent and every subCategory is covered once', () => {
  let total = 0;
  for (const category of listCategories()) {
    const subs = listSubCategories(category.code);
    assert.equal(subs.length, category.count, `${category.code}: subcategory count mismatch`);
    for (const sub of subs) {
      assert.equal(sub.count, 1);
      assert.ok(sub.label.length > 0, `${sub.catId}: empty label`);
      const entry = dataset.categories.find((c) => c.catId === sub.catId);
      assert.ok(entry, `${sub.catId} not in dataset`);
      assert.equal(entry?.category, category.code);
      total += sub.count;
    }
  }
  assert.equal(total, dataset.categories.length);
});

test('listSubCategories is case-insensitive and unknown categories give []', () => {
  assert.deepEqual(
    listSubCategories('doors').map((s) => s.catId),
    listSubCategories('DOORS').map((s) => s.catId),
  );
  assert.deepEqual(listSubCategories('NOT_A_CATEGORY'), []);
});

test('labels resolve in both languages', () => {
  assert.equal(labelFor('DOORWood'), 'Wood');
  assert.equal(labelFor('DOORWood', 'zh-Hans'), '木门');
  assert.equal(labelFor('DOORS'), 'DOORS');
  assert.equal(labelFor('DOORS', 'zh-Hans'), '门');
  assert.equal(labelFor('doorwood'), 'Wood', 'labelFor should be case-insensitive');
  assert.equal(labelFor(''), '');
  assert.equal(labelFor('NOPE'), 'NOPE', 'unknown codes pass through');
  // Every UCS category has a curated Chinese name.
  for (const category of listCategories()) {
    assert.notEqual(labelFor(category.code, 'zh-Hans'), category.code, `${category.code} has no zh label`);
  }
});

test('a category code that is also a CatID resolves to the category name, not a subcategory', () => {
  // AIR, RAIN, HAIL, WIND, STORM, WTHR and MIX are both a category code and a
  // bare CatID. The CatID-level Chinese label describes one subcategory
  // ("雨声户外"), so the category name must win.
  assert.equal(labelFor('RAIN', 'zh-Hans'), '雨');
  assert.equal(labelFor('AIR', 'zh-Hans'), '气流');
  assert.equal(labelFor('WIND', 'zh-Hans'), '风');
  assert.equal(labelFor('RAIN'), 'General', 'the English label still comes from the CatID');
});

/* -------------------------------------------------------------------------- */
/* 3. lookup / isKnownCatId                                                   */
/* -------------------------------------------------------------------------- */

test('lookup matches catId, category, subCategory and synonyms', () => {
  assert.ok(lookup('DOORWood').some((e) => e.catId === 'DOORWood'));
  assert.ok(lookup('wooden door').some((e) => e.catId === 'DOORWood'));
  assert.ok(lookup('wood door creak').some((e) => e.catId === 'DOORWood'));
  assert.ok(lookup('木门').some((e) => e.catId === 'DOORWood'));
  assert.equal(lookup('DOORWood', { limit: 1 }).length, 1);
  assert.deepEqual(lookup(''), []);
  assert.equal(lookup('qqqzzzxyzzy').length, 0);
  assert.equal(lookup('啊啊毫无关联').length, 0);

  const doors = lookup('DOORS');
  assert.ok(doors.length >= 1);
  for (const entry of doors.slice(0, 1)) assert.equal(entry.category, 'DOORS');

  // deterministic ordering
  const a = lookup('metal').map((e) => e.catId);
  const b = lookup('metal').map((e) => e.catId);
  assert.deepEqual(a, b);
});

test('isKnownCatId is exact and case-insensitive', () => {
  assert.equal(isKnownCatId('DOORWood'), true);
  assert.equal(isKnownCatId('doorwood'), true);
  assert.equal(isKnownCatId(' DOORWood '), true);
  assert.equal(isKnownCatId('DOORS'), false, 'category codes are not CatIDs');
  assert.equal(isKnownCatId('DOORWoodExtra'), false);
  assert.equal(isKnownCatId(''), false);
  for (const entry of dataset.categories) assert.equal(isKnownCatId(entry.catId), true);
});

/* -------------------------------------------------------------------------- */
/* 4. promptsFor / allPrompts                                                 */
/* -------------------------------------------------------------------------- */

test('promptsFor is non-empty and deterministic for every catId', () => {
  for (const entry of dataset.categories) {
    const first = promptsFor(entry.catId);
    const second = promptsFor(entry.catId);
    assert.ok(first.length > 0, `${entry.catId}: no prompts`);
    assert.deepEqual(first, second, `${entry.catId}: prompts are not deterministic`);
    for (const prompt of first) {
      assert.equal(typeof prompt, 'string');
      assert.ok(prompt.trim().length > 0, `${entry.catId}: blank prompt`);
      assert.ok(prompt.length < 200, `${entry.catId}: prompt suspiciously long`);
    }
    assert.deepEqual([...new Set(first)], first, `${entry.catId}: duplicate prompts`);
  }
  assert.deepEqual(promptsFor('NOPE_NOT_REAL'), []);
});

test('promptsFor uses the entry synonyms and reads like a caption', () => {
  const prompts = promptsFor('DOORWood');
  assert.ok(prompts.length >= 2);
  assert.match(prompts[0] as string, /^a sound effect of /);
  assert.ok(
    prompts.some((p) => p.toLowerCase().includes('door')),
    `expected a door prompt, got ${JSON.stringify(prompts)}`,
  );
  assert.ok(
    prompts.some((p) => p.includes(',')),
    `expected a comma-joined alternative, got ${JSON.stringify(prompts)}`,
  );
});

test('allPrompts covers every dataset entry exactly once', () => {
  const flat = allPrompts();
  assert.equal(flat.length, dataset.categories.length);
  assert.deepEqual(
    flat.map((p) => p.catId).sort(),
    dataset.categories.map((c) => c.catId).sort(),
  );
  for (const item of flat) {
    assert.ok(item.prompts.length > 0, `${item.catId}: empty prompt list`);
    assert.deepEqual(item.prompts, promptsFor(item.catId));
  }
});

/* -------------------------------------------------------------------------- */
/* 5. Filenames                                                               */
/* -------------------------------------------------------------------------- */

test('parseUcsFilename round-trips through buildUcsFilename', () => {
  const input = 'DOORWood_Wooden Door Close_Mylib_MZhang_20260501_01.wav';
  const parsed = parseUcsFilename(input);
  assert.ok(parsed, 'expected a parse result');
  const parts = parsed as UcsFilenameParts;
  assert.equal(parts.catId, 'DOORWood');
  assert.equal(parts.description, 'Wooden Door Close');
  assert.equal(parts.vendor, 'Mylib');
  assert.equal(parts.creator, 'MZhang');
  assert.equal(parts.source, '20260501');
  assert.equal(parts.index, '01');
  assert.equal(parts.extension, 'wav');

  // UCS writes spaces inside a field as dashes, so the canonical form of the
  // input above uses dashes and that form round-trips byte-exactly.
  const canonical = 'DOORWood_Wooden-Door-Close_Mylib_MZhang_20260501_01.wav';
  assert.equal(buildUcsFilename(parts), canonical);
  assert.deepEqual(parseUcsFilename(canonical), parts);
  assert.equal(buildUcsFilename(parseUcsFilename(canonical) as UcsFilenameParts), canonical);
  assert.deepEqual(parseUcsFilename(input), parseUcsFilename(canonical));

  // fields are optional
  const short = parseUcsFilename('IMPACTMetal_Metal Hit.wav');
  assert.ok(short);
  assert.equal(short?.catId, 'IMPACTMetal');
  assert.equal(short?.description, 'Metal Hit');
  assert.equal(short?.vendor, undefined);
  assert.equal(buildUcsFilename(short as UcsFilenameParts), 'IMPACTMetal_Metal-Hit.wav');
});

test('parseUcsFilename rejects non-audio and non-UCS input', () => {
  assert.equal(parseUcsFilename('notes.txt'), null);
  assert.equal(parseUcsFilename(''), null);
  assert.equal(parseUcsFilename('   '), null);
  assert.equal(parseUcsFilename('noextension'), null);
  assert.equal(parseUcsFilename('_leading.wav'), null, 'a leading underscore leaves no CatID token');
  assert.ok(parseUcsFilename('DOORWood_click.aif'));
  assert.ok(parseUcsFilename('DOORWood_click.flac'));
});

test('buildUcsFilename sanitises separators and defaults the extension', () => {
  const built = buildUcsFilename({
    catId: 'WATERRiver',
    description: 'River  Flow/Close_up',
    vendor: 'My_Lib',
    extension: 'WAV',
  });
  assert.equal(built, 'WATERRiver_River-Flow-Close-up_My-Lib.WAV');
  assert.equal(parseUcsFilename(built)?.catId, 'WATERRiver');
  assert.equal(buildUcsFilename({ catId: 'DOORWood', description: 'x', extension: '' }), 'DOORWood_x.wav');
  assert.throws(() => buildUcsFilename({ catId: 'bad id', description: 'x', extension: 'wav' }), TypeError);
});

test('every dataset catId survives a build/parse round trip', () => {
  for (const entry of dataset.categories) {
    const filename = buildUcsFilename({
      catId: entry.catId,
      description: entry.synonymsEn[0] as string,
      vendor: 'SoundDesk',
      creator: 'Seed',
      source: '20260101',
      index: '01',
      extension: 'wav',
    });
    assert.ok(AUDIO_RE.test(filename), `not an audio filename: ${filename}`);
    const parsed = parseUcsFilename(filename);
    assert.ok(parsed, `could not parse ${filename}`);
    assert.equal(parsed?.catId, entry.catId, `round trip lost catId for ${entry.catId}`);
    assert.equal(parsed?.index, '01');
  }
});

test('sniffFilename still yields tokens for a non-UCS name', () => {
  const sniffed = sniffFilename('cool_impact_03.wav');
  assert.ok(sniffed, 'expected a sniff result');
  assert.deepEqual(sniffed?.tokens, ['cool', 'impact', '03']);
  assert.equal(sniffed?.catId, undefined, 'cool_impact_03 is not a UCS CatID');

  const ucs = sniffFilename('DOORWood_Wooden-Door-Close_Mylib_01.wav');
  assert.equal(ucs?.catId, 'DOORWood');
  assert.deepEqual(ucs?.tokens, ['DOORWood', 'Wooden', 'Door', 'Close', 'Mylib', '01']);

  const lower = sniffFilename('doorwood_hit.wav');
  assert.equal(lower?.catId, 'DOORWood', 'sniffFilename should match CatIDs case-insensitively');

  // IMPACTMetal is not a real UCS CatID; the metal impact is METLImpt.
  assert.equal(sniffFilename('impactmetal_hit.wav')?.catId, undefined);
  assert.equal(sniffFilename('metlimpt_hit.wav')?.catId, 'METLImpt');

  assert.equal(sniffFilename(''), null);
  assert.equal(sniffFilename('   '), null);
});

/* -------------------------------------------------------------------------- */
/* 6. expandQueryZh                                                           */
/* -------------------------------------------------------------------------- */

test("expandQueryZh('金属门重重关上，空仓库') mentions a door and keeps the original", () => {
  const result = expandQueryZh('金属门重重关上，空仓库');
  assert.ok(result.captions.length > 0);
  assert.ok(result.captions.length <= 4);
  assert.match(result.rewritten.toLowerCase(), /door/);
  assert.ok(
    result.captions.includes('金属门重重关上，空仓库'),
    `captions must include the original input, got ${JSON.stringify(result.captions)}`,
  );
  assert.equal(result.captions[0], result.rewritten, 'the rewrite must be the first caption');
  assert.deepEqual([...new Set(result.captions)], result.captions, 'captions must be deduplicated');
  const matched = result.matched.find((m) => m.term === '金属门');
  assert.ok(matched, `expected 金属门 to match, got ${JSON.stringify(result.matched)}`);
  assert.equal(matched?.source, 'query-dict');
  // "金属门" and "空仓库" are both dictionary entries, so they match. The
    // connector phrase in between is not, and must be surfaced rather than
    // silently dropped — the UI shows it so the user knows what was ignored.
    assert.ok(result.matched.some((m) => m.term === '空仓库'));
    assert.ok(
      result.unmatched.some((t) => t.includes('重重关上')),
      `expected the connector phrase to be surfaced, got ${JSON.stringify(result.unmatched)}`,
    );
});

test("expandQueryZh('玻璃破碎，清脆，小碎块') mentions glass", () => {
  const result = expandQueryZh('玻璃破碎，清脆，小碎块');
  assert.match(result.rewritten.toLowerCase(), /glass/);
  assert.ok(result.captions.includes('玻璃破碎，清脆，小碎块'));
  assert.ok(result.matched.some((m) => m.term === '玻璃破碎'));
  assert.ok(result.matched.some((m) => m.term === '清脆'));
  assert.deepEqual(result.unmatched, []);
  assert.ok(result.rewritten.split(',').length >= 3, `expected a multi-term caption, got "${result.rewritten}"`);
});

test("expandQueryZh('脚步声，木地板，缓慢') rewrites all three terms", () => {
  const result = expandQueryZh('脚步声，木地板，缓慢');
  assert.equal(result.matched.length, 3);
  assert.deepEqual(result.unmatched, []);
  assert.match(result.rewritten.toLowerCase(), /footstep/);
  assert.match(result.rewritten.toLowerCase(), /floor/);
  assert.match(result.rewritten.toLowerCase(), /slow/);
  assert.ok(result.captions.length >= 2);
});

test("expandQueryZh('太鼓') resolves through the UCS synonym path", () => {
  const result = expandQueryZh('太鼓');
  assert.equal(result.matched.length, 1);
  assert.equal(result.matched[0]?.term, '太鼓');
  assert.equal(result.matched[0]?.source, 'ucs-synonym');
  assert.ok((result.matched[0]?.en.length ?? 0) >= 1);
  // 太鼓 is a percussion drum; the official UCS synonym list for
  // MUSICAL/PERCUSSION does not contain "taiko" at all, so the rewrite leads
  // with the subcategory's own word.
  assert.match(result.rewritten.toLowerCase(), /percussion|drum/);
  assert.deepEqual(result.unmatched, []);
  assert.ok(result.captions.includes('太鼓'));
});

test('UCS synonyms are reachable when the dictionary has no such key', () => {
  const result = expandQueryZh('木门吱呀');
  assert.ok(
    result.matched.some((m) => m.source === 'ucs-synonym') || result.matched.some((m) => m.term === '木门'),
    `expected a UCS synonym hit, got ${JSON.stringify(result.matched)}`,
  );
  assert.ok(result.rewritten.length > 0);
});

test('unmatched gibberish lands in `unmatched` and never throws', () => {
  const junk = '啊吧啦轰隆咚';
  const result = expandQueryZh(junk);
  assert.ok(result.unmatched.length >= 1, 'gibberish must be reported as unmatched');
  assert.deepEqual(result.captions, [junk], 'worst case: only the original input');
  assert.equal(result.rewritten, '');
  assert.deepEqual(result.matched, []);

  // never throws, never returns empty captions
  for (const input of ['', '   ', '，、；', '???', '😀😀', 'a'.repeat(5000)]) {
    const out = expandQueryZh(input);
    assert.ok(Array.isArray(out.captions));
    assert.ok(out.captions.length >= 1, `empty captions for ${JSON.stringify(input.slice(0, 10))}`);
    assert.ok(out.captions.length <= 4);
  }
});

test("no-separator input '金属撞击沉闷' still produces a sensible rewrite", () => {
  const result = expandQueryZh('金属撞击沉闷');
  assert.equal(result.rewritten.length > 0, true, 'expected a non-empty rewrite');
  assert.equal(result.captions.includes('金属撞击沉闷'), true);
  const lower = result.rewritten.toLowerCase();
  assert.ok(
    lower.includes('metal') || lower.includes('impact') || lower.includes('dull'),
    `expected a metal/impact/dull rewrite, got "${result.rewritten}"`,
  );
  for (const term of result.matched) {
    assert.equal(typeof term.term, 'string');
    assert.ok(term.term.length > 0);
  }
});

test('greedy segmentation consumes the whole no-separator phrase', () => {
  const result = expandQueryZh('玻璃破碎清脆');
  assert.ok(result.matched.some((m) => m.term === '玻璃破碎'), JSON.stringify(result.matched));
  assert.ok(result.matched.some((m) => m.term === '清脆'), JSON.stringify(result.matched));
  assert.deepEqual(result.unmatched, [], 'a fully-covered phrase must have no unmatched terms');
});

test('particles are stripped before retrying a term', () => {
  const withParticle = expandQueryZh('玻璃的');
  const bare = expandQueryZh('玻璃');
  assert.equal(withParticle.matched.length, 1);
  assert.equal(withParticle.matched[0]?.term, '玻璃');
  assert.deepEqual(withParticle.matched[0]?.en, bare.matched[0]?.en);
});

test('expandQueryZh separators: comma, ideographic comma, semicolon and spaces', () => {
  for (const input of ['玻璃破碎,清脆', '玻璃破碎、清脆', '玻璃破碎；清脆', '玻璃破碎;清脆', '玻璃破碎 清脆']) {
    const result = expandQueryZh(input);
    assert.ok(result.matched.length >= 2, `expected 2 matches for ${input}, got ${JSON.stringify(result.matched)}`);
    assert.deepEqual(result.unmatched, [], `unexpected unmatched for ${input}`);
  }
});

test('captions offer an alternative combination, not just a repeat', () => {
  const result = expandQueryZh('玻璃破碎，清脆，小碎块');
  assert.ok(result.captions.length >= 2);
  assert.notEqual(result.captions[0], result.captions[1]);
  assert.ok(result.captions.every((c) => c.length > 0));
});

/* -------------------------------------------------------------------------- */
/* 7. expandQuery                                                             */
/* -------------------------------------------------------------------------- */

test('expandQuery delegates to expandQueryZh for zh-Hans', () => {
  const lang: Lang = 'zh-Hans';
  assert.deepEqual(expandQuery('玻璃破碎', lang), expandQueryZh('玻璃破碎'));
  assert.deepEqual(expandQuery('太鼓', 'zh-Hans'), expandQueryZh('太鼓'));
  assert.equal(expandQuery('太鼓', 'zh-Hans').matched[0]?.source, 'ucs-synonym');
  assert.deepEqual(expandQuery('脚步声，木地板', lang), expandQueryZh('脚步声，木地板'));
});

test('expandQuery for English normalises whitespace and splits on commas', () => {
  const result = expandQuery('  glass   breaking ,  bright , small pieces ');
  assert.equal(result.rewritten, 'glass breaking, bright, small pieces');
  assert.ok(result.captions.includes('  glass   breaking ,  bright , small pieces '));
  assert.deepEqual(result.matched, []);
  assert.deepEqual(result.unmatched, ['glass breaking', 'bright', 'small pieces']);
  assert.equal(expandQuery('   ').captions.length, 1);
  assert.equal(expandQuery('metal impact').rewritten, 'metal impact');
});
