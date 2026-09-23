/**
 * Export tests.
 *
 * This module writes to the user's disk, so the tests are mostly about what it
 * *refuses* to do: escape the allowed roots, overwrite an existing file, or write
 * bytes that are not audio. Those are the failure modes that lose data, and they
 * are cheap to check.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ExportError, exportRootsFor, isInside, safeStem, saveExport, uniqueName } from './export.ts';
import { encodeWav } from '@sounddesk/audio-effects';

function tempRoot(): string {
  return mkdtempSync(path.join(tmpdir(), 'sounddesk-export-'));
}

/** A tiny but genuinely valid WAV, so the header check passes honestly. */
function tinyWav(samples = 16): Uint8Array {
  const data = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) data[i] = Math.sin((i / samples) * Math.PI * 2) * 0.5;
  return encodeWav([data], 48000, { bitsPerSample: 16 });
}

// ---------------------------------------------------------------------------
// name sanitising
// ---------------------------------------------------------------------------

test('safeStem strips anything that could escape a directory', () => {
  assert.equal(safeStem('door slam.wav'), 'door slam');
  // separators become underscores, never path structure
  assert.equal(safeStem('a/b/c.wav'), 'a_b_c');
  // Windows-forbidden characters are removed
  assert.equal(safeStem('a<b>c:d"e|f?g*h.wav'), 'abcdefgh');
  // trailing dots and spaces are illegal on Windows
  assert.equal(safeStem('name.  '), 'name');
  // reserved device names get a prefix so they cannot be used as a path
  assert.equal(safeStem('con.wav'), '_con');
  assert.equal(safeStem('NUL'), '_NUL');
  assert.equal(safeStem('lpt1.wav'), '_lpt1');
  // never empty, never absurdly long
  assert.ok(safeStem('').length > 0);
  assert.ok(safeStem('x'.repeat(500)).length <= 120);
  // an extension-only name still yields something writable
  assert.ok(safeStem('.wav').length > 0);
});

test('safeStem result never contains a separator or a traversal', () => {
  const nasty = ['../../etc/passwd', '..\\..\\x', 'a/../../b', 'C:\\Windows\\System32\\cmd'];
  for (const raw of nasty) {
    const stem = safeStem(raw);
    assert.ok(!stem.includes('/'), `${raw} -> ${stem} still has a slash`);
    assert.ok(!stem.includes('\\'), `${raw} -> ${stem} still has a backslash`);
    assert.ok(!stem.includes('..'), `${raw} -> ${stem} still has ..`);
  }
});

// ---------------------------------------------------------------------------
// collision handling
// ---------------------------------------------------------------------------

