import { rm } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const targets = ['dist', 'out', 'node_modules/.cache'];

for (const dir of await readdir(root, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  if (dir.name === 'node_modules' || dir.name.startsWith('.')) continue;
  await walk(path.join(root, dir.name));
}

async function walk(dir) {
  for (const t of targets) {
    await rm(path.join(dir, t), { recursive: true, force: true });
  }
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    await walk(path.join(dir, entry.name));
  }
}
