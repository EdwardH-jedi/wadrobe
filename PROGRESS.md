# thread/json-export — progress log

Archive JSON export/import + a schema contract an iOS client can implement
against. Source of truth for this thread; append one section per phase.

**Test baseline: 479 passing (59 files). Must never go red.**
Run the suite on Node 20, not the machine default Node 25:

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
npm run typecheck && npm test && npm run lint && npm run build
```

(Node ≥22 exposes a native global `localStorage` whose `.clear` is `undefined`;
inside vitest's jsdom it shadows jsdom's Storage and fails ~83 tests.)

---

## Starting state (inherited from an earlier session)

Commit `e0fdaae` already contained a working feature:

- `src/lib/storage/archiveExport.ts` — chunked writer, blob refs resolved and
  inlined as base64, refs dropped, `blob:` URLs never written.
- `src/lib/storage/archiveImport.ts` — validates through `storageTypes.ts`
  parsers one entry at a time, reports every drop as an `ArchiveImportIssue`.
- `src/components/settings/ArchiveTransferModal.tsx` + sidebar entry point.
- Reducer `IMPORT_ARCHIVE` with merge/replace.
- Tests for export, import, and round trip.

Missing against this thread's brief: the schema specification (Phase 1), the
golden fixtures (Phase 4), and property/fuzz coverage (Phase 6).

---

## Phase 1 — Read and specify ✅

Read the full storage layer (`archiveStorage`, `storageTypes`,
`indexedDbStorage`, `localStorageFallback`, `assetBlobStore`,
`garmentAssetStorage`), `src/domain/`, and `archiveReducer.ts`.

**Delivered:** `docs/ARCHIVE_EXPORT_SCHEMA.md` — a normative spec written for a
decoder implementer in another language. Covers the envelope, every field of
every record with required/optional and type, the full unknown-value decision
table (§8.3), the error/issue model with stable codes, a versioning policy
splitting additive from breaking changes, import-mode semantics, a worked
example, and a conformance checklist.

Three findings worth recording, all from reading the validators rather than the
types:

1. **Two data-URL forms exist in real exports.** Uploaded/cropped/cutout images
   are `;base64,`; the procedural sample wardrobe is percent-encoded
   (`data:image/svg+xml,%3Csvg…`, `seedGarments.ts:47`). A decoder that only
   handles base64 breaks on the sample set — the most likely first test file.
   Specified in §5.1.

2. **`category` is the only enum whose unknown value is fatal to the record**,
   because it is structural (it determines the outfit slot). Every other enum
   drops just its field. This asymmetry drives the versioning policy: adding a
   category is a breaking change (§9.2), adding an `analysisSource` is not.

3. **Gaps between intent and code.** `isGarmentItem`/`sanitizeGarment` do not
   validate `asset` at all (a garment with `asset: "banana"` passes), nor the
   optional `brand`/`notes` strings. Nothing throws — `getGarmentDisplayImage`
   is defensive — but a malformed asset can be persisted and re-exported. The
   spec states the intended rule (§6.3, §8.3: drop the field, keep the garment);
   the code is brought into line in Phase 2/3.

**Suite: 479 passed / 59 files** (documentation-only change, unchanged).

---

## Phases 2 & 3 — Export / Import ✅

The exporter and importer landed in `e0fdaae`; this phase audited both against
the spec and closed the gaps rather than rewriting working code.

**Audit result — already correct, now covered by explicit tests:** chunked
single-garment-at-a-time writing, blob refs resolved to base64 and dropped,
`blob:` object URLs never written, `assetMode` display precedence preserved,
per-entry validation through `storageTypes.ts`, `merge`/`replace` with
existing-wins, drop reporting with stable codes.

**Gap closed (finding 3 of Phase 1).** `sanitizeGarment` in `storageTypes.ts`
now drops a malformed `asset` and wrong-typed `brand`/`notes`:

- `asset` present but not a plain object (string, number, array, `null`) is
  dropped; the garment survives and renders from `imageDataUrl`.
- Fields *inside* a well-shaped `asset` are deliberately **not** pre-validated —
  `getGarmentDisplayImage` already skips non-string urls and terminates at
  `imageDataUrl`. Validation there is by use, not up front. The spec's §6.3 was
  tightened to say this outright, since "required" in a field table reads as
  "reject if absent" and that would be wrong here.
- `brand` and `notes` joined the existing wrong-typed-string drop list.

This is the storage validator, so the fix applies to both the import path and
ordinary persisted reads — the two cannot drift, which is the property CLAUDE.md
asks for.

**Scale (Phase 2's explicit ask).** Three tests over a synthetic 400-garment
archive: every piece exported with each blob-backed image resolved exactly once
and no key leaked into the file; the writer emits exactly `SIZE + 2` chunks,
proving it never buffers the garment list as one string; a full 400-piece export
re-imports with zero drops; and with every blob missing, all 400 pieces still
export against their thumbnails with an honest `unresolvedImageCount`.

**Suite: 491 passed / 59 files** (+12). typecheck, lint clean.

---

## Phase 4 — Golden fixtures ✅

**`src/lib/storage/__fixtures__/archive-export/`** — 16 committed JSON files
plus a `README.md`, and `archiveFixtures.conformance.test.ts` (88 assertions)
reading them off disk as raw text.

Valid: `minimal-valid` (only required fields, optional envelope keys absent),
`empty-archive`, `full-featured` (every optional field at once), `legacy-records`
(pre-asset-pipeline, percent-encoded SVG), `blob-backed-inlined` (conforming
blob-backed export incl. a piece whose blob was lost).
Non-conforming but recoverable: `blob-ref-leaked`, `unrecognized-enums`.
Malformed at document level: six files, one per rejection condition.
Malformed at record level: `malformed-garment-entries` (12 distinct breakages),
`malformed-outfits`, `malformed-saved-outfits-not-a-list`.

Notes:

- **No generator, by design.** A generator drifts with the code it is written
  against, which defeats the purpose — a fixture is only a contract if it can
  disagree with the implementation. The README states this and marks the
  directory append-only.
- Read as **raw text, never `import`ed**: `malformed-not-json.json` is
  deliberately unparseable. `import.meta.url` does not work here — Vite rewrites
  it to a root-relative browser path `fs` cannot open — so the loader resolves
  from `process.cwd()`.
- All 88 assertions passed on their first real run, i.e. the hand-computed
  expectations and the implementation already agreed. The fixtures document
  existing behaviour rather than having been fitted to it.

**Gap closed while building `blob-ref-leaked`.** The importer stripped foreign
blob *refs* but not process-local `blob:` object URLs, so a hand-edited or
non-conforming file could import a `displayImageUrl` pointing at another
session's object URL — a permanently broken image. `stripForeignBlobRefs` became
`sanitizeImportedAsset`, which also drops `blob:` urls from all six asset url
fields and warns with a new stable code, `process-local-url`. Required-by-type
fields are blanked rather than deleted so the display chain skips them. Spec
§5.3, §8.2, §8.3 and the §12 checklist updated to match.

**Suite: 579 passed / 60 files** (+88). typecheck, lint, build clean.

---

## Phase 5 — UI ✅

`ArchiveTransferModal` already existed from `e0fdaae` and already sat in the
right place (sidebar footer → "Backup & transfer"), already used the existing
`Modal`/`Button`/`Icon`/`chip` components and theme tokens, and already showed
the import drop report before committing. Two things the brief asked for were
missing.

**Export progress.** The button only flipped to a static "Building…". Added an
`onProgress(done, total)` dep to `writeArchiveExport`, threaded through
`exportArchive` in the context/provider, and rendered a labelled
`role="progressbar"` with a brass-accent fill and an "Inlining images — N of M
pieces" line.

The subtlety: the export loop holds the main thread, so a naive bar would jump
0 → 100 with nothing in between. `onProgress` is therefore **awaited**, letting
the modal `await` a macrotask every 25 pieces so the browser can actually paint.
A test asserts the writer waits for an async reporter rather than racing ahead
(`start-1, end-1, start-2, end-2`), and a component test observes the bar
mid-flight and then sees it replaced by the receipt.

**Actionable drop report.** The issue list already scrolled at `max-height:
190px`, but a long list buried the headline. Added a count line above it —
"2 entries skipped · 1 entry kept with a warning" — so the drop/warning split is
readable without scrolling. Warnings and drops were already visually
distinguished (`--danger` bullet for drops).

New CSS uses only existing tokens (`--accent`, `--line-strong`, `--text-200`)
and honours `prefers-reduced-motion`.

**Suite: 584 passed / 60 files** (+5). typecheck, lint, build clean.

---

## Phase 6 — Round-trip hardening ✅

`archiveTransfer.property.test.ts` — two properties over generated cases.

Randomness is a seeded mulberry32 PRNG, not a fuzzing dependency: no new
package (CLAUDE.md §3), the run is deterministic in CI, and every assertion
carries its seed so a failure reproduces immediately.

**Property 1 — round trip.** For 150 generated archives (garments with randomly
present optional fields, asset bundles, market-value histories, proxy previews;
random looks and rails), export → import returns garments, looks and current
outfit **deep-equal** to the input with **zero issues**. Plus: export is
idempotent (re-exporting an import is byte-identical), and the blob built by
`buildArchiveExportBlob` matches the streamed chunks exactly.

**Property 2 — the importer never corrupts.** 400 structurally mutated exports
(delete a key, replace with junk, duplicate an array element, alias a sibling,
deep-nest), 300 text-level corruptions (truncation, byte splicing, lone
surrogates), plus hand-picked non-documents and a prototype-pollution attempt.
Each asserts `reviewArchiveImportText` does not throw **and** that the result
satisfies the storage invariants: rejected documents commit nothing at all;
surviving garments have every required field well-typed and a known category;
ids unique; no blob ref and no `blob:` image url persisted; every selection
exactly five slots of `string | null`; every issue carries a valid
scope/severity/code/message.

**Bug found and fixed.** The fuzzer failed on seed 5 within seconds:

```
TypeError: asset[field]?.startsWith is not a function
```

`sanitizeImportedAsset` (added in Phase 4) used `asset[field]?.startsWith('blob:')`.
Optional chaining guards `null`/`undefined` but **not a wrong type**, and asset
fields are validated by use rather than up front — so a file with a numeric
`displayImageUrl` crashed the whole import instead of dropping one field. Now
type-checked before the call. This was reachable from any hand-edited file, and
no example-based test had covered it.

One further failure was the *test's* invariant being wrong, not the code: a
mutation put a `blob:` string into `assetMode`, and serializing the whole asset
to grep for `blob:` flagged it. A junk `assetMode` is tolerated by design
(spec §8.3) and is never fetched, so the invariant is now scoped to the six url
fields a renderer actually loads.

**Confidence run.** Before settling on the committed counts the suite was run at
1200 round-trips / 6000 structural mutations / 4000 text corruptions — all
green. The committed counts (150/400/300, ~0.4s) are the routine gate; raise the
loop bounds for a deeper sweep.

**Suite: 591 passed / 61 files** (+7). typecheck, lint, build clean.

---

## Status

All six phases complete. Final suite **591 passed / 61 files**, up from the 479
inherited at the start of this thread; typecheck, lint and build clean.

Deliverables: `docs/ARCHIVE_EXPORT_SCHEMA.md` (the cross-language contract),
`src/lib/storage/__fixtures__/archive-export/` (16 fixtures + README, the
artifact an iOS implementation tests against), exporter/importer hardened by
three real bug fixes, and the transfer UI with progress and an actionable drop
report.

Nothing merged, nothing pushed — the work sits on `thread/json-export`.

---

# Cross-client reconciliation (web ⇄ WardrobeDomain)

A second thread on the same branch: the Swift package at
`~/Desktop/archive-ios/WardrobeDomain` contains a decoder for this export
format that was **written blind** — its author never saw this exporter and
derived the format from `src/lib/storage/` alone, recording every guess in
`DECODER_ASSUMPTIONS.md`. These phases reconcile the two.

## Phase 1 — Establish what actually exists

**Audit of what the earlier unattended session landed on `thread/json-export`.**
The intended deliverables were an exporter, an importer, a schema doc and
committed golden fixtures. All four exist and **none of them is a stub**:

| Deliverable | File | Size | Verdict |
|---|---|---|---|
| Exporter | `src/lib/storage/archiveExport.ts` | 287 lines | Real. Chunked `write(chunk)` sink, one garment at a time; blob refs resolved out of the asset store and inlined as base64 data URLs; `*Ref` fields deleted; `blob:` object URLs excluded; progress callback; honest `unresolvedImageCount`. |
| Importer | `src/lib/storage/archiveImport.ts` | 435 lines | Real. Validates every entry through the existing `storageTypes.ts` parsers one at a time, reports each drop as an `ArchiveImportIssue` before committing; `merge` (default, never overwrites) vs explicit `replace`. |
| Spec | `docs/ARCHIVE_EXPORT_SCHEMA.md` | 657 lines | Real. RFC-2119 producer/consumer split, five document-level rejection codes, per-record tolerance rules, versioning policy. |
| Fixtures | `src/lib/storage/__fixtures__/archive-export/` | 16 `.json` + README | Real and committed (not generated), with a README stating expected outcomes per file. |

Also wired, not orphaned: `ArchiveProvider.tsx:391` calls
`buildArchiveExportBlob`, `ArchiveTransferModal` is mounted from
`ArchiveStudio.tsx:185`.

**Baselines at the start of this thread — both green:**

- `npm test` (Node 20): **591 passed / 61 files**
- `swift test` in WardrobeDomain: **462 tests in 81 suites passed**

No exporter work was needed in this phase; it had already landed complete.

**Read:** `WardrobeDomain/DECODER_ASSUMPTIONS.md`. It is an unusually honest
document — every guess states what was assumed, why, and what it costs if
wrong — and it closes with five questions for the exporter's author. Phase 2
answers them against the real format.

## Phase 3 — Shared golden fixtures

The fixture set already covered everything this phase asked for — minimal
valid, full-featured with every optional field, legacy records, blob-backed
assets, unrecognized enum values, and nine distinct malformed documents (six
rejected at the document level, three recovered at the record level). It was
not extended: the README's own rule 2 says a fixture set is append-only and
that changing one silently changes the contract, and there was no gap to fill.

What was missing was the part that makes them *shared*.

**Copied, not re-derived.** All 16 fixtures plus the README now also live at
`WardrobeDomain/Tests/WardrobeDomainTests/Fixtures/archive-export/`, declared
as a `.copy` resource (not `.process` — one fixture is deliberately not valid
JSON, and these bytes must reach the bundle unmodified).

**Byte identity is enforced, not asserted.** A copied file that nobody checks is
two files that agree today. Both repositories now commit the same
`FIXTURES.sha256`, and both suites verify it:

- web — `describe('fixture integrity')` in `archiveFixtures.conformance.test.ts`
- iOS — `FixtureIntegrityTests.checksumsMatch`

Editing a fixture in either place turns **both** suites red. Each check also
asserts the manifest lists 16 entries, so an empty or truncated manifest cannot
make the check vacuously pass.

**The Swift side now asserts the same outcomes.** New —
`ArchiveExportConformanceTests.swift`, 31 tests mirroring the web suite's
expectations file by file: the ids that survive `malformed-garment-entries.json`
and that the *first* duplicate wins, the 2 × `foreignBlobRef` + 1 ×
`processLocalURL` from `blob-ref-leaked.json`, the display chain refusing to let
a cutout shadow a product reference, percent-encoded SVG data urls, and each
malformed document mapping to its own spec §3.1 rejection code. Plus two
invariants over the whole set: nothing crashes and no surviving record is
malformed, and every importable fixture survives a Swift round trip.

**Suites: 608 web / 61 files** (+17), **496 Swift / 87 suites** (+31).

## Phase 4 — Proving the round trip crosses the boundary

Everything before this phase was inference. Both implementations can be
internally perfect and still disagree, and they were: each round-trip test on
each side read its own output back with its own reader, so a field they *both*
mishandled looked exactly like agreement.

**`archiveTransfer.crossclient.test.ts`** runs the whole loop across the process
boundary, inside `npm test`:

```
fixture → web importer → WEB EXPORTER → file
        → swift decoder → SWIFT ENCODER → file
        → web importer → compare
