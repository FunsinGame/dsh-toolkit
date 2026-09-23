/**
 * Tests for metadata rewriting.
 *
 * The bar is deliberately high: this code path writes into the user's sound
 * library. Every test re-parses the result, and the important ones assert the
 * **audio bytes** are bit-identical to the input.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  buildIxml,
  decodeWav,
  isEditableWav,
  locateChunks,
  probeWav,
  restoreFromBackup,
  hasBackup,
  updateWavMetadata,
  updateWavMetadataFields,
} from '../src/index.ts';
import { buildChunkForTest, makeRiff, pcmNoise, sineSamples } from './writerTestUtils.ts';

/** The audio payload of a WAV file, for proving it survived a rewrite. */
function audioBytes(filePath: string): Buffer {
  const buf = readFileSync(filePath);
  const layout = locateChunks(buf);
  const data = layout.chunks.find((c) => c.id === 'data');
  assert.ok(data, 'the rewritten file must still have a data chunk');
  return Buffer.from(buf.subarray(data.payloadOffset, data.payloadOffset + data.size));
}

function tempDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), 'sounddesk-writer-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('isEditableWav accepts only RIFF containers', () => {
  assert.equal(isEditableWav('a.wav'), true);
  assert.equal(isEditableWav('a.BWF'), true);
  assert.equal(isEditableWav('a.wave'), true);
  assert.equal(isEditableWav('a.flac'), false);
  assert.equal(isEditableWav('a.mp3'), false);
  assert.equal(isEditableWav('a.aiff'), false);
  assert.equal(isEditableWav('noext'), false);
});

test('writing iXML into a plain WAV leaves the audio bit-identical', async () => {
  const { dir, cleanup } = tempDir();
  try {
    const file = path.join(dir, 'plain.wav');
    const samples = sineSamples(440, 0.25, 48000);
    writeFileSync(file, makeRiff(samples, 48000));

    const before = audioBytes(file);
    const result = await updateWavMetadata(file, {
      ixml: buildIxml({ DESCRIPTION: '\u91d1\u5c5e\u95e8\u5173\u4e0a', SCENE: '12A' }),
    });
    const after = audioBytes(file);

    assert.equal(result.changed, true);
    assert.deepEqual(after, before, 'the audio payload must not change');

    const probe = await probeWav(file);
    assert.equal(probe.embedded.ixml?.DESCRIPTION, '\u91d1\u5c5e\u95e8\u5173\u4e0a', 'UTF-8 must survive');
    assert.equal(probe.embedded.ixml?.SCENE, '12A');
    assert.equal(probe.frameCount, samples.length, 'frame count must be preserved');
  } finally {
    cleanup();
  }
});

test('a file with no bext block is not given one', async () => {
  const { dir, cleanup } = tempDir();
  try {
    const file = path.join(dir, 'plain.wav');
    writeFileSync(file, makeRiff(sineSamples(440, 0.1, 48000), 48000));

    const result = await updateWavMetadataFields(file, { description: 'hello' });
    assert.ok(
      result.warnings.some((w) => /no BWF bext/.test(w)),
      `expected a warning about the missing bext block, got ${JSON.stringify(result.warnings)}`,
    );
    const probe = await probeWav(file);
    assert.equal(probe.embedded.bext, undefined, 'bext must not be fabricated');
    assert.equal(probe.embedded.ixml?.DESCRIPTION, 'hello', 'the description still lands in iXML');
  } finally {
    cleanup();
  }
});

test('existing bext fields are preserved while the edited ones change', async () => {
  const { dir, cleanup } = tempDir();
  try {
    const file = path.join(dir, 'bwf.wav');
    writeFileSync(
      file,
      makeRiff(sineSamples(300, 0.2, 48000), 48000, {
        bext: {
          description: 'original',
          originator: 'Old Designer',
          originatorReference: 'REF-1',
          originationDate: '2024-01-02',
          originationTime: '03:04:05',
          timeReferenceLow: 48000,
          version: 2,
          loudnessValue: -23,
          codingHistory: ['A=PCM,F=48000,W=16,M=stereo'],
        },
      }),
    );

    await updateWavMetadataFields(file, { description: 'updated', designer: 'New Designer' });
    const bext = (await probeWav(file)).embedded.bext!;

    assert.equal(bext.description, 'updated');
    assert.equal(bext.originator, 'New Designer');
    assert.equal(bext.originatorReference, 'REF-1', 'unrelated bext fields must survive');
    assert.equal(bext.originationDate, '2024-01-02');
    assert.equal(bext.timeReferenceLow, 48000, 'the sample-accurate time reference must survive');
    assert.equal(bext.version, 2);
    assert.deepEqual(bext.codingHistory, ['A=PCM,F=48000,W=16,M=stereo']);
  } finally {
    cleanup();
  }
});

