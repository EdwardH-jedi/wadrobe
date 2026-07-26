# The Archive — Export Document Schema

**Media type:** `application/json` · **Extension:** `.json` · **Encoding:** UTF-8
**Current schema version:** `1`
**Reference implementation:** `src/lib/storage/archiveExport.ts` (writer),
`src/lib/storage/archiveImport.ts` (reader), `src/lib/storage/storageTypes.ts` (validators)
**Conformance fixtures:** `src/lib/storage/__fixtures__/archive-export/` (see its `README.md`)

---

## 1. Scope and audience

This document specifies the on-disk format The Archive writes when a user backs up
their wardrobe, and the rules a reader must follow to consume one.

It is written for someone implementing an encoder/decoder **in another language**
(the immediate consumer is a forthcoming iOS client) who cannot read the
TypeScript. Everything a decoder needs is stated here; where the reference
implementation's behaviour is the normative answer, this document states the
behaviour rather than pointing at the code.

The keywords **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** and **MAY** are
used in the RFC 2119 sense. Requirements are split into:

- **Producer requirements** — what a conforming *writer* emits.
- **Consumer requirements** — what a conforming *reader* accepts.

These are deliberately asymmetric. A producer emits a narrow, clean subset; a
consumer tolerates a wider range, because real files come from older app
versions, hand edits, and other implementations. Do not assume that because a
producer never emits something, a consumer may reject it.

### 1.1 What this format is not

The document is a **backup and transfer** format, not a sync protocol and not a
wire API. It has no deltas, no conflict vectors, and no server. It is a complete
snapshot of one browser profile's archive at one moment.

---

## 2. Conventions

| Concern | Rule |
|---|---|
| JSON dialect | Strict RFC 8259. No comments, no trailing commas, no `NaN`/`Infinity`. |
| Text encoding | UTF-8, no BOM. Producers **MUST NOT** write a BOM; consumers **SHOULD** tolerate and strip one. |
| Timestamps | Epoch **milliseconds**, integer, UTC. Never seconds, never ISO-8601 strings. |
| Numbers | Must be finite. `NaN`/`Infinity` are not representable in JSON; a non-finite value arriving via any other route is treated as a type violation. |
| Money | A bare number (`price`, `MarketValueEntry.value`) paired with a separate free-text `currency` string. There is **no** minor-unit convention: `129.99` means 129.99 units of `currency`. No rounding, no currency validation. |
| Colours | `colorHex` is a display swatch string. It is **not** format-validated (see §6.2); it is conventionally `#rrggbb` but any string is accepted. |
| Key order | Insignificant. Consumers **MUST NOT** depend on it. |
| Unknown keys | See §8.4. |

---

## 3. Document envelope

The top level is a JSON **object** (never an array).

```jsonc
{
  "kind": "fit-archive.archive",
  "schemaVersion": 1,
  "assetEncoding": "inline-data-url",
  "exportedAt": 1753577000000,
  "garments": [ /* Garment objects — §6 */ ],
  "savedOutfits": [ /* SavedOutfit objects — §7.2 */ ],
  "currentOutfit": { /* OutfitSelection — §7.1 */ }
}
```

| Field | Type | Producer | Consumer | Notes |
|---|---|---|---|---|
| `kind` | string | **MUST** emit exactly `"fit-archive.archive"` | **MUST** reject the document if absent or unequal | The file-type discriminator. Guards against importing an unrelated JSON file. |
| `schemaVersion` | integer | **MUST** emit `1` | **MUST** reject if absent, non-numeric, or non-finite; **MUST** reject if greater than the highest version it implements | See §9. |
| `assetEncoding` | string | **MUST** emit `"inline-data-url"` | **SHOULD** ignore; **MUST NOT** reject the document on an absent or unrecognized value | Informational. Declares how image bytes travel (§5). Reserved for a future alternative (e.g. a sidecar container). |
| `exportedAt` | number | **MUST** emit epoch ms | **MUST** tolerate absence or a non-finite value by treating it as *unknown* | Display only. Never used for ordering or conflict resolution. |
| `garments` | array | **MUST** emit (possibly empty) | **MUST** reject the document if absent or not an array | The only structurally required payload field. |
| `savedOutfits` | array | **MUST** emit (possibly empty) | **MUST** tolerate absence as empty; if present but not an array, **MUST** import zero looks and report it, **without** failing the document | §7.2 |
| `currentOutfit` | object \| null | **MUST** emit an object | **MUST** tolerate absence or `null` as "nothing styled" | §7.1 |

