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