test('unrelated chunks survive the rewrite', async () => {
  const { dir, cleanup } = tempDir();
  try {
    const file = path.join(dir, 'withchunks.wav');
    const extra = Buffer.concat([
      buildChunkForTest('fact', Buffer.alloc(4)),
      buildChunkForTest('cue ', Buffer.alloc(4)),
      buildChunkForTest('smpl', Buffer.alloc(36)),
    ]);
    const samples = sineSamples(200, 0.15, 48000);
    writeFileSync(file, makeRiff(samples, 48000, { extraChunks: extra }));

    await updateWavMetadata(file, { ixml: buildIxml({ NOTE: 'x' }) });
    const ids = locateChunks(readFileSync(file)).chunks.map((c) => c.id);
    for (const id of ['fact', 'cue ', 'smpl', 'fmt ', 'data', 'iXML']) {
      assert.ok(ids.includes(id), `chunk "${id}" lost: ${ids.join(',')}`);
    }
    assert.equal((await probeWav(file)).frameCount, samples.length);
  } finally {
    cleanup();
  }
});

test('a rewrite keeps LIST/INFO tags that were not part of the edit', async () => {
  const { dir, cleanup } = tempDir();
  try {
    const file = path.join(dir, 'info.wav');
    writeFileSync(
      file,
      makeRiff(sineSamples(200, 0.1, 48000), 48000, {
        info: { INAM: 'Original Name', IART: 'Someone', ISFT: 'SoundDesk' },
      }),
    );

    // Editing iXML must not disturb the INFO list.
    await updateWavMetadata(file, { ixml: buildIxml({ NOTE: 'x' }) });
    const info = (await probeWav(file)).embedded.info;
    assert.equal(info?.INAM, 'Original Name');
    assert.equal(info?.IART, 'Someone');

    // And replacing INFO must replace it wholesale.
    const result = await updateWavMetadata(file, { info: { INAM: 'New Name' } });
    assert.equal(result.changed, true);
    const replaced = (await probeWav(file)).embedded.info;
    assert.equal(replaced?.INAM, 'New Name');
    assert.equal(replaced?.IART, undefined, 'the old list should be replaced, not merged');
  } finally {
    cleanup();
  }
});

test('metadata chunks are emitted before the audio data', async () => {
  const { dir, cleanup } = tempDir();
  try {
    const file = path.join(dir, 'order.wav');
    writeFileSync(file, makeRiff(sineSamples(200, 0.1, 48000), 48000));
    await updateWavMetadata(file, { ixml: buildIxml({ NOTE: 'x' }) });

    const ids = locateChunks(readFileSync(file)).chunks.map((c) => c.id);
    const ixmlAt = ids.indexOf('iXML');
    const dataAt = ids.indexOf('data');
    assert.ok(ixmlAt >= 0 && dataAt >= 0, ids.join(','));
    assert.ok(ixmlAt < dataAt, `iXML must precede data, got ${ids.join(',')}`);
  } finally {
    cleanup();
  }
});

test('a backup is taken once and restore returns the pristine bytes', async () => {
  const { dir, cleanup } = tempDir();
  try {
    const file = path.join(dir, 'lib', 'door.wav');
    const backupDir = path.join(dir, 'backups');
    const samples = sineSamples(180, 0.3, 48000);
    // the library layout means the parent directory must exist first
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, makeRiff(samples, 48000, { bext: { description: 'v1', version: 1 } }));
    const originalBytes = readFileSync(file);

    const first = await updateWavMetadata(file, { ixml: buildIxml({ NOTE: 'first' }) }, { backupDir });
    assert.ok(first.backupPath, 'a backup should have been created');
    assert.equal(statSync(first.backupPath!).size, originalBytes.length);

    // A second edit must not overwrite the backup with already-edited bytes.
    await updateWavMetadata(file, { ixml: buildIxml({ NOTE: 'second' }) }, { backupDir });
    assert.deepEqual(
      readFileSync(first.backupPath!),
      originalBytes,
      'the backup must still hold the pristine original',
    );
    assert.equal(await hasBackup(backupDir, file), true);

    assert.equal(await restoreFromBackup(backupDir, file), true);
    assert.deepEqual(readFileSync(file), originalBytes);
  } finally {
    cleanup();
  }
});

test('an edit that changes nothing reports changed: false and leaves the file alone', async () => {
  const { dir, cleanup } = tempDir();
  try {
    const file = path.join(dir, 'same.wav');
    writeFileSync(file, makeRiff(sineSamples(200, 0.1, 48000), 48000));
    const before = readFileSync(file);
    const mtimeBefore = statSync(file).mtimeMs;

    const result = await updateWavMetadata(file, { ixml: null });
    assert.equal(result.changed, false);
    assert.deepEqual(readFileSync(file), before);
    assert.equal(statSync(file).mtimeMs, mtimeBefore, 'the file must not even be rewritten');
  } finally {
    cleanup();
  }
});

test('dry run reports the change without writing', async () => {
  const { dir, cleanup } = tempDir();
  try {
    const file = path.join(dir, 'dry.wav');
    writeFileSync(file, makeRiff(sineSamples(200, 0.1, 48000), 48000));
    const before = readFileSync(file);

    const result = await updateWavMetadata(file, { ixml: buildIxml({ NOTE: 'x' }) }, { dryRun: true });
    assert.equal(result.changed, true);
    assert.ok(result.warnings.some((w) => /dry run/.test(w)));
    assert.deepEqual(readFileSync(file), before);
  } finally {
    cleanup();
  }
});

