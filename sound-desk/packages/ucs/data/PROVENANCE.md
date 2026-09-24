# UCS dataset provenance

## What is bundled

| File | Role |
| --- | --- |
| `ucs_v8.2.1.csv` | The **official** UCS v8.2.1 English list, vendored unmodified. This is the source of truth. |
| `categories.generated.json` | Built from the CSV by `scripts/build-ucs.mjs`. The dataset the runtime actually loads. |
| `official-catalog.json` | Generated quick-reference of the official category tree (`scripts/build-catalog.mjs`). |
| `curated-zh.json` | Hand-curated Chinese display names and search synonyms, keyed by **official** CatID/category code. |
| `categories.seed.json` | **Legacy.** Hand-authored before the official list was available; superseded, kept for reference only. |
| `zh-Hans.json` | **Legacy.** Chinese names keyed by the legacy seed's CatIDs. Kept only as a fallback. |
| `query-dict.zh-en.json` | Hand-curated Chinese→English query dictionary. Independent of the UCS list. |

## The official source

- Project / specification: <https://universalcategorysystem.com/>
- Resource hub (where the spreadsheet is published): <https://resources.universalcategorysystem.com/>
- Version: **8.2.1** (January 2024), the final planned version of the list.
- Contents: `Category, SubCategory, CatID, CatShort, Explanations, Synonyms` for all
  **753 subcategories across 82 categories**.
- Licence: the UCS is a **public-domain initiative** created by Tim Nielsen and Justin
  Drury. It is freely usable without restriction and is included unmodified.

The resource hub distributes the list through Dropbox / Google Sheets, which is not a
stable, scriptable HTTP endpoint. This repository therefore vendors the file it was built
from, pinned by SHA-256 in `scripts/build-ucs.mjs` (`PINNED.sha256`), so a build can prove
which bytes it consumed.

The vendored copy was obtained from the `jmrsound/ucs-tools` mirror, which bundles the
official English list unmodified and documents the same provenance:

- Mirror: <https://github.com/jmrsound/ucs-tools> — `src/ucs_tools/data/ucs_v8.2.1.csv`
- Mirror provenance: `src/ucs_tools/data/PROVENANCE.md` in that repository

If you would rather build from the original download, fetch the CSV from the resource hub,
replace `data/ucs_v8.2.1.csv`, and run:

```
node scripts/build-ucs.mjs --allow-unpinned     # then update PINNED in the script
```

## Why the seed could not be merged

`categories.seed.json` was hand-written before the official list was available. Its CatIDs
were **invented** (`AIRCRAFTCabin`, `AMBDesignedDark`, `FOLEYFootstepsBoots`,
`IMPACTMetal`) and do not exist in UCS. Exactly one of its 178 CatIDs — `DOORWood` — is
real. A dataset containing the other 177 would offer the user invalid categories and write
invalid CatIDs into filenames, so the generator **drops** them (reported as
`droppedSeedCatIds` in the generated file) rather than merging them.

The genuinely useful part of the seed — ~700 hand-written Chinese synonyms and labels —
was rescued and re-keyed onto real CatIDs by `scripts/migrate-seed-zh.mjs`, producing
`curated-zh.json`. That script refuses to emit a CatID that is not in the official list.

## Verified numbers

| Metric | Value |
| --- | --- |
| Official subcategories | 753 |
| Official categories | 82 |
| Rows skipped during parse | 0 |
| Entries with an official explanation | 753 / 753 |
| Entries with curated Chinese | 145 / 753 |
| Category-level Chinese names | 82 / 82 |
| Legacy seed CatIDs dropped | 177 |
| Source SHA-256 | `aebc8bf4f8b0dd7cafc1231c25b6664250087ab1acb8d4e6ed18ef8bf9d47986` |

`pnpm --filter @sounddesk/ucs check:ucs` re-verifies point by point and exits non-zero on
drift.

## Refreshing to a newer list

1. Fetch the new CSV from the resource hub.
2. Replace `data/ucs_v8.2.1.csv` (rename to match the version, e.g. `ucs_v9.0.0.csv`).
3. Update `PINNED` in `scripts/build-ucs.mjs`: `version`, `file`, `rows`, `categories`,
   `sha256` (print the hash with `node scripts/build-ucs.mjs --print-hash`).
4. `node scripts/build-ucs.mjs && node scripts/build-catalog.mjs`
5. `node scripts/build-ucs.mjs --check` and re-run the package tests.

`curated-zh.json` is keyed by CatID: any entry whose CatID disappears in a new version is
reported as unknown and ignored, and must be re-pointed by hand.
