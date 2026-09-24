/**
 * Sidecar backup/import tests.
 *
 * Import is the riskiest operation in this codebase: it writes annotations across a
 * whole library, and a wrong match attaches the user's favourites and manual
 * classifications to the wrong files — silently, with no way to notice. So the tests
 * concentrate on the matching rules, and above all on **refusing to guess**: a tie
 * must produce a skip, never a coin flip.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BACKUP_FORMAT_VERSION,
  BackupError,
  buildMatchIndex,
  fromPortableRelative,
  matchRecord,
  nameSizeKey,
  parseBackup,
  planImport,
  toPortableRelative,
  type BackupAnnotation,
  type LibraryBackup,
  type MatchCandidate,
} from './sidecar.ts';
import { safePlaylistFileName, toM3u } from './playlists.ts';

function candidate(patch: Partial<MatchCandidate> & { assetId: number }): MatchCandidate {
  return {
    relativePath: 'Doors/wood_close.wav',
    contentHash: null,
    filename: 'wood_close.wav',
    sizeBytes: 1000,
    ...patch,
  };
}

function annotation(patch: Partial<BackupAnnotation> = {}): BackupAnnotation {
  return {
    relativePath: 'Doors/wood_close.wav',
    contentHash: null,
    filename: 'wood_close.wav',
    sizeBytes: 1000,
    tags: ['门'],
    favorite: true,
    rating: 4,
    ucsCatId: 'DOORWood',
    manual: true,
    ...patch,
  };
}

function backup(patch: Partial<LibraryBackup> = {}): LibraryBackup {
  return {
    format: 'sounddesk-sidecar-backup',
    version: BACKUP_FORMAT_VERSION,
    createdAt: '2026-01-01T00:00:00.000Z',
    app: 'test',
    libraryName: 'Test',
    counts: { annotations: 0, playlists: 0, searches: 0, usage: 0 },
    annotations: [],
    playlists: [],
    searches: [],
    usage: [],
    ...patch,
  };
}

// ---------------------------------------------------------------------------
// portable paths
// ---------------------------------------------------------------------------

test('paths are stored with forward slashes, so a backup is portable', () => {
  assert.equal(toPortableRelative('C:\\lib', 'C:\\lib\\Doors\\Wood\\a.wav'), 'Doors/Wood/a.wav');
  assert.equal(toPortableRelative('/home/me/lib', '/home/me/lib/Doors/a.wav'), 'Doors/a.wav');
  // a root with a trailing separator must not leave an empty segment
  assert.equal(toPortableRelative('C:\\lib\\', 'C:\\lib\\Doors\\a.wav'), 'Doors/a.wav');
});

test('paths round-trip through the portable form', () => {
  const original = 'C:\\lib\\Doors\\Wood\\a.wav';
  const portable = toPortableRelative('C:\\lib', original);
  assert.equal(portable, 'Doors/Wood/a.wav');
  assert.equal(fromPortableRelative(portable, '\\'), 'Doors\\Wood\\a.wav');
  assert.equal(fromPortableRelative(portable, '/'), 'Doors/Wood/a.wav');
});

// ---------------------------------------------------------------------------
// parsing (untrusted input)
// ---------------------------------------------------------------------------

test('parseBackup accepts a well-formed file and reports its counts', () => {
  const parsed = parseBackup({
    format: 'sounddesk-sidecar-backup',
    version: 1,
    createdAt: '2026-02-02T00:00:00.000Z',
    app: '0.1.0',
    libraryName: 'My Library',
    annotations: [annotation()],
    playlists: [{ name: 'Grabs', items: [{ relativePath: 'a.wav', filename: 'a.wav', sizeBytes: 1 }] }],
    searches: [{ query: 'door', mode: 'hybrid', hits: 3, at: 1 }],
    usage: [{ relativePath: 'a.wav', contentHash: null, query: 'door', kind: 'play', at: 1 }],
  });
  assert.equal(parsed.libraryName, 'My Library');
  assert.deepEqual(parsed.counts, { annotations: 1, playlists: 1, searches: 1, usage: 1 });
  assert.equal(parsed.annotations[0]!.favorite, true);
});

test('parseBackup rejects a file that is not ours, with a reason', () => {
  assert.throws(() => parseBackup(null), BackupError);
  assert.throws(() => parseBackup('nope'), BackupError);
  assert.throws(() => parseBackup({}), /不是 SoundDesk 的备份/);
  assert.throws(() => parseBackup({ format: 'something-else' }), /不是 SoundDesk 的备份/);
});

test('parseBackup refuses a newer format instead of guessing at it', () => {
  assert.throws(
    () => parseBackup({ format: 'sounddesk-sidecar-backup', version: BACKUP_FORMAT_VERSION + 1 }),
    /更新/,
  );
  // a missing version is also refused: we cannot know how to read it
  assert.throws(() => parseBackup({ format: 'sounddesk-sidecar-backup' }), /版本号/);
});

test('parseBackup tolerates missing sections and clamps hostile values', () => {
  const parsed = parseBackup({
    format: 'sounddesk-sidecar-backup',
    version: 1,
    annotations: [
      { relativePath: 'a.wav', filename: 'a.wav', sizeBytes: 'lots', rating: 99, tags: ['ok', 5, null], favorite: 'yes' },
      null,
    ],
  });
  assert.equal(parsed.annotations.length, 2);
  const first = parsed.annotations[0]!;
  assert.equal(first.rating, 5, 'rating clamped to the valid range');
  assert.deepEqual(first.tags, ['ok'], 'non-strings dropped from tags');
  assert.equal(first.favorite, false, 'a non-boolean is not treated as true');
  // the null entry becomes an empty record rather than throwing
  assert.equal(parsed.annotations[1]!.relativePath, '');
  // absent sections are simply empty
  assert.deepEqual(parsed.playlists, []);
  assert.deepEqual(parsed.searches, []);
});

test('parseBackup drops search entries with no query', () => {
  const parsed = parseBackup({
    format: 'sounddesk-sidecar-backup',
    version: 1,
    searches: [{ query: 'good', mode: 'hybrid', hits: 1, at: 1 }, { query: '', mode: 'hybrid', hits: 0, at: 0 }, {}],
  });
  assert.equal(parsed.searches.length, 1);
  assert.equal(parsed.searches[0]!.query, 'good');
});

// ---------------------------------------------------------------------------
// matching
// ---------------------------------------------------------------------------

test('a content hash matches across a rename and a move', () => {
  const index = buildMatchIndex([
    candidate({ assetId: 7, relativePath: 'elsewhere/renamed.wav', filename: 'renamed.wav', contentHash: 'abc' }),
  ]);
  const { match } = matchRecord(index, annotation({ contentHash: 'abc' }));
  assert.deepEqual(match, { assetId: 7, method: 'hash' });
});

test('library-relative path matches when the whole library moved', () => {
  const index = buildMatchIndex([candidate({ assetId: 9 })]);
  const { match } = matchRecord(index, annotation());
  assert.deepEqual(match, { assetId: 9, method: 'path' });
});

test('filename + size is the fallback for an empty destination', () => {
  const index = buildMatchIndex([
    candidate({ assetId: 3, relativePath: 'moved/wood_close.wav' }),
  ]);
  // path no longer matches, but name and size do
  const { match } = matchRecord(index, annotation({ relativePath: 'old/wood_close.wav' }));
  assert.deepEqual(match, { assetId: 3, method: 'name-size' });
});

test('path matching is case-insensitive, because Windows paths differ only in case', () => {
  const index = buildMatchIndex([candidate({ assetId: 4, relativePath: 'Doors/Wood/Close.WAV' })]);
  const { match } = matchRecord(index, annotation({ relativePath: 'doors/wood/close.wav' }));
  assert.equal(match?.assetId, 4);
});

test('hash wins over path, so a moved-and-edited file is still recognised', () => {
  const index = buildMatchIndex([
    candidate({ assetId: 1, relativePath: 'a/one.wav', contentHash: 'hash-1' }),
    candidate({ assetId: 2, relativePath: 'Doors/wood_close.wav', contentHash: 'hash-2' }),
  ]);
  const { match } = matchRecord(index, annotation({ contentHash: 'hash-1' }));
  assert.deepEqual(match, { assetId: 1, method: 'hash' });
});

test('a tie on any identifier is refused rather than guessed', () => {
  // Two identical files: a duplicated take, or the same sample in two libraries.
  const index = buildMatchIndex([
    candidate({ assetId: 1, relativePath: 'a/x.wav', contentHash: 'same' }),
    candidate({ assetId: 2, relativePath: 'b/x.wav', contentHash: 'same' }),
  ]);
  const result = matchRecord(index, annotation({ contentHash: 'same' }));
  assert.equal(result.match, null, 'two candidates must not become a coin flip');
  assert.equal(result.ambiguous, 'hash');
});

test('a tie on the fallback is refused too', () => {
  const index = buildMatchIndex([
    candidate({ assetId: 1, relativePath: 'one/x.wav' }),
    candidate({ assetId: 2, relativePath: 'two/x.wav' }),
  ]);
  const result = matchRecord(index, annotation({ relativePath: 'gone/x.wav' }));
  assert.equal(result.match, null);
  assert.equal(result.ambiguous, 'name-size');
});

test('an unmatched record reports neither a match nor ambiguity', () => {
  const index = buildMatchIndex([candidate({ assetId: 1 })]);
  const result = matchRecord(index, annotation({ relativePath: 'nowhere/other.wav', filename: 'other.wav', sizeBytes: 9 }));
  assert.deepEqual(result, { match: null, ambiguous: null });
});

test('a record with no identifiers at all matches nothing', () => {
  const index = buildMatchIndex([candidate({ assetId: 1 })]);
  const result = matchRecord(index, { relativePath: '', contentHash: null, filename: '', sizeBytes: 0 });
  assert.deepEqual(result, { match: null, ambiguous: null });
});

test('nameSizeKey is case-insensitive on the name but exact on the size', () => {
  assert.equal(nameSizeKey('A.WAV', 10), nameSizeKey('a.wav', 10));
  assert.notEqual(nameSizeKey('a.wav', 10), nameSizeKey('a.wav', 11));
});

// ---------------------------------------------------------------------------
// import planning (the dry run)
// ---------------------------------------------------------------------------

test('planImport matches, classifies by method, and applies nothing', () => {
  const candidates = [
    candidate({ assetId: 1, relativePath: 'a/one.wav', filename: 'one.wav', contentHash: 'h1' }),
    candidate({ assetId: 2, relativePath: 'b/two.wav', filename: 'two.wav' }),
  ];
  const plan = planImport(
    backup({
      annotations: [
        annotation({ relativePath: 'a/one.wav', filename: 'one.wav', contentHash: 'h1' }),
        annotation({ relativePath: 'b/two.wav', filename: 'two.wav' }),
        annotation({ relativePath: 'gone/three.wav', filename: 'three.wav', sizeBytes: 5 }),
      ],
    }),
    candidates,
  );

  assert.equal(plan.annotations.length, 2);
  assert.deepEqual(plan.byMethod, { hash: 1, path: 1, 'name-size': 0 });
  assert.equal(plan.unmatched.length, 1);
  assert.equal(plan.unmatched[0]!.relativePath, 'gone/three.wav');
  assert.deepEqual(plan.ambiguous, []);
});

test('planImport counts a fallback match as a fallback, so the user can judge it', () => {
  const plan = planImport(
    backup({ annotations: [annotation({ relativePath: 'moved/wood_close.wav' })] }),
    [candidate({ assetId: 3, relativePath: 'new/wood_close.wav' })],
  );
  assert.equal(plan.byMethod['name-size'], 1, 'the weaker match must be visible in the report');
  assert.equal(plan.annotations[0]!.method, 'name-size');
});

test('planImport gives one asset at most one record', () => {
  const plan = planImport(
    backup({
      annotations: [
        annotation({ tags: ['first'] }),
        annotation({ tags: ['second'] }),
      ],
    }),
    [candidate({ assetId: 1 })],
  );
  assert.equal(plan.annotations.length, 1, 'the second record must not overwrite the first');
  assert.deepEqual(plan.annotations[0]!.annotation.tags, ['first'], 'first one wins');
  assert.equal(plan.ambiguous.length, 1, 'and the dropped record is reported');
});

test('planImport folds orphan records in, for a library that has not been rescanned', () => {
  const plan = planImport(
    backup({
      annotations: [annotation({ tags: ['live'] })],
      orphans: [annotation({ relativePath: 'Doors/other.wav', filename: 'other.wav', tags: ['orphan'] })],
    }),
    [candidate({ assetId: 1 }), candidate({ assetId: 2, relativePath: 'Doors/other.wav', filename: 'other.wav' })],
  );
  assert.equal(plan.annotations.length, 2);
  const byAsset = new Map(plan.annotations.map((entry) => [entry.assetId, entry.annotation.tags]));
  assert.deepEqual(byAsset.get(1), ['live']);
  assert.deepEqual(byAsset.get(2), ['orphan'], 'an orphan record is still applied when its file now exists');
});

test('planImport ignores placeholder records with neither path nor name', () => {
  const plan = planImport(
    backup({ annotations: [annotation({ relativePath: '', filename: '' })] }),
    [candidate({ assetId: 1 })],
  );
  assert.equal(plan.annotations.length, 0);
  assert.equal(plan.unmatched.length, 0, 'a placeholder is not reported as a failure');
});

test('planImport is deterministic: the same input gives the same plan', () => {
  const candidates = [
    candidate({ assetId: 1, contentHash: 'h' }),
    candidate({ assetId: 2, relativePath: 'x/two.wav', filename: 'two.wav' }),
  ];
  const data = backup({
    annotations: [
      annotation({ contentHash: 'h' }),
      annotation({ relativePath: 'x/two.wav', filename: 'two.wav' }),
    ],
  });
  const first = planImport(data, candidates);
  const second = planImport(data, candidates);
  assert.deepEqual(first.byMethod, second.byMethod);
  assert.deepEqual(
    first.annotations.map((entry) => entry.assetId),
    second.annotations.map((entry) => entry.assetId),
  );
});

test('an empty backup plans a no-op', () => {
  const plan = planImport(backup(), [candidate({ assetId: 1 })]);
  assert.deepEqual(plan.annotations, []);
  assert.deepEqual(plan.unmatched, []);
  assert.deepEqual(plan.ambiguous, []);
  assert.deepEqual(plan.byMethod, { hash: 0, path: 0, 'name-size': 0 });
});

// ---------------------------------------------------------------------------
// M3U export
// ---------------------------------------------------------------------------

test('toM3u writes a valid M3U8 a player can read', () => {
  const text = toM3u(
    [
      { path: 'C:\\lib\\Doors\\a.wav', durationSeconds: 1.234, title: 'a.wav' },
      { path: 'C:\\lib\\Doors\\b.wav', durationSeconds: 60, title: 'b.wav' },
    ],
    '我的列表',
  );

  const lines = text.split('\n');
  assert.equal(lines[0], '#EXTM3U', 'the header is required');
  // seconds are rounded, which is what #EXTINF specifies
  assert.equal(lines[1], '#EXTINF:1,a.wav');
  assert.equal(lines[2], 'C:\\lib\\Doors\\a.wav');
  assert.equal(lines[3], '#EXTINF:60,b.wav');
  assert.equal(lines[4], 'C:\\lib\\Doors\\b.wav');
  assert.equal(text.endsWith('\n'), true, 'some players ignore a final line without a newline');
});

test('toM3u marks an unknown duration the way the format expects', () => {
  const text = toM3u([{ path: '/x/a.wav', durationSeconds: null, title: 'a' }], 'p');
  // -1 is the conventional "unknown" value
  assert.ok(text.includes('#EXTINF:-1,a'), text);
});

test('toM3u keeps non-ASCII names intact and cannot be broken by a newline in a title', () => {
  const text = toM3u([{ path: '/x/金属门.wav', durationSeconds: 2, title: '金属门\n第二行' }], 'p');
  assert.ok(text.includes('金属门'), 'a Chinese name must survive');
  // A raw newline would be read as the path line, silently corrupting the entry.
  assert.equal(text.split('\n').filter((line) => line.includes('第二行')).length, 1);
  assert.ok(text.includes('金属门 第二行'), 'the newline is collapsed into a space');
});

test('toM3u handles an empty playlist and the last line has no stray separator', () => {
  const text = toM3u([], 'empty');
  assert.equal(text, '#EXTM3U\n');
});

test('toM3u titles fall back to the path when a name is missing', () => {
  const text = toM3u([{ path: '/x/a.wav', durationSeconds: 1, title: '' }], 'p');
  assert.ok(text.includes('#EXTINF:1,/x/a.wav'), text);
});

test('safePlaylistFileName produces a writable name', () => {
  assert.equal(safePlaylistFileName('My List'), 'My List.m3u8');
  // path separators and the characters Windows forbids are replaced
  assert.equal(safePlaylistFileName('a/b:c*d?'), 'a_b_c_d_.m3u8');
  assert.equal(safePlaylistFileName('  trailing.  '), 'trailing.m3u8');
  // never empty, so a download always has a usable name
  assert.equal(safePlaylistFileName('   '), 'playlist.m3u8');
  assert.ok(safePlaylistFileName('金属/门').startsWith('金属'), 'non-ASCII names are kept');
});
