# Mobile migration readiness

**No mobile app exists and none is being built.** This document exists so that a
future React Native / Expo client can be scoped honestly: what would port
unchanged, what would have to be rewritten, and what the actual blockers are.

It is an assessment, not a plan of record. Nothing here should be read as
committed work.

---

## Why the app is in reasonable shape for this

The layering rule this codebase already follows — `domain/` → `lib/` →
`app/providers/` → `components/` — happens to be the same line a mobile port
needs to cut along. The state layer is a **pure reducer** that receives ids,
timestamps, and events through its action payloads rather than calling
`Date.now()` or `crypto` itself, which means it has no ambient platform
dependency at all.

Verified against the current tree, two ways: a static scan finds **no browser
API used in any file under `src/domain/`** (the only matches are the words
"Blob" and "Image" inside comments and a function name), and every domain module
imports and evaluates cleanly with `window`, `document`, `localStorage`,
`sessionStorage`, `indexedDB`, `fetch`, `FileReader`, `Image` and `URL` all
deleted from the global object. The one cross-layer import in the whole
directory is `fitCheck.ts → lib/color`, and `lib/color.ts` is itself pure
arithmetic.

That is the asset. The liability is that the *adapters* are not behind
interfaces uniformly — storage is (`ArchiveStorageAdapter`), image processing
mostly is (`CutoutDeps`), and a few modules reach for `import.meta.env` directly.

---

## Reusable with minimal change

Roughly 1,080 lines of domain logic plus the pure half of `lib/` — about 1,600
lines total — port as-is. They are plain TypeScript with no React and no DOM.

| Module | What it holds |
| --- | --- |
| `domain/garmentTypes.ts`, `domain/outfitTypes.ts`, `domain/archiveTypes.ts` | The entire data model. |
| `domain/garmentTaxonomy.ts` | Categories, body zones, colour options, style tags. |
| `domain/garmentDraft.ts` | Draft construction and validation (including the required-name rule). |
| `domain/fitCheck.ts` | Palette/tone/completeness scoring. |
| `domain/marketValue.ts` | Value-history math and trend derivation. |
| `domain/garmentLayout.ts` | Layer presets and z-ordering — the *semantics*, not the CSS. |
| `domain/garmentAsset.ts` | Display-image precedence (`getGarmentDisplayImage`). Returns URL strings; see the caveat below. |
| `domain/archiveProvenance.ts` | Analysis provenance rules. |
| `app/providers/archiveReducer.ts` | The pure reducer. React-independent by construction. |
| `lib/color.ts`, `lib/format.ts`, `lib/id.ts`, `lib/cx.ts` | Utilities. `cx` is web-flavoured but harmless. |
| `lib/ai/mockGarmentAnalysis.ts`, `lib/ai/visionAnalysis.ts`, `lib/ai/garmentAnalysisTypes.ts` | The default analyzer and the vision-response parser. |
| `lib/productMatch/*` (except the fetch itself) | URL guarding, metadata parsing, mock matching. |
| `lib/candidates/ebaySearch.ts` | Candidate mapping. |
| `lib/image/cropGeometry.ts` | Crop math, separated from the canvas that applies it. |
| `lib/storage/garmentAssetStorage.ts`, `lib/storage/storageTypes.ts` | Dehydrate/hydrate logic and the adapter contract. |

**One caveat.** `getGarmentDisplayImage` returns a URL string, and on web some of
those are `blob:` object URLs. React Native has no object URLs; a port would
resolve refs to `file://` paths instead. The *precedence logic* is what ports —
cutout → display → cropped → original → thumbnail — not the URL scheme.

---

## Web platform adapters that must be replaced

