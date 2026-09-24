/**
 * Remove a stale entry from VS Code's extension registry.
 *
 * The extension's directory was deleted mid-install (the CLI install timed out while
 * the machine was saturated by an embed job), but `extensions.json` still lists
 * `sounddesk.sound-desk-vscode` — and marks it `pinned: true`. A pinned extension
 * cannot be reinstalled at the same version: the CLI answers
 * "Please restart VS Code before reinstalling SoundDesk" even with no VS Code running,
 * because it is the registry entry, not a running process, that is in the way.
 *
 * Only that one identifier is dropped; every other entry is preserved byte-for-byte in
 * value. A backup is written first so the change is reversible.
 */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';

const registry = process.argv[2];
const idToDrop = process.argv[3];
if (!registry || !idToDrop) {
  console.error('usage: node drop-stale-extension.mjs <extensions.json> <extension.id>');
  process.exit(1);
}

const raw = readFileSync(registry, 'utf8');
const entries = JSON.parse(raw);
if (!Array.isArray(entries)) throw new Error('extensions.json is not an array');

const before = entries.length;
const kept = entries.filter((entry) => entry?.identifier?.id !== idToDrop);
const dropped = before - kept.length;
if (dropped === 0) {
  console.log(`no entry for ${idToDrop}; nothing to do`);
  process.exit(0);
}

const backup = `${registry}.backup-${Date.now()}`;
copyFileSync(registry, backup);
// Two-space indent matches how VS Code writes it, so the file does not churn.
writeFileSync(registry, JSON.stringify(kept), 'utf8');
console.log(`dropped ${dropped} entry/entries for ${idToDrop} (${before} -> ${kept.length})`);
console.log(`backup: ${backup}`);
