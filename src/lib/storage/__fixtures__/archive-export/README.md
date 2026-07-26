# Golden fixtures — archive export documents

These files are the **contract** for the archive export format between this web
client and any other implementation of it (the immediate case being a
forthcoming iOS client). Both sides test against these exact bytes.

- **Specification:** [`docs/ARCHIVE_EXPORT_SCHEMA.md`](../../../../../docs/ARCHIVE_EXPORT_SCHEMA.md)
- **Web-side assertions:** [`../../archiveFixtures.conformance.test.ts`](../../archiveFixtures.conformance.test.ts)

## Rules for this directory

1. **These are committed files, not generated output.** There is deliberately no
   generator. A generator would drift with the code it is written against, which
   defeats the point — a fixture is only a contract if it can disagree with the
   implementation.
2. **Treat them as append-only.** Adding a fixture is free. *Changing* one
   silently changes the contract for every implementation that tests against it.
   If a change is genuinely needed, it is a spec change first (§9 of the spec)
   and every consumer needs telling.
3. **They are read as raw text, never `import`ed.** `malformed-not-json.json` is
   deliberately unparseable, so a bundler that tried to parse it would fail.
4. **No real user data and no real URLs.** Images are tiny placeholder payloads;
   external links use the reserved `.invalid` TLD.

## If your implementation disagrees with a fixture

One of the two is wrong. Work out which by reading the spec section named in the
table below — do not "fix" your decoder to match a fixture you think is wrong,
and do not edit the fixture to match your decoder. Resolve it before shipping.

---

## Valid documents

| Fixture | Exercises | Expected outcome |
|---|---|---|
| `minimal-valid.json` | The smallest legal document. Only `kind`, `schemaVersion`, `garments`; one garment with only its nine required fields; no `assetEncoding`, `exportedAt`, `savedOutfits` or `currentOutfit`. | Imports 1 garment, **zero issues**. Absent envelope fields take their defaults: unknown export time, no looks, empty five-slot rail (spec §3). |
| `empty-archive.json` | A first-run backup of a wardrobe with nothing in it, producer-shaped (every key present, arrays empty). | Imports cleanly with 0 garments and **zero issues**. An empty archive is legal, not an error. |
| `full-featured.json` | Every optional field in the format at once: all purchase metadata, analysis provenance, a 3-entry `marketValueHistory` (including one entry with no `currency`), a complete `asset` bundle, `proxy3dPreview` with all optional counters, 5 garments covering all 5 categories, 2 saved looks, a partly-filled current outfit. Also a `price` of `0` and an empty-string `notes`. | Imports 5 garments and 2 looks with **zero issues**, every optional field preserved. `grm-full-top` additionally asserts that a stored `cutoutImageUrl` does **not** shadow a `product-reference` display (spec §6.3.1). |
| `legacy-records.json` | Records written before the asset pipeline existed: no `asset`, no provenance, no market value, and **percent-encoded** SVG data URLs rather than base64. | Imports 3 garments and 1 look with **zero issues**. This is the file that catches a decoder handling only `;base64,` — the sample wardrobe ships in this form (spec §5.1). |
| `blob-backed-inlined.json` | What a **conforming** export of blob-backed garments looks like: crop/cutout bytes inlined as base64, all `*Ref` fields absent. Includes `grm-blob-unresolved`, a piece whose blob could not be read at export time. | Imports 3 garments with **zero issues**, no `indexeddb-blob` string anywhere in the file. The unresolved piece degrades to its thumbnail rather than being dropped (spec §5.2). |

## Non-conforming but recoverable

| Fixture | Exercises | Expected outcome |
|---|---|---|
| `blob-ref-leaked.json` | A file a conforming producer would never write: two garments still carrying `croppedImageRef`/`cutoutImageRef`, and one carrying a process-local `blob:` object URL as its `displayImageUrl`. | Imports **all 3 garments**, with 2 × `foreign-blob-ref` and 1 × `process-local-url` warnings. No pointer survives; the stripped display url blanks so the chain falls through to the thumbnail (spec §5.2–§5.3). |
| `unrecognized-enums.json` | Every enum carrying a value this build does not know, plus unknown keys at envelope, garment and asset level: unknown `category`, unknown `analysisSource`, unknown `assetMode`, unknown `proxy3dPreview.mode`, unknown `AssetImageRef.kind`. | **Only** the unknown-`category` piece is dropped (1 × `invalid-shape`). Unknown `analysisSource` and the whole `proxy3dPreview` drop as *fields*, keeping their garments. Unknown `assetMode` is kept as-is. The unknown ref kind is stripped like any other ref. Unknown keys are ignored and preserved. The look pointing at the dropped piece warns (spec §6.4, §8.3, §8.4). |

