# @sounddesk/ucs

Universal Category System (UCS) data + schema for the sound-desk audio asset manager.

Zero runtime dependencies. Pure ESM, strict TypeScript, runs directly on Node >= 20
(the tests use Node 24's native type stripping).

The active dataset is the **official UCS v8.2.1 list**: 753 subcategories across 82
categories, built from a vendored copy of the authoritative CSV and pinned by SHA-256.
See [`data/PROVENANCE.md`](./data/PROVENANCE.md) for the full sourcing and licence trail.

## What is in here

| File | Contents |
| --- | --- |
| `data/ucs_v8.2.1.csv` | The **official** UCS v8.2.1 English list, vendored unmodified (the source of truth) |
| `data/categories.generated.json` | Built from the CSV by `scripts/build-ucs.mjs` — **753 entries / 82 categories**, `complete: true` |
| `data/curated-zh.json` | Hand-curated Chinese display names and search synonyms, keyed by **official** CatID / category code |
| `data/official-catalog.json` | Generated quick-reference of the official category tree |
| `data/query-dict.zh-en.json` | Chinese → English query-rewriting dictionary: 494 keys |
| `data/categories.seed.json` | **Legacy.** The pre-official hand-authored subset (178 entries, 32 non-UCS categories). Not loaded, kept for reference |
| `data/zh-Hans.json` | **Legacy.** Chinese names keyed by legacy seed CatIDs. Used only as a last-resort fallback |
| `src/index.ts` | The TypeScript API (dataset, listing, lookup, CLAP prompts, UCS filenames, query rewriting) |
| `src/index.test.ts` | `node:test` + `node:assert/strict` suite (34 tests) |
| `src/build-ucs.test.ts` | Generator suite: CSV parsing, overlay safety, pinned-hash verification (18 tests) |
| `scripts/build-ucs.mjs` | Builds the dataset from the official CSV |
| `scripts/build-catalog.mjs` | Writes the human-readable category-tree reference |
| `scripts/migrate-seed-zh.mjs` | One-time migration that re-keys the legacy seed's Chinese content onto real CatIDs |

> **The legacy seed's CatIDs were invented and are not UCS.** Only one of its 178
> CatIDs (`DOORWood`) exists in the real standard — the rest look plausible
> (`AIRCRAFTCabin`, `AMBDesignedDark`, `IMPACTMetal`) but are not valid UCS IDs. The
> generator therefore drops them rather than merging them, and the ~700 hand-written
> Chinese synonyms were rescued onto real CatIDs by `scripts/migrate-seed-zh.mjs`.

## Building / verifying the dataset

The official list is published through the UCS resource hub
(**https://resources.universalcategorysystem.com/**; project site
https://universalcategorysystem.com/), which distributes it via Dropbox / Google Sheets
rather than a stable HTTP endpoint. This repository vendors the file it was built from,
so a normal build needs no network access:

```bash
pnpm --filter @sounddesk/ucs build:ucs     # rebuild data/categories.generated.json
pnpm --filter @sounddesk/ucs check:ucs     # verify the committed dataset; exit 1 on drift
pnpm --filter @sounddesk/ucs list:ucs      # per-category counts + Chinese coverage
node scripts/build-ucs.mjs --print-hash    # print the source SHA-256 (for refreshing PINNED)
```

`build:ucs` refuses to run if `data/ucs_v8.2.1.csv` does not match the SHA-256 recorded in
`PINNED` in `scripts/build-ucs.mjs`, and refuses to write unless the parse yields exactly
753 rows across 82 categories. `complete: true` now means "a structurally complete official
list built from an unmodified pinned source" — not a guessed row threshold.

To build from your own download instead:

```bash
node scripts/build-ucs.mjs --source ./UCS_8.2.1.csv --version 8.2.1 --allow-unpinned
```

An unreadable source, an unparseable export or a failed row-count check exits **1** and
writes nothing, so a broken export can never silently become the active dataset.

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

Two label-resolution details follow from the official vocabulary:

- `code` is the official `CatShort`, which is always a prefix of the CatID
  (`DOORWood` → `DOOR`, `WATRUndwtr` → `WATR`, `METLImpt` → `METL`). The remainder is a
  *compressed* spelling (`Brst`, `Hndl`), so it is never used as a display label.
- `AIR`, `RAIN`, `HAIL`, `WIND`, `STORM`, `WTHR` and `MIX` are simultaneously a category
  code and a bare CatID. `labelFor` returns the **category** name for those, because the
  CatID-level Chinese label would describe only one subcategory.

## Tests

```bash
node --test --experimental-strip-types src/*.test.ts   # npm test
node --experimental-strip-types src/index.test.ts      # direct run
```

The generator tests read the vendored CSV, so they fail loudly if the vendored file drifts
from its pinned hash.