### 3.1 Document-level rejection

Exactly five conditions make a document unusable. Each **MUST** produce a
user-visible failure and import nothing:

| Code | Condition |
|---|---|
| `not-json` | The bytes are not parseable JSON. |
| `not-an-object` | The root is not a JSON object (arrays included). |
| `wrong-kind` | `kind` is absent or `!= "fit-archive.archive"`. |
| `unsupported-schema-version` | `schemaVersion` absent/non-numeric, **or** newer than the reader implements. |
| `missing-garments` | `garments` is absent or not an array. |

Anything else is a **per-record** problem and **MUST NOT** fail the document
(§8).

---

## 4. The object model, in one picture

```
ExportDocument
├── garments: Garment[]                     — the wardrobe
│   ├── asset?: GarmentAsset                — image bundle
│   ├── marketValueHistory?: MarketValueEntry[]
│   └── proxy3dPreview?: Proxy3dPreview     — experimental, metadata only
├── savedOutfits: SavedOutfit[]             — named looks
│   └── selection: OutfitSelection          — slot → garment id
└── currentOutfit: OutfitSelection          — the rail being styled right now
```

Garments are the only entities with identity that anything else points at.
Outfits reference garments **by id**; nothing references an outfit.

---

## 5. How images are represented

**Every image in an export document is an inline
[data URL](https://developer.mozilla.org/en-US/docs/Web/URI/Schemes/data)
string.** There are no external files, no sidecars, and no keys into any store.
A conforming export is self-contained: it can be read on a device that has never
seen the archive it came from.

### 5.1 The two data-URL forms a consumer must handle

Both of these appear in real exports and a decoder **MUST** support both:

| Form | Example | Where it comes from |
|---|---|---|
| Base64 | `data:image/webp;base64,UklGRi4A…` | Uploaded photos, crops, cutouts — anything the app encoded from bytes. |
| Percent-encoded | `data:image/svg+xml,%3Csvg%20xmlns…` | The procedurally-generated sample wardrobe ships as SVG this way. |

Parsing rule: match `data:<mediatype><;base64>?,<payload>`. If the `;base64`
marker is present, Base64-decode the payload; otherwise percent-decode it. An
empty `<mediatype>` means `application/octet-stream`.

A consumer that only handles `;base64,` **will silently fail on the sample
wardrobe**, which is the most likely first file anyone tests with.

### 5.2 Blob references are resolved away at export time

Inside the running web app, heavy crop/cutout bytes live in a separate IndexedDB
blob store, and a garment's asset carries a pointer (`croppedImageRef` /
`cutoutImageRef`) of the form:

```jsonc
{ "kind": "indexeddb-blob", "key": "asset_1753577000000_9f2c…", "mimeType": "image/webp", "byteSize": 84213 }
```

**Such a key is meaningless outside the browser profile that minted it.**
Therefore:

- A producer **MUST** resolve every blob reference, inline the bytes as a data
  URL on the matching `*ImageUrl` field, and **omit the `*Ref` field entirely**
  from the document.
- A producer **MUST NOT** write a `croppedImageRef` or `cutoutImageRef` into an
  export under any circumstances.
- A consumer that nonetheless encounters one (a hand-edited or non-conforming
  file) **MUST** discard the reference, keep the garment and its inline images,
  and report it as a *warning* (`foreign-blob-ref`) — not a drop.

If a referenced blob cannot be read at export time (store unavailable, blob
evicted, decode failure), the producer **MUST NOT** fail the export. It **MUST**
emit the garment with whatever inline image it still has — at worst the
`imageDataUrl` thumbnail — and **MUST** report the count in the export's
warnings. A missing crop degrades a piece's picture quality; it never loses the
piece.

