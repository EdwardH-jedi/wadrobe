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