This pair is the most important in the set: they are what a decoder gets wrong
when it is written strictly against the happy path.

## Malformed — rejected at the document level

Each imports **nothing** and reports exactly one issue (spec §3.1). They are
separate files because a decoder can easily conflate them.

| Fixture | Broken how | Issue code |
|---|---|---|
| `malformed-not-json.json` | Truncated mid-write — a plausible "the tab was closed during export". | `not-json` |
| `malformed-root-array.json` | Valid JSON, but the root is an array wrapping the envelope. | `not-an-object` |
| `malformed-wrong-kind.json` | Well-formed and garment-shaped, but another app's backup. | `wrong-kind` |
| `malformed-missing-schema-version.json` | No `schemaVersion` at all. | `unsupported-schema-version` |
| `malformed-future-schema-version.json` | `schemaVersion: 99` — written by a newer build. Must be refused **outright**, not partially imported. | `unsupported-schema-version` |
| `malformed-missing-garments.json` | Envelope fine, `garments` key absent. | `missing-garments` |

## Malformed — recovered at the record level

The document is fine; individual records are not. These verify the central
promise of the format: **a bad record costs the user that record, never the
import, and never silently** (spec §8).

| Fixture | Broken how | Expected outcome |
|---|---|---|
| `malformed-garment-entries.json` | 14 entries, 12 broken in distinct ways: `null`, a number, a string, an array, missing `name`, a non-string element inside `styleTags`, `styleTags` not an array, an ISO-string `createdAt`, a `null` `updatedAt`, missing `imageDataUrl`, a numeric `colorHex`, and a duplicate id. | Imports `grm-ok-1` and `grm-ok-2`. Exactly **12 issues**: 11 × `invalid-shape` + 1 × `duplicate-id`. The **first** record wins the id collision. Every message names the entry (by name, by id, or `entry #N`). |
| `malformed-outfits.json` | 7 looks: one good, one `null`, one missing `coverHex`, one whose `selection` is a string, one duplicate id, one with dangling garment references, one with wrong-typed slot values. Plus a `currentOutfit` that is a string. | Imports 3 looks. 4 × `invalid-shape` (3 looks + the current outfit) and 1 × `duplicate-id`. Dangling references **warn** without dropping the look; wrong-typed slots normalize to `null`; the bad current outfit becomes an empty rail (spec §7.1). |
| `malformed-saved-outfits-not-a-list.json` | `savedOutfits` is an object keyed by id instead of an array — a plausible mistake for a hand-written or foreign encoder. | Garments still import. Zero looks, reported once at `saved-outfit` scope. The document does **not** fail (spec §3). |

---

## Coverage against the spec's conformance checklist

Every box in §12 of the specification is exercised here:

| Checklist item | Fixture |
|---|---|
| Rejects exactly the five document-level conditions | the six `malformed-*` document files |
| Refuses a newer `schemaVersion` rather than partially importing | `malformed-future-schema-version.json` |
| Handles both data-URL forms | `legacy-records.json` (percent-encoded), all others (base64) |
| Resolves display image by chain, not `assetMode` | `full-featured.json`, `unrecognized-enums.json` |
| Drops a garment only for unrecognized `category` | `unrecognized-enums.json` |
| Keeps a garment when an optional field is malformed | `unrecognized-enums.json` |
| Filters `marketValueHistory` element-wise | `full-featured.json` (valid), covered for invalid entries in `archiveImport.test.ts` |
| Keeps the first record on a duplicate id | `malformed-garment-entries.json`, `malformed-outfits.json` |
| Strips blob refs and `blob:` urls, with warnings | `blob-ref-leaked.json`, `unrecognized-enums.json` |
| Normalizes every `OutfitSelection` to five keys | asserted across **all** fixtures |
| Reports every drop with a stable code | asserted across **all** fixtures |
| Defaults to merge with existing-wins | `archiveImport.test.ts` / `archiveReducer.test.ts` |
| Ignores unknown keys | `unrecognized-enums.json` |