### 5.3 Object URLs are never written

`blob:`-scheme URLs are process-local handles created at runtime. A producer
**MUST** treat any `blob:` value as absent rather than writing it, and fall back
to the next image source. A file full of `blob:` links is a file full of dead
links.

### 5.4 Size expectations

`imageDataUrl` is always a **downscaled thumbnail**; full-resolution originals
are never stored or exported. Crops and cutouts are larger but still bounded.
A realistic archive of a few hundred pieces produces a document in the tens of
megabytes. Consumers **SHOULD** stream or chunk rather than assuming the whole
document fits comfortably in memory several times over.

---

## 6. Garment

An entry of the `garments` array. This is the core record.

### 6.1 Required fields

A garment is **valid** only if all of the following hold. Any failure **MUST**
cause that garment to be dropped and reported (`invalid-shape`); it **MUST NOT**
fail the document.

| Field | Type | Rule |
|---|---|---|
| `id` | string | Must be a string. Uniqueness is per-document (§6.5). |
| `name` | string | Must be a string. The app requires a non-empty name at creation; a consumer **MUST** still accept `""`. |
| `category` | string | Must be one of the five values in §6.4. An unrecognized value **drops the garment**. |
| `color` | string | Human-readable label, e.g. `"Charcoal"`. |
| `colorHex` | string | Display swatch. **Not** format-validated — any string passes. |
| `styleTags` | array of string | Must be an array and **every** element must be a string. A single non-string element drops the garment. May be empty. |
| `imageDataUrl` | string | The downscaled thumbnail (§5). **Not** validated as a well-formed data URL — any string passes. This is the ultimate display fallback. |
| `createdAt` | number | Finite epoch ms. |
| `updatedAt` | number | Finite epoch ms. |

> **Producer note.** A producer **MUST** emit a non-empty `id` and a
> `imageDataUrl` that is a real data URL. The consumer tolerances above exist for
> legacy and hand-edited files, and **MUST NOT** be read as licence to emit them.

### 6.2 Optional fields

Every field below is optional. If present but of the wrong type (or an
unrecognized enum value), the **field is dropped and the garment is kept**. This
is the single most important tolerance rule in the format: *a bad optional field
never costs the user a garment.*

| Field | Type | Notes |
|---|---|---|
| `brand` | string | |
| `notes` | string | Free text. |
| `material` | string | |
| `size` | string | Free text — no size system is assumed. |
| `price` | number | Finite. Original purchase price. Pairs with `currency`. |
| `currency` | string | Free text (e.g. `"USD"`). Not validated against ISO 4217. |
| `subtype` | string | e.g. `"bomber"`. Free text, not an enum. |
| `purchasedAt` | number | Finite epoch ms. |
| `retailer` | string | |
| `analysisConfidence` | number | Finite. `0`–`1` by convention; **not** range-checked. |
| `analysisSource` | enum | `"mock"` \| `"vision-api"`. Unrecognized → field dropped (§8.3). |
| `userEdited` | boolean | True once the user has edited a suggested field. |
| `marketValueHistory` | array | §6.6. |
| `asset` | object | §6.3. |
| `proxy3dPreview` | object | §6.7. |

### 6.3 `asset` — the image bundle

Optional. Absent on pre-asset-pipeline ("legacy") garments, which render from
`imageDataUrl` alone. If `asset` is present but **not a JSON object**, the field
**MUST** be ignored entirely (treated as absent); the garment is kept.