test('non-RIFF files are refused rather than converted', async () => {
  const { dir, cleanup } = tempDir();
  try {
    const file = path.join(dir, 'song.mp3');
    writeFileSync(file, Buffer.from('ID3\x03\x00\x00\x00'));
    await assert.rejects(() => updateWavMetadata(file, { ixml: '<x/>' }), /only RIFF containers can be edited/);
  } finally {
    cleanup();
  }
});

test('RIFX (big-endian) is refused with a clear message', async () => {
  const { dir, cleanup } = tempDir();
  try {
    const file = path.join(dir, 'be.wav');
    const buf = Buffer.alloc(12);
    buf.write('RIFX', 0, 'ascii');
    buf.writeUInt32LE(4, 4);
    buf.write('WAVE', 8, 'ascii');
    writeFileSync(file, buf);
    await assert.rejects(() => updateWavMetadata(file, { ixml: buildIxml({ NOTE: 'x' }) }), /RIFX/);
  } finally {
    cleanup();
  }
});

test('a corrupt file is refused and left byte-identical', async () => {
  const { dir, cleanup } = tempDir();
  try {
    const file = path.join(dir, 'broken.wav');
    const broken = Buffer.alloc(12);
    broken.write('RIFF', 0, 'ascii');
    broken.writeUInt32LE(4, 4);
    broken.write('WAVE', 8, 'ascii');
    writeFileSync(file, broken);
    const before = readFileSync(file);

    await assert.rejects(() => updateWavMetadata(file, { ixml: buildIxml({ NOTE: 'x' }) }));
    assert.deepEqual(readFileSync(file), before, 'a failed edit must leave the file byte-identical');
  } finally {
    cleanup();
  }
});

test('iXML output is well-formed and escapes hostile values', () => {
  const xml = buildIxml({
    DESCRIPTION: 'a & b < c > d "e" \'f\'',
    EMPTY: '',
    SCENE: '1',
  });
  assert.ok(xml.startsWith('<?xml'));
  assert.ok(xml.includes('<BWFXML>'));
  assert.ok(xml.includes('a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;'));
  assert.ok(!xml.includes('<EMPTY>'), 'empty fields should be omitted rather than written empty');
  assert.ok(xml.includes('<SCENE>1</SCENE>'));
});

test('iXML round-trips through the parser', async () => {
  const { dir, cleanup } = tempDir();
  try {
    const file = path.join(dir, 'round.wav');
    writeFileSync(file, makeRiff(sineSamples(200, 0.1, 48000), 48000));

    const fields = {
      DESCRIPTION: '\u91d1\u5c5e\u95e8\u91cd\u91cd\u5173\u4e0a\uff0c\u7a7a\u4ed3\u5e93',
      DESIGNER: '\u5f20',
      KEYWORDS: 'metal, door, slam',
      PROJECT: 'Demo',
    };
    await updateWavMetadata(file, { ixml: buildIxml(fields) });
    const probe = await probeWav(file);
    for (const [key, value] of Object.entries(fields)) {
      assert.equal(probe.embedded.ixml?.[key], value, `${key} did not round-trip`);
    }
  } finally {
    cleanup();
  }
});

test('decoding still returns the original samples after a rewrite', async () => {
  const { dir, cleanup } = tempDir();
  try {
    const file = path.join(dir, 'decode.wav');
    const samples = pcmNoise(0.2, 48000);
    writeFileSync(file, makeRiff(samples, 48000));

    await updateWavMetadata(file, { ixml: buildIxml({ NOTE: 'edited' }) });

    const decoded = await decodeWav(file);
    assert.equal(decoded.channels, 1);
    assert.equal(decoded.data[0]!.length, samples.length);
    for (let i = 0; i < 500; i += 1) {
      assert.ok(Math.abs(decoded.data[0]![i]! - samples[i]!) < 1e-4, `sample ${i} drifted`);
    }
  } finally {
    cleanup();
  }
});

test('updateWavMetadataFields merges instead of clobbering other iXML fields', async () => {
  const { dir, cleanup } = tempDir();
  try {
    const file = path.join(dir, 'merge.wav');
    writeFileSync(file, makeRiff(sineSamples(200, 0.1, 48000), 48000));
    // seed with a field we are not editing
    await updateWavMetadata(file, { ixml: buildIxml({ PROJECT: 'KeepMe', DESCRIPTION: 'old' }) });

    await updateWavMetadataFields(file, { description: 'new' });
    const ixml = (await probeWav(file)).embedded.ixml;
    assert.equal(ixml?.DESCRIPTION, 'new');
    assert.equal(ixml?.PROJECT, 'KeepMe', 'unrelated iXML fields must be merged, not dropped');
  } finally {
    cleanup();
  }
});