```

It shells out to `wardrobe-verify reencode` in the Swift package. Ten tests:
six fixtures round-tripped and compared field for field, the `kind`/
`schemaVersion`/`assetEncoding` envelope check, image bytes (both base64 and
percent-encoded), blob-backed bytes resolved out of a stub asset store at export
time, and a second lap asserting the trip is **idempotent**, not merely lossless
— one lap can hide a systematic rewrite that happens to be self-consistent.

It skips when the Swift package is absent (`WARDROBE_DOMAIN_PATH` overrides the
location) so a clone without the sibling checkout is not red for a reason that
has nothing to do with the format. `CROSSCLIENT_STRICT=1` turns that skip into a
failure, for a machine that is meant to have both.

**What it found.** Three real losses, all on the Swift side, all invisible to
either suite alone:

1. A Swift-written file had no `kind`, so the web importer refused it outright
   with `wrong-kind`. That direction had never worked. (Fixed in Phase 2, and
   this is the test that would have caught it.)
2. Unknown keys were destroyed — `fabricWeightGsm`, `futureAssetField`. Spec
   §8.4 asks that they survive a re-export.
3. An unrecognized `assetMode` was rewritten: `"holo-scan"` came back
   `"uploaded"`, silently downgrading a record from a newer build.

### What could not be automated, stated plainly

Three things, and none of them is covered by the ten passing tests above:

- **The browser download itself.** The test calls `writeArchiveExport` directly.
  `download.ts`, `URL.createObjectURL`, and the `ArchiveTransferModal` file
  picker are not exercised — jsdom has no download. The bytes are the same
  bytes; the delivery of them is untested here and is covered only by
  `ArchiveTransferModal.test.tsx` against a stubbed download.
- **An actual iOS app.** `WardrobeDomain` is a domain package with no
  application and no view layer, and no Simulator was run (another session owns
  it). What is proven is that the *domain layer* reads and writes the format.
- **A real archive of real photographs.** Every fixture carries tiny placeholder
  payloads. A genuine export is tens of megabytes of base64 (spec §5.4), and
  nothing here demonstrates that either side streams it without trouble. The
  Swift package benchmarks 500 synthetic garments at ~42 ms, but that is its own
  data, not a file that came out of this exporter.

**And the gap that automation cannot close, because the feature does not
exist:** an iOS client that imports this format gets every garment, every
field and every look, and **cannot display a single image**. Each image is a
data URL; `AssetFileRef` needs a filename. `AssetIntegrity` reports 16 unusable
references for the 5 garments of `full-featured.json` — one per image. Decoding
those payloads into the asset store is an import *pipeline*, not a decoder, and
it is not built. The data round-trips; the pictures do not render.

**Manual verification performed:** `wardrobe-verify inspect` was run against all
16 fixtures before and after the Phase 2 changes, and the before/after outcome
of each was compared against the expectations in the fixtures README by hand.
That comparison is what produced the divergence table.

**Suites: 618 web / 62 files** (+10), **498 Swift / 87 suites**. typecheck, lint
and build clean.

## Phase 5 — Break it deliberately

This importer was already fuzzed (`archiveTransfer.property.test.ts`, 150
round-trips / 400 structural mutations / 300 text corruptions). The Swift
package now has an equivalent of its own. But both can pass and the two can
still disagree, and a disagreement about a broken file is how a user ends up
with an archive on one device and an error on the other.

**`archiveTransfer.differential.test.ts`** puts the *same* mutants through
*both* decoders and requires they agree on the things the specification
actually fixes: accepted or rejected, which of the five §3.1 rejection codes,
and how many records survived. Warning taxonomies are deliberately not
compared — this side reports issue codes, the other reports warning kinds, and
forcing those to match would be inventing a rule the format does not have. What
is compared is that neither side drops anything without saying so.

It runs the whole mutant directory through `wardrobe-verify fuzzcheck` in one
process, so 360 mutants cost about a second. `DIFFERENTIAL_MUTANTS` raises it.

### What it found — and this one was ours

At 60 mutants per fixture the two implementations agreed. At 1,200 they did
not, ten times, always the same shape: **a saved outfit whose `selection` had
been mutated into an array.**

`typeof [] === 'object'`, so `isRecord` accepted it, `isSavedOutfit` passed, and
`parseCurrentOutfit` then normalized the array to an empty selection. The look
survived having silently lost everything it was styling, and **nothing was
reported** — the exact failure the validate-and-drop contract exists to prevent,
in the one code path that promises never to be silent.

The iOS decoder had been dropping and reporting that look all along. It was
right and this was wrong: spec §7.2 types `selection` as an object, and §3.1
already establishes that an array does not count as one.

Fixed in `storageTypes.ts` with `isPlainObject` — `isRecord` minus arrays —
applied to `isSavedOutfit.selection` and `parseCurrentOutfit`. Deliberately not
applied to `isGarmentItem`, where an array garment already fails on its missing
required fields and tightening the check would change nothing but the reason.
Regression tests added to `archiveImport.test.ts` so the fix does not depend on
the Swift toolchain being installed.

**Confidence run: 24,000 mutants across six fixtures, complete agreement on
every one.** The committed count is 360.

The other crash-class finding was on the Swift side — a deeply nested document
overflowed its stack — and is written up in that repository's PROGRESS.md.

**Suites: 627 web / 63 files** (+9), **504 Swift / 89 suites** (+6). typecheck,
lint and build clean.

## Phase 6 — RECONCILIATION.md

Written at the root of the Swift package, since that is where the port and its
assumptions live: `~/Desktop/archive-ios/WardrobeDomain/RECONCILIATION.md`.

Twelve divergences. **Eleven were the iOS side's**, all of them in the envelope
or in consumer rules — the two things it had to guess at. **One was ours**: the
array-`selection` silent drop from Phase 5. Three of the eleven were data loss
(unknown keys destroyed, `assetMode` rewritten, duplicate ids kept), and one
direction of the round trip had simply never worked, because a Swift-written
file carried no `kind` and this importer would have refused it outright.

The finding that matters for how this repository works:

> A round-trip test within one implementation proves serialization, not
> interoperability.

Both repositories had "export → import → identical" tests. Both passed. Both
were self-confirming — each read its own output back with its own reader, so a
field they *both* mishandled looked exactly like agreement. Only
`archiveTransfer.crossclient.test.ts` could see the difference.

`docs/ARCHIVE_EXPORT_SCHEMA.md` comes out of this well. It would have prevented
ten of the twelve divergences had it existed before the port rather than
alongside it, and every reconciliation decision in Phase 2 was settled by
quoting a section of it rather than by argument.

---

## Status

Six phases complete. Both suites green at every commit.

| | Start of this thread | Now |
|---|---|---|
| `npm test` | 591 / 61 files | **627 / 63 files** |
| `swift test` | 462 / 81 suites | **504 / 89 suites** |

typecheck, lint and build clean. Nothing merged, nothing pushed — the work sits
on `thread/json-export` here and on the Swift package's working branch.

**Changes to this repository across all six phases were deliberately small:**
the fixture-integrity check, the two cross-boundary test files, and one
production fix (`isPlainObject` in `storageTypes.ts`). The web format was the
source of truth and was treated as such; almost all the correcting happened on
the other side.

---

# Session 2 — running it from a clean shell

The reconciliation above was real; the suite it left behind was not reproducible.
Three problems appeared the moment it ran outside the session that wrote it, plus
the asset gap RECONCILIATION.md §5.1 records as the largest remaining item.

## Phase 1 — The seven failing component tests ✅

`npm test -- archiveTransfer` failed all seven tests in
`src/components/settings/ArchiveTransferModal.test.tsx` with
`TypeError: localStorage.clear is not a function` at line 65, in 4ms — before
any component rendered. Every test under `src/lib/storage/` passed.

### Cause

**Node's own `localStorage` shadows jsdom's.**

Node 22 shipped a built-in Web Storage implementation; Node 25 has it on by
default. This machine runs **v25.8.0**, so `globalThis.localStorage` exists
*before* the jsdom environment initialises — and jsdom cannot replace a global
Node already owns. Measured, inside the jsdom environment:

| | `typeof localStorage` | `typeof .clear` | `constructor.name` |
|---|---|---|---|
| default | `object` | **`undefined`** | `undefined` |
| `--no-experimental-webstorage` | `object` | `function` | `Storage` |

`window.localStorage === globalThis.localStorage` was `true` in both cases, so
the jsdom window was handing out Node's object. The
`Warning: --localstorage-file was provided without a valid path` in the run was
the same global announcing itself — a Node warning, not a jsdom one.

**Why only the `.tsx` file failed:** nothing under `src/lib/storage/` touches
the real `localStorage`. Those tests drive the storage facade through injected
in-memory stores. `ArchiveTransferModal.test.tsx` is the only file that renders
the real provider over the real browser API, so it is the only one that meets
the shadowed global.

**Why the previous session saw it pass:** it did not run this Node. The failure
is a property of the toolchain, not the test — which is why "the suite is green"
was true in one shell and false in another. None of the candidate causes in the
brief applied: there is no per-file environment annotation, no
`environmentMatchGlobs`, and one setup file that loads for every path.

### Fix

`vite.config.ts` now passes `--no-experimental-webstorage` through
`test.poolOptions.forks.execArgv` (and `threads`, for whichever pool is
selected). It lives in the config rather than an npm script so `npx vitest`,
`npm test` and an IDE runner all get it — a fix that works through one entry
point only is how this arrived.

`src/test/setup.ts` gained a tripwire: it asserts `localStorage` and
`sessionStorage` really implement `clear/getItem/setItem/removeItem/key`, and
fails at setup naming the cause if not. Verified by removing the flag:

```
Error: [test setup] globalThis.localStorage is not a Web Storage — missing
clear, getItem, setItem, removeItem, key.
This is almost certainly Node's own built-in localStorage shadowing jsdom's
(node v25.8.0).
```

One failure at setup, with the diagnosis, instead of seven `is not a function`
errors pointing at whichever line touched storage first.

Nothing was deleted from the test and no assertion was weakened.

### Verified, both invocations

```
env -u CROSSCLIENT_STRICT -u DIFFERENTIAL_MUTANTS npm test -- archiveTransfer
  → Test Files 5 passed (5) · Tests 35 passed (35)

CROSSCLIENT_STRICT=1 DIFFERENTIAL_MUTANTS=50000 npm test -- archiveTransfer
  → Test Files 5 passed (5) · Tests 35 passed (35)
```

The second still reports `Timeout calling "onTaskUpdate"` and SwiftPM lock
contention appears in both — Phases 2 and 3.