| Field | Type | Required within `asset` | Notes |
|---|---|---|---|
| `originalImageUrl` | string | yes | The uploaded photo, downscaled. |
| `displayImageUrl` | string | yes | **What a renderer shows.** See §6.3.1. |
| `assetMode` | enum | yes | `"uploaded"` \| `"cropped"` \| `"cutout"` \| `"product-reference"`. Records which source the user last chose. |
| `thumbnailImageUrl` | string | no | |
| `croppedImageUrl` | string | no | Manual-crop output. |
| `cutoutImageUrl` | string | no | Local background-removal output. |
| `productReferenceImageUrl` | string | no | A user-supplied reference image. |
| `sourceUrl` | string | no | User-supplied link for the reference. |
| `sourceLabel` | string | no | Short human label. |
| `croppedImageRef` | object | no | **MUST NOT appear in an export** — §5.2. |
| `cutoutImageRef` | object | no | **MUST NOT appear in an export** — §5.2. |

"Required within `asset`" is a **producer** obligation. A consumer **MUST NOT**
drop the asset or the garment when one of the three is missing or wrong-typed:
the render chain in §6.3.1 already skips any non-string url and terminates at
`imageDataUrl`, and a missing `assetMode` is treated as `"uploaded"`. Validation
inside a well-shaped `asset` object is therefore *by use*, not up front — only
the object-ness of `asset` itself is checked.

#### 6.3.1 Choosing which image to render

A renderer **MUST** resolve a garment's picture by taking the first non-empty
**string** in this exact order:

```
asset.displayImageUrl
asset.cutoutImageUrl
asset.croppedImageUrl
asset.originalImageUrl
imageDataUrl              ← always present, always a thumbnail
```

Two consequences a decoder must respect:

1. `displayImageUrl` outranks everything, because it holds the user's *latest
   intentional choice*. In particular a stored cutout **MUST NOT** shadow a
   chosen product reference.
2. The chain always terminates at `imageDataUrl`, which is required (§6.1). A
   garment therefore always has something to draw, no matter how degraded the
   rest of the asset is.

`assetMode` is **descriptive metadata about provenance, not a rendering
instruction.** Do not switch on it to choose the image; use the chain above. An
unrecognized `assetMode` **MUST NOT** drop the garment or the asset — treat it as
`"uploaded"` for any mode-dependent behaviour and render via the chain as normal.

### 6.4 `category` — a closed enum

`"outerwear"` · `"top"` · `"pants"` · `"shoes"` · `"accessory"`

This is the one enum whose unrecognized values are **fatal to the record**,
because category is structural: it determines which outfit slot a garment can
occupy (§7.1). A garment with an unknown category has no coherent place in the
model, so it is dropped and reported rather than guessed at.

Adding a category is therefore a **breaking** change — see §9.2.

### 6.5 Duplicate ids

Within one document, garment ids **MUST** be unique. A consumer encountering a
repeated id **MUST** keep the **first** occurrence, drop later ones, and report
each drop (`duplicate-id`). The same rule applies independently to saved outfit
ids.

### 6.6 `marketValueEntry`

`marketValueHistory` is an optional array of manually-recorded value estimates.
It is **append-only** and ordered by `at` ascending by convention (a consumer
**SHOULD** sort rather than assume).

| Field | Type | Required |
|---|---|---|
| `id` | string | yes |
| `at` | number | yes — finite epoch ms |
| `value` | number | yes — finite |
| `currency` | string | no — defaults to the garment's `currency` |

Element-level tolerance: if `marketValueHistory` is present but **not an array**,
the whole field is dropped. If it *is* an array, **malformed elements are
filtered out individually and the valid ones are kept** — one bad entry never
discards the rest of a piece's history.

> These are **estimates the user typed in**. They are not fetched, live, or
> market data of any kind. A consumer **MUST NOT** present them as such.

### 6.7 `proxy3dPreview`

Optional link to an experimental generated preview. **Metadata only — it carries
no binary data**, and the asset it names lives in a local backend that a
recipient almost certainly does not have. After import it will typically be
unresolvable; that is expected and is not an error.

| Field | Type | Required |
|---|---|---|
| `jobId` | string | yes — non-empty |
| `generatedAt` | number | yes — finite epoch ms |
| `mode` | enum | yes — `"flat-card"` \| `"single-sided"` \| `"dual-sided"` |
| `method` | string | yes |
| `limitations` | string | yes — honest limitations text, shown verbatim |
| `frontAlphaMaskUsed` | boolean | no |
| `backAlphaMaskUsed` | boolean | no |
| `vertexCount` | number | no |
| `faceCount` | number | no |

