# @sounddesk/ucs

Universal Category System (UCS) data + schema for the sound-desk audio asset manager.

Zero runtime dependencies. Pure ESM, strict TypeScript, runs directly on Node >= 20
(the tests use Node 24's native type stripping).

## What is in here

| File | Contents |
| --- | --- |
| `data/categories.seed.json` | Curated seed subset: **178 entries across 32 UCS categories**, `complete: false`, `version: "8.2.1"` |
| `data/zh-Hans.json` | Chinese display names: 32 category keys + 178 `CATEGORY/SubCategory` keys (community/best-effort) |
| `data/query-dict.zh-en.json` | Chinese → English query-rewriting dictionary: **411 keys**, 880 English renderings |
| `src/index.ts` | The TypeScript API (dataset, listing, lookup, CLAP prompts, UCS filenames, query rewriting) |
| `src/index.test.ts` | `node:test` + `node:assert/strict` suite (32 tests) |
| `scripts/build-ucs.mjs` | Ingestion script for the official UCS spreadsheet export |

> The seed is **not** the official list. It is a deliberately curated subset for
> development. Every CatID is either `CATEGORY + SubCategory` or a documented
> abbreviation (`AMB`, `DOOR`, `IMPACT`, `MACHINE`, `MOVE`, `SCIFI`, …) carried in
> the optional `code` field. `data/categories.seed.json` contains an
> `idConfidence` block listing the CatIDs verified against public references and
> stating that the rest are hand-authored and unverified. Do not treat seed
> CatIDs as authoritative filenames without running the ingestion script.

## Building the full dataset

The official UCS list is a spreadsheet distributed through the UCS resource
folder — **https://resources.universalcategorysystem.com/** (project site:
https://universalcategorysystem.com/). It is not a stable HTTP endpoint, so this
package cannot download it automatically.

1. Download the official list as CSV/TSV.
2. Run:

```bash
node scripts/build-ucs.mjs --source ./UCS_8.2.1.csv --version 8.2.1
# or: npm run build:ucs -- --source ./UCS_8.2.1.csv --version 8.2.1
```

That writes `data/categories.generated.json`, which `src/index.ts` prefers over
the seed automatically. Running the script with no `--source` prints
instructions and exits 0 without touching any file; an unreachable URL or an
unparseable export also exits 0 and leaves the package on the seed.
`complete: true` is only set when a full official list (>= 1000 rows, 0 skipped)
was parsed.

## API

```ts
import {
  dataset, listCategories, listSubCategories, labelFor, lookup, isKnownCatId,
  promptsFor, allPrompts, parseUcsFilename, buildUcsFilename, sniffFilename,
  expandQueryZh, expandQuery, categoryCodeOf, normalizeText,
} from '@sounddesk/ucs';
import type {
  Lang, UcsCategory, UcsDataset, UcsFilenameParts, QueryExpansion, QueryMatch,
} from '@sounddesk/ucs';
```

Query rewriting turns a Chinese description into CLAP-friendly English captions:

```ts
expandQueryZh('玻璃破碎，清脆，小碎块').rewritten;
// "glass breaking, crisp, small fragments"
// captions: [ rewritten, an alternative combination, the original Chinese input ]
```

`expandQueryZh` never throws and never returns an empty `captions` array; terms
it cannot resolve are surfaced in `unmatched` so the caller can show them to the
user. `expandQuery(input, lang)` is the language-aware wrapper (`zh-Hans`
delegates to `expandQueryZh`; `en` only normalises whitespace and splits commas).

## Tests

```bash
node --test --experimental-strip-types src/*.test.ts   # npm test
node --experimental-strip-types src/index.test.ts      # direct run
```
