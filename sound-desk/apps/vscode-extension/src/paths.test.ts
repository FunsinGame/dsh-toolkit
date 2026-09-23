import test from 'node:test';
import assert from 'node:assert/strict';

import { baseName, topLevelFolder } from './paths.ts';

test('topLevelFolder walks up one level from the file', () => {
  assert.equal(topLevelFolder('/library/doors/wood/door.wav'), '/library/doors');
  assert.equal(topLevelFolder('/library/door.wav'), '/library');
});

test('topLevelFolder normalises Windows paths to backslashes', () => {
  // Both spellings are valid on Windows and both must produce a path the OS
  // APIs downstream accept.
  assert.equal(topLevelFolder('C:\\SFX\\Doors\\wood.wav'), 'C:\\SFX');
  assert.equal(topLevelFolder('C:/SFX/Doors/wood.wav'), 'C:\\SFX');
});

test('topLevelFolder preserves a Windows drive prefix', () => {
  assert.equal(topLevelFolder('C:/a/b.wav'), 'C:\\a');
  assert.equal(topLevelFolder('C:\\a\\b.wav'), 'C:\\a');
});

test('topLevelFolder returns null when there is no folder to use', () => {
  assert.equal(topLevelFolder('door.wav'), null);
  assert.equal(topLevelFolder('/door.wav'), null);
  assert.equal(topLevelFolder(''), null);
});

test('topLevelFolder tolerates redundant separators', () => {
  // a double slash is still one level; walking up from /lib/doors is /lib
  assert.equal(topLevelFolder('/lib//doors///wood.wav'), '/lib');
  assert.equal(topLevelFolder('/lib/doors/wood.wav'), '/lib');
});

test('baseName handles both separators and trailing slashes', () => {
  assert.equal(baseName('/a/b/c.wav'), 'c.wav');
  assert.equal(baseName('C:\\a\\b\\c.wav'), 'c.wav');
  assert.equal(baseName('/a/b/'), 'b');
  assert.equal(baseName(''), '');
});