Validation is all-or-nothing: if **any** required field is missing or wrong-typed
— including an unrecognized `mode` — the entire `proxy3dPreview` field is
dropped and the garment is kept.

> This is a proxy preview: a textured, lightly extruded silhouette card. It is
> **not** real 3D try-on, garment reconstruction, or fit estimation, and a
> consumer **MUST NOT** describe it as such.

---

## 7. Outfits

### 7.1 `OutfitSelection`

An object mapping each of the five slots to a garment `id` or `null`. Slot names
are exactly the five `category` values (§6.4) — the mapping is 1:1 by
definition, and a garment may only occupy the slot matching its own category.

```json
{ "outerwear": null, "top": "grm-7f3a", "pants": "grm-91cc", "shoes": null, "accessory": null }
```

Normalization rules a consumer **MUST** apply:

1. Start from all five slots `null`.
2. For each slot, take the value **only if it is a string**; anything else
   (number, object, missing) becomes `null`.
3. Ignore any key that is not one of the five slot names.

A selection is therefore always a complete five-key object, whatever the input
looked like.

**Referential integrity is enforced at commit, not at parse.** A slot may name a
garment id that the document does not contain, or one whose `category` does not
match the slot. Both are legal in the file and **MUST NOT** drop anything. On
commit, a consumer **MUST** clear any slot whose id is unknown *or* whose
garment's category differs from the slot name, and **SHOULD** warn
(`unknown-garment-reference`) when the file contained such a reference. A slot
never renders a garment from the wrong category.

### 7.2 `SavedOutfit`

| Field | Type | Required |
|---|---|---|
| `id` | string | yes |
| `name` | string | yes |
| `selection` | object | yes — normalized per §7.1 |
| `createdAt` | number | yes — finite epoch ms |
| `coverHex` | string | yes — cached cover swatch, not format-validated |

A malformed look is dropped and reported; duplicate ids follow §6.5. If
`savedOutfits` is present but not an array, zero looks are imported and it is
reported — the document still imports.

---

## 8. Error model: what a reader must report

A conforming reader **MUST NOT** fail silently. Every record it discards or
alters **MUST** surface to the user, because a user who loses three garments to a
schema mismatch deserves to know which three.

### 8.1 Issue shape

Each issue carries a scope, a severity, a stable machine code, and a
human-readable message:

- **scope** — `document` | `garment` | `saved-outfit` | `current-outfit`
- **severity** — `dropped` (the record was discarded) | `warning` (kept, but
  altered or suspect)
- **code** — stable identifier, safe to switch on
- **message** — one line, shown verbatim to the user

### 8.2 Defined codes

| Code | Scope | Severity | Meaning |
|---|---|---|---|
| `not-json` | document | dropped | Bytes are not valid JSON. |
| `not-an-object` | document | dropped | Root is not an object. |
| `wrong-kind` | document | dropped | `kind` missing or wrong. |
| `unsupported-schema-version` | document | dropped | Missing, unusable, or newer than supported. |
| `missing-garments` | document | dropped | `garments` absent or not an array. |
| `invalid-shape` | garment / saved-outfit / current-outfit | dropped (warning for current-outfit) | Required fields missing or wrong-typed. |
| `duplicate-id` | garment / saved-outfit | dropped | Id repeated within the document; first wins. |
| `foreign-blob-ref` | garment | warning | A blob pointer from another profile was stripped (§5.2). |
| `unknown-garment-reference` | saved-outfit / current-outfit | warning | Slot names a garment the document does not contain. |

A reader **MAY** define additional codes; a reader **MUST NOT** repurpose these.

### 8.3 Disposition summary — the decision table

This table is the normative summary of §6–§7. When in doubt, this is the answer.