| Web module | Depends on | React Native equivalent |
| --- | --- | --- |
| `lib/storage/indexedDbStorage.ts` | IndexedDB | SQLite (expo-sqlite / op-sqlite) or MMKV. |
| `lib/storage/localStorageFallback.ts` | localStorage | AsyncStorage / MMKV. |
| `lib/storage/assetBlobStore.ts` | IndexedDB Blobs + `URL.createObjectURL` | Filesystem (expo-file-system); records store paths, not object URLs. |
| `lib/storage/archiveStorage.ts` | The probe/fallback chain above | Same three-tier idea, different probes. |
| `lib/image/imageFileUtils.ts` | `FileReader`, `new Image()`, canvas downscale | expo-image-manipulator. |
| `lib/image/cropImage.ts` | Canvas 2D | expo-image-manipulator crop, driven by the *unchanged* `cropGeometry` math. |
| `lib/image/garmentCutout.ts` | Canvas `getImageData` pixel access | Needs a native pixel path — the largest single rewrite here. The `CutoutDeps` seam helps; the flood fill itself is portable, its rasterizer is not. |
| `lib/ai/visionConsent.ts` | `sessionStorage` | In-memory state, or AsyncStorage with an explicit session key. |
| `lib/ai/backendClient.ts`, `lib/candidates/candidateProvider.ts`, `lib/featureFlags.ts` | `import.meta.env` | These already take an injected env slice with `import.meta.env` only as a *default argument* — a port supplies `process.env`/`expo-constants` instead and changes nothing else. This is the cheapest category on the page. |
| `components/**` | DOM, plain CSS, `mix-blend-mode` | Full rewrite. `mix-blend-mode: multiply` — how flat-lay backgrounds are dropped — has no direct RN equivalent and would need a shader or a real cutout. |
| `components/avatar/GlbViewer.tsx` | three.js + WebGL canvas | expo-gl + expo-three, if the experimental track were ported at all. Probably it should not be. |

The `components/` tree is ~6,400 lines and none of it survives. That is expected
and is not a design failure — it is the UI.

## The backend contracts port unchanged

The optional Edge functions (`api/`) are plain HTTP with JSON bodies. A mobile
client can call the same three endpoints with the same payloads; only the
transport helper changes. `api/analyze` takes a data-URL image, which a mobile
client can produce as easily as a browser can.

The experimental FastAPI service is localhost-only and would not be reachable
from a device without hosting it — another reason the 3D track is the wrong thing
to port first.

---

## A plausible future shape

*If* this were ever done, the conventional structure would be:

```
packages/core/      domain/ + the pure half of lib/ + the reducer
packages/adapters/  the platform-agnostic adapter interfaces
apps/web/           the current Vite app, importing packages/core
apps/mobile/        Expo, importing packages/core with native adapters
services/api/       the Edge functions
services/proxy3d/   the experimental FastAPI service
```

**This migration is not being performed, and no monorepo tooling has been
added.** Doing it prematurely would buy nothing: today there is one consumer of
the domain layer, so a workspace split would add build complexity with no payoff.

---

## What would actually block a port today

Honest list, in order of cost:

1. **The cutout pixel path.** `garmentCutout.ts` needs canvas `getImageData`. The
   algorithm is portable; the raster access is not. This is the real work.
2. **`mix-blend-mode` in the mannequin composition.** The 2.5D preview leans on a
   CSS blend mode to drop white flat-lay backgrounds cheaply. There is no
   equivalent, so a mobile port would either need shader work or would have to
   make the cutout mandatory rather than optional.
3. **Object-URL assumptions in the asset layer.** Mechanical, but it touches
   hydration, the orphan sweep, and the display-precedence chain — all of which
   are currently correct and well tested, so the risk is regression, not
   difficulty.
4. **Nothing in the domain layer.** Verified: it is already free.

## The one thing worth doing now

Not a monorepo. The single highest-value preparatory step is to stop the domain
layer's purity from eroding, since this entire document depends on it. Two cheap
options, either of which would do:

- an ESLint rule forbidding `src/domain/**` from importing anything outside
  `src/domain/` and `src/lib/color`; or
- a test that imports every domain module with the browser globals deleted —
  the check described above, made permanent.

Both cost a few lines and are useful even if a mobile client is never built.
