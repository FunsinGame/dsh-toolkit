import { writeFile } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseDelimited, detectDelimiter } from './build-ucs.mjs';

const url = new URL('../data/ucs_v8.2.1.csv', import.meta.url);
const text = await readFile(url, 'utf8');
const rows = parseDelimited(text, detectDelimiter(text)).slice(1);

const cats = new Map();
for (const r of rows) {
  const category = r[0].trim();
  const sub = r[1].trim();
  const catId = r[2].trim();
  const short = r[3].trim();
  if (!cats.has(category)) cats.set(category, { short, subs: [] });
  cats.get(category).subs.push(`${sub} (${catId})`);
}

const out = {
  version: '8.2.1',
  sourceSha256: createHash('sha256').update(text, 'utf8').digest('hex'),
  generatedBy: 'packages/ucs/scripts/build-catalog.mjs',
  note:
    'Quick-reference index of the official UCS v8.2.1 category tree, derived from ' +
    'data/ucs_v8.2.1.csv. The dataset actually consumed at runtime is ' +
    'data/categories.generated.json; this file exists so a human can grep the ' +
    'official vocabulary without parsing the CSV.',
  totals: { categories: cats.size, subCategories: rows.length },
  tree: {},
};

for (const [category, info] of [...cats.entries()].sort()) {
  out.tree[category] = { code: info.short, subCategories: info.subs };
}

await writeFile(new URL('../data/official-catalog.json', import.meta.url), `${JSON.stringify(out, null, 2)}\n`, 'utf8');
console.log(`wrote official-catalog.json: ${cats.size} categories, ${rows.length} subcategories`);