| Situation | Disposition |
|---|---|
| Envelope invalid (§3.1) | **Reject document**, import nothing |
| Required garment/outfit field missing or wrong type | **Drop record**, report, continue |
| Unrecognized `category` | **Drop garment**, report |
| Duplicate id within document | **Drop later record**, report |
| Optional field present, wrong type | **Drop field**, keep record |
| Unrecognized `analysisSource` | **Drop field**, keep garment |
| Unrecognized `proxy3dPreview.mode` | **Drop whole `proxy3dPreview`**, keep garment |
| Unrecognized `assetMode` | **Keep**; treat as `"uploaded"` for behaviour |
| `asset` present but not an object | **Drop `asset`**, keep garment |
| Malformed element inside `marketValueHistory` | **Drop that element**, keep the rest |
| `marketValueHistory` not an array | **Drop field**, keep garment |
| Blob ref present in a document | **Strip ref**, keep garment, warn |
| Outfit slot names an unknown/mismatched garment | **Clear that slot**, keep outfit, warn |
| Unknown key anywhere | **Ignore** (§8.4) |

### 8.4 Unknown keys

A consumer **MUST** ignore any key it does not recognize, at every level, and
**MUST NOT** treat its presence as an error. This is what makes §9.1 additions
safe.

A consumer **SHOULD** preserve unknown keys when it re-exports a document it
imported, so that data written by a newer producer survives a round trip through
an older one. The reference implementation preserves them (records pass through
as parsed objects). Decoders built on strict struct mapping — Swift `Codable`,
Rust `serde` with `deny_unknown_fields`, etc. — will drop them by default; if
lossless round-tripping matters to your client, capture the raw object alongside
the typed one.

---

## 9. Versioning policy

`schemaVersion` is a single integer. There is no minor version.

### 9.1 Additive changes — version stays the same

The following **do not** bump `schemaVersion`, because §8.4 guarantees an older
reader survives them:

- Adding a new **optional** field to any record.
- Adding a new optional key to the envelope.
- Adding a new value to a **tolerant** enum (`analysisSource`, `assetMode`,
  `proxy3dPreview.mode`), whose unrecognized-value behaviour is already defined
  in §8.3.
- Relaxing a producer constraint.

An older reader loses the new field's meaning but keeps every record. This is the
strongly preferred way to evolve the format.

### 9.2 Breaking changes — version increments

The following **MUST** bump `schemaVersion`:

- Adding, removing, or renaming a value of `category` (§6.4) — unrecognized
  values there are fatal to the record, so an older reader would *silently lose
  garments*.
- Adding a new **required** field, or making an optional field required.
- Changing a field's type or its meaning.
- Changing how images are represented (which **SHOULD** instead use a new
  `assetEncoding` value where possible — see §9.4).
- Changing the slot model in §7.1.

### 9.3 Reader compatibility rules

- A reader **MUST** reject `schemaVersion` **greater** than the highest it
  implements, with a message telling the user to update the app. Attempting a
  best-effort partial import of a future version is **forbidden**: the whole
  point of the fatal-`category` rule is that a future version may contain records
  an old reader cannot represent, and a partial import would silently discard
  them.
- A reader **MUST** accept every version **less than or equal to** the highest it
  implements, migrating as needed. Support for old versions is not dropped.
- A writer **MUST** emit only the current version.

### 9.4 Reserved extension points

- `assetEncoding` (§3) exists so image transport can change — e.g. to a zipped
  container with external image files — without touching the record schemas.
  A reader that does not recognize the value **SHOULD** still read the metadata.
- `AssetImageRef.kind` is a discriminated union with one member today
  (`"indexeddb-blob"`); other kinds may join. All are equally forbidden in an
  export document (§5.2).

---

## 10. Import modes

A document says nothing about how it should be applied — that is the importing
user's choice. A conforming client **MUST** offer, and **MUST** default to,
`merge`.

### 10.1 `merge` (default, non-destructive)

- A garment whose `id` is **not** already in the archive is **added**.
- A garment whose `id` **is** already in the archive is **skipped**: the
  **existing record wins, unconditionally**. There is no field-level merge, no
  timestamp comparison, and no prompting.