test('uniqueName never proposes an existing file', () => {
  const dir = tempRoot();
  try {
    const exists = (p: string): boolean => p.endsWith('taken.wav') || p.endsWith('taken-2.wav');

    const first = uniqueName(dir, 'taken', '.wav', exists);
    assert.equal(first.name, 'taken-3.wav');
    assert.equal(first.renamed, true);

    const clean = uniqueName(dir, 'fresh', '.wav', exists);
    assert.equal(clean.name, 'fresh.wav');
    assert.equal(clean.renamed, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('uniqueName uses the real filesystem when no predicate is given', () => {
  const dir = tempRoot();
  try {
    writeFileSync(path.join(dir, 'sound.wav'), 'x');
    assert.equal(uniqueName(dir, 'sound', '.wav').name, 'sound-2.wav');
    writeFileSync(path.join(dir, 'sound-2.wav'), 'x');
    assert.equal(uniqueName(dir, 'sound', '.wav').name, 'sound-3.wav');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// root containment
// ---------------------------------------------------------------------------

test('isInside accepts the root itself and its descendants only', () => {
  const root = path.join(tmpdir(), 'lib');
  assert.equal(isInside(root, root), true);
  assert.equal(isInside(root, path.join(root, 'sub', 'file.wav')), true);
  // a sibling directory whose name merely starts with the same text is not inside
  assert.equal(isInside(root, `${root}-other`), false);
  assert.equal(isInside(root, `${root}-other${path.sep}file.wav`), false);
  // and a parent is not inside
  assert.equal(isInside(root, path.dirname(root)), false);
});

test('exportRootsFor prefers the library root and always offers an export dir', () => {
  const dataDir = path.join(tmpdir(), 'data');
  const roots = exportRootsFor(path.join(tmpdir(), 'library'), dataDir);
  assert.equal(roots.length, 2);
  assert.ok(roots[1]!.includes('exports'));

  // no library: still a usable destination
  const withoutLibrary = exportRootsFor(null, dataDir);
  assert.equal(withoutLibrary.length, 1);
  assert.ok(withoutLibrary[0]!.includes('exports'));
});

// ---------------------------------------------------------------------------
// saving
// ---------------------------------------------------------------------------

test('saveExport writes a new file and never overwrites an existing one', () => {
  const dir = tempRoot();
  try {
    const wav = tinyWav();
    const first = saveExport({ allowedRoots: [dir], filename: 'coin drop.wav', bytes: wav });
    assert.equal(path.basename(first.filePath), 'coin drop_fx.wav');
    assert.equal(first.renamed, false);
    assert.equal(first.bytes, wav.byteLength);

    // a second export of the same asset must not clobber the first
    const second = saveExport({ allowedRoots: [dir], filename: 'coin drop.wav', bytes: wav });
    assert.notEqual(second.filePath, first.filePath);
    assert.equal(second.renamed, true);
    assert.equal(path.basename(second.filePath), 'coin drop_fx-2.wav');

    // both survive
    const names = readdirSync(dir).sort();
    assert.deepEqual(names, ['coin drop_fx-2.wav', 'coin drop_fx.wav']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('saveExport refuses to write outside the allowed roots', () => {
  const allowed = tempRoot();
  const elsewhere = tempRoot();
  try {
    assert.throws(
      () => saveExport({ allowedRoots: [allowed], directory: elsewhere, filename: 'x.wav', bytes: tinyWav() }),
      (err: unknown) => err instanceof ExportError && err.status === 403,
    );
    // nothing was written
    assert.deepEqual(readdirSync(elsewhere), []);
  } finally {
    rmSync(allowed, { recursive: true, force: true });
    rmSync(elsewhere, { recursive: true, force: true });
  }
});

test('saveExport accepts a subdirectory of an allowed root', () => {
  const root = tempRoot();
  try {
    const nested = path.join(root, 'sub', 'deeper');
    const result = saveExport({ allowedRoots: [root], directory: nested, filename: 'x.wav', bytes: tinyWav() });
    assert.ok(result.filePath.startsWith(nested));
    assert.deepEqual(readdirSync(nested), ['x_fx.wav']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('saveExport refuses non-WAV bytes', () => {
  const dir = tempRoot();
  try {
    assert.throws(
      () => saveExport({ allowedRoots: [dir], filename: 'x.wav', bytes: new Uint8Array(64) }),
      /不是 WAV/,
    );
    // a valid RIFF header but not WAVE
    const riff = new Uint8Array(64);
    riff.set([0x52, 0x49, 0x46, 0x46], 0);
    riff.set([0x41, 0x56, 0x49, 0x20], 8);
    assert.throws(() => saveExport({ allowedRoots: [dir], filename: 'x.wav', bytes: riff }), /不是 WAV/);
    assert.deepEqual(readdirSync(dir), [], 'nothing should have been written');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('saveExport rejects empty payloads and missing destinations', () => {
  const dir = tempRoot();
  try {
    assert.throws(() => saveExport({ allowedRoots: [dir], filename: 'x.wav', bytes: new Uint8Array(0) }), ExportError);
    assert.throws(
      () => saveExport({ allowedRoots: [], filename: 'x.wav', bytes: tinyWav() }),
      (err: unknown) => err instanceof ExportError && err.status === 409,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a traversal attempt in the file name still lands inside the root', () => {
  const root = tempRoot();
  try {
    const result = saveExport({
      allowedRoots: [root],
      filename: '../../../../evil.wav',
      bytes: tinyWav(),
    });
    assert.ok(isInside(root, result.filePath), `escaped the root: ${result.filePath}`);
    assert.ok(path.basename(result.filePath).endsWith('_fx.wav'));
    // and the malicious name did not become a directory structure
    assert.ok(!result.filePath.includes('..'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('saveExport creates the destination directory when it does not exist', () => {
  const root = tempRoot();
  try {
    const missing = path.join(root, 'not', 'there', 'yet');
    const result = saveExport({ allowedRoots: [root], directory: missing, filename: 'a.wav', bytes: tinyWav() });
    assert.ok(result.filePath.includes(path.join('not', 'there', 'yet')));
    assert.equal(readdirSync(missing).length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an unwritable destination surfaces as an error, not a silent success', () => {
  const root = tempRoot();
  try {
    // Point the "directory" at an existing *file*, which cannot become a folder.
    const blocker = path.join(root, 'blocker');
    writeFileSync(blocker, 'x');
    assert.throws(() => saveExport({ allowedRoots: [root], directory: blocker, filename: 'a.wav', bytes: tinyWav() }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('saveExport writes the exact bytes it was given', () => {
  const root = tempRoot();
  try {
    const wav = tinyWav(64);
    const result = saveExport({ allowedRoots: [root], filename: 'exact.wav', bytes: wav });
    assert.deepEqual(readdirSync(root), ['exact_fx.wav']);
    const readBack = readFileSync(result.filePath);
    assert.equal(readBack.byteLength, wav.byteLength);
    for (let i = 0; i < wav.byteLength; i += 1) {
      assert.equal(readBack[i], wav[i], `byte ${i} differs`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