- Saved outfits follow the same rule on their own ids.
- The archive's **`currentOutfit` is left untouched** — the document's
  `currentOutfit` is ignored in this mode.

The rationale for existing-wins: the common case is re-importing an older backup
over a live archive. Letting the file win would silently revert edits the user
made after taking the backup. Merge is therefore guaranteed never to remove or
alter anything already present — re-importing a stale backup is always a no-op
plus additions.

### 10.2 `replace` (destructive, explicit only)

The document becomes the archive: garments, saved outfits and `currentOutfit`
are all taken from the file, and anything not in the file is gone.

A client **MUST NOT** select this mode by default and **MUST** confirm it
explicitly, stating how many existing pieces and looks will be removed. Those
counts are computable before committing (existing records whose ids the incoming
document does not contain).

### 10.3 Commit ordering

In both modes the resulting `currentOutfit` **MUST** be normalized against the
**final** garment list per §7.1 — after the merge or replace, not before — so a
slot can never end up pointing at a garment that did not survive.

---

## 11. Worked example

A minimal but complete document with one garment, one look, and a styled rail:

```json
{
  "kind": "fit-archive.archive",
  "schemaVersion": 1,
  "assetEncoding": "inline-data-url",
  "exportedAt": 1753577000000,
  "garments": [
    {
      "id": "grm-7f3a",
      "name": "Charcoal Bomber",
      "brand": "Unbranded",
      "category": "outerwear",
      "color": "Charcoal",
      "colorHex": "#2b2b2e",
      "styleTags": ["street", "layering"],
      "imageDataUrl": "data:image/webp;base64,UklGRi4AAABXRUJQVlA4TCEAAAAvAAAAAAfQ//73v/+BiOh/AAA=",
      "asset": {
        "originalImageUrl": "data:image/webp;base64,UklGRi4AAABXRUJQVlA4TCEAAAAvAAAAAAfQ//73v/+BiOh/AAA=",
        "displayImageUrl": "data:image/webp;base64,UklGRi4AAABXRUJQVlA4TCEAAAAvAAAAAAfQ//73v/+BiOh/AAA=",
        "assetMode": "uploaded"
      },
      "createdAt": 1753500000000,
      "updatedAt": 1753500000000
    }
  ],
  "savedOutfits": [
    {
      "id": "look-1c9d",
      "name": "Cold Open",
      "selection": {
        "outerwear": "grm-7f3a",
        "top": null,
        "pants": null,
        "shoes": null,
        "accessory": null
      },
      "createdAt": 1753510000000,
      "coverHex": "#2b2b2e"
    }
  ],
  "currentOutfit": {
    "outerwear": "grm-7f3a",
    "top": null,
    "pants": null,
    "shoes": null,
    "accessory": null
  }
}
```

---

## 12. Conformance checklist

A decoder is conforming when it:

- [ ] Rejects exactly the five document-level conditions in §3.1, and nothing else.
- [ ] Rejects `schemaVersion` newer than it implements, rather than partially importing.
- [ ] Handles **both** base64 and percent-encoded data URLs (§5.1).
- [ ] Resolves the display image by the §6.3.1 chain, not by `assetMode`.
- [ ] Drops a garment for an unrecognized `category`, and **only** for that enum.
- [ ] Keeps a garment when any optional field is malformed, dropping just the field.
- [ ] Filters `marketValueHistory` element-wise rather than discarding the array.
- [ ] Keeps the **first** record on a duplicate id.
- [ ] Strips any blob ref it encounters and warns.
- [ ] Normalizes every `OutfitSelection` to five keys, clearing unknown and category-mismatched ids at commit.
- [ ] Reports every drop and warning with a stable code (§8.2).
- [ ] Defaults to `merge`, with existing-wins on id collision, leaving `currentOutfit` alone.
- [ ] Ignores unknown keys everywhere.

The fixtures in `src/lib/storage/__fixtures__/archive-export/` exercise every one
of these. Both this web client and the iOS client test against the same files;
if an implementation disagrees with a fixture, one of the two is wrong and the
disagreement is worth resolving before shipping.
