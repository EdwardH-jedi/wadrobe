// Pure state machine for the upload → archive ritual. No I/O, no timers, no
// Date.now/crypto — the created garment (with its id/timestamp) is minted by the
// provider's addGarment and handed in via ARCHIVE_START, keeping this reducer
// deterministic and unit-testable (the real UI flow can't run in jsdom because
// image processing needs canvas).
//
// Status flow (the spec's imageSelected folds into scanning, and
// suggestionReady + editingMetadata into review):
//   idle → scanning → crop → cutout → review → reference → archiving → archived
//   scanning → consent → scanning   (vision opt-in: confirm sends the photo)
//   consent → idle              (vision opt-in: cancel discards the input)
//   scanning → error            (image could not be read)
//   any → idle                  (RESET / reject)
//
// The `crop` step (Phase 9) lets the user prepare a clean display asset before
// cataloguing it; it is SKIPPABLE ("Use original" keeps `assetMode: 'uploaded'`).
// The `cutout` step (Phase 10) is an OPTIONAL local background-removal pass: the
// user can accept a cutout (`assetMode: 'cutout'`) or continue without it. The
// `reference` step is also optional/skippable: it defaults to the chosen display
// image, so confirming without touching it archives with whatever crop/cutout
// produced.
import type { GarmentDraft, GarmentItem } from '../../domain/garmentTypes'
import { buildUploadedAsset } from '../../domain/garmentAsset'
import type { GarmentAnalysisGuess } from '../../lib/ai/garmentAnalysisTypes'
import type { AnalyzerKind } from '../../lib/ai/createAnalyzer'
import type { ProductMatchCandidate } from '../../lib/productMatch/productMatchTypes'

export type UploadStatus =
  | 'idle'
  | 'scanning'
  | 'consent'
  | 'crop'
  | 'cutout'
  | 'review'
  | 'reference'
  | 'archiving'
  | 'archived'
  | 'error'

export interface UploadState {
  status: UploadStatus
  draft: GarmentDraft | null
  guess: GarmentAnalysisGuess | null
  /** Local demo reference candidates (only in `reference`). */
  candidates: ProductMatchCandidate[]
  /** The created Archive Piece (only in `archiving` / `archived`). */
  garment: GarmentItem | null
  /** User-facing message for a rejected file (idle) or a read failure (error). */
  error: string | null
}

export const initialUploadState: UploadState = {
  status: 'idle',
  draft: null,
  guess: null,
  candidates: [],
  garment: null,
  error: null,
}

export type UploadAction =
  | { type: 'RESET' }
  /** Bad file type/size: stay on the dropzone, surface the reason. */
  | { type: 'REJECT'; message: string }
  /** A valid image was accepted; the local demo scan begins. */
  | { type: 'SCAN_START' }
  /** The image could not be read/decoded. */
  | { type: 'SCAN_FAIL'; message: string }
  /**
   * Vision path, not yet consented: the local thumbnail is ready but the photo
   * has not been sent. Pause for the user to opt into transmission.
   */
  | { type: 'NEED_CONSENT' }
  /** Consent granted: resume scanning — the component re-runs the held input. */
  | { type: 'GRANT_CONSENT' }
  /** Consent declined: return the upload to the start (input is discarded). */
  | { type: 'DENY_CONSENT' }
  /** The local demo produced a draft + suggestion; the crop step opens. */
  | { type: 'SUGGESTED'; draft: GarmentDraft; guess: GarmentAnalysisGuess }
  /**
   * Leave the crop step for the cutout step. `croppedImageUrl` is the generated
   * crop, or null to keep the uploaded photo unchanged (skip).
   */
  | { type: 'APPLY_CROP'; croppedImageUrl: string | null }
  /**
   * Leave the cutout step for metadata review. `cutoutImageUrl` is an accepted
   * background-removed cutout, or null to continue without one (skip).
   */
  | { type: 'APPLY_CUTOUT'; cutoutImageUrl: string | null }
  /** The user edits a metadata or asset field (review or reference). */
  | { type: 'EDIT_DRAFT'; patch: Partial<GarmentDraft> }
  /** Move to the optional product/reference step. */
  | { type: 'TO_REFERENCE'; candidates: ProductMatchCandidate[] }
  /** Go back from the reference step to metadata. */
  | { type: 'BACK_TO_REVIEW' }
  /** Confirmed: the piece has been persisted; show the brief sealing beat. */
  | { type: 'ARCHIVE_START'; garment: GarmentItem }
  /** The Archive Piece card is ready to show. */
  | { type: 'ARCHIVE_DONE' }

export function uploadReducer(
  state: UploadState,
  action: UploadAction,
): UploadState {
  switch (action.type) {
    case 'RESET':
      return initialUploadState

    case 'REJECT':
      return { ...initialUploadState, error: action.message }

    case 'SCAN_START':
      return { ...initialUploadState, status: 'scanning' }

    case 'SCAN_FAIL':
      return { ...initialUploadState, status: 'error', error: action.message }

    case 'NEED_CONSENT':
      if (state.status !== 'scanning') return state
      return { ...state, status: 'consent' }

    case 'GRANT_CONSENT':
      if (state.status !== 'consent') return state
      return { ...state, status: 'scanning' }

    case 'DENY_CONSENT':
      if (state.status !== 'consent') return state
      return initialUploadState

    case 'SUGGESTED':
      return {
        status: 'crop',
        draft: action.draft,
        guess: action.guess,
        candidates: [],
        garment: null,
        error: null,
      }

    case 'APPLY_CROP': {
      if (state.status !== 'crop' || !state.draft) return state
      const base =
        state.draft.asset ?? buildUploadedAsset(state.draft.imageDataUrl)
      const asset = action.croppedImageUrl
        ? {
            ...base,
            croppedImageUrl: action.croppedImageUrl,
            displayImageUrl: action.croppedImageUrl,
            assetMode: 'cropped' as const,
          }
        : base // skipped: keep the uploaded display asset unchanged
      return {
        ...state,
        status: 'cutout',
        draft: { ...state.draft, asset },
      }
    }

    case 'APPLY_CUTOUT': {
      if (state.status !== 'cutout' || !state.draft) return state
      const base =
        state.draft.asset ?? buildUploadedAsset(state.draft.imageDataUrl)
      // Accept: display + assetMode move to the cutout in lockstep, so the
      // accepted cutout is the latest intentional display choice. Skip: keep the
      // current (uploaded/cropped) display asset unchanged.
      const asset = action.cutoutImageUrl
        ? {
            ...base,
            cutoutImageUrl: action.cutoutImageUrl,
            displayImageUrl: action.cutoutImageUrl,
            assetMode: 'cutout' as const,
          }
        : base
      return {
        ...state,
        status: 'review',
        draft: { ...state.draft, asset },
      }
    }

    case 'EDIT_DRAFT':
      if (
        (state.status !== 'review' && state.status !== 'reference') ||
        !state.draft
      ) {
        return state
      }
      return { ...state, draft: { ...state.draft, ...action.patch } }

    case 'TO_REFERENCE':
      if (state.status !== 'review') return state
      return { ...state, status: 'reference', candidates: action.candidates }

    case 'BACK_TO_REVIEW':
      if (state.status !== 'reference') return state
      return { ...state, status: 'review' }

    case 'ARCHIVE_START':
      if (state.status !== 'reference') return state
      return { ...state, status: 'archiving', garment: action.garment }

    case 'ARCHIVE_DONE':
      if (state.status !== 'archiving') return state
      return { ...state, status: 'archived' }

    default:
      return state
  }
}

// --- User-facing copy --------------------------------------------------------
// Centralized so a single honesty test can guarantee the rendered ritual never
// implies real AI / vision recognition, product recognition, or 3D try-on. The
// analyzer + product match are LOCAL MOCKS; every label here must read as a
// demo/draft/local/reference suggestion the user confirms.
export const UPLOAD_COPY = {
  scanBadge: 'Demo scan…',
  scanEyebrow: 'Demo style scan',
  scanTitle: 'Reading silhouette, color & category locally…',
  scanBody:
    'A local demo drafts a starting point — no photo leaves your device. You’ll confirm or edit it next.',
  // Cloud-analyzer variants (Phase 4): shown ONLY when the optional backend
  // vision provider is active, so the copy is honest that the photo is sent to a
  // server (the local/no-upload copy above would be false in that mode).
  scanBadgeCloud: 'Cloud scan…',
  scanEyebrowCloud: 'Cloud style scan',
  scanTitleCloud: 'Reading silhouette, color & category in the cloud…',
  scanBodyCloud:
    'Your photo is sent to a configured server to draft a starting point. You’ll confirm or edit every field next.',
  // Consent gate (Step 2): shown ONCE per session before the photo is sent on
  // the cloud-analyzer path. The mock path never reaches this — nothing is sent.
  consentTitle: 'Send this photo to draft details?',
  consentBody:
    'Your downscaled photo is sent to a configured server to draft a starting point — just this session. You confirm or edit every field next.',
  consentConfirm: 'Send & scan',
  consentCancel: 'Cancel',
  cropEyebrow: 'Prepare display asset',
  cropTitle: 'Crop the garment area',
  cropHint:
    'Frame the garment so it layers cleanly in the archive — a local, manual crop. Or keep the original photo. You can remove the background next.',
  cutoutEyebrow: 'Experimental garment cutout',
  cutoutTitle: 'Local background removal',
  cutoutHint:
    'Try removing the flat-lay background on your device — a local preview only, no upload. Quality varies with the photo; you can always continue without it.',
  cutoutPrepare: 'Prepare cutout',
  cutoutWorking: 'Removing background locally…',
  cutoutFailed:
    'The cutout could not be prepared. You can continue without it.',
  cutoutBeforeLabel: 'Original',
  cutoutAfterLabel: 'Cutout preview',
  cutoutUse: 'Use cutout',
  cutoutSkip: 'Continue without cutout',
  suggestionLabel: 'Draft metadata suggestion',
  // Provenance-neutral: true whether the draft came from the local mock or the
  // optional cloud vision provider (the scan step states which one ran).
  suggestionHint:
    'A draft guess — confirm or adjust every field before archiving.',
  referenceEyebrow: 'Reference (optional)',
  referenceTitle: 'Attach product context',
  referenceHint:
    'Reference candidates are local demos — nothing is matched for you. Confirm to archive with your uploaded photo, or add your own product details.',
  referenceFetch: 'Read details from page',
  referenceFetchWorking: 'Reading the product page…',
  referenceFetchDone: 'Filled from the product page — confirm or edit.',
  archivingTitle: 'Sealing the archive…',
  archivedEyebrow: 'Archive Piece created',
  archivedHint: 'Filed to your archive — entering the rail.',
  errorTitle: 'Couldn’t read that image',
} as const

// --- Scan-step copy selection ------------------------------------------------
// Pure selection of the scan-step copy by analyzer kind, extracted from the
// component so the "photo is sent to a server" disclosure can be asserted
// directly (the component only ever passes 'backend' once the user consented,
// so the cloud claim is never rendered before consent).
export interface ScanCopy {
  eyebrow: string
  title: string
  badge: string
  body: string
}

/**
 * Cloud (server-transmission) copy for the backend analyzer, on-device copy for
 * the mock. The caller is responsible for only requesting 'backend' once the
 * photo is actually about to be sent (i.e. consent granted).
 */
export function scanCopyForKind(kind: AnalyzerKind): ScanCopy {
  if (kind === 'backend') {
    return {
      eyebrow: UPLOAD_COPY.scanEyebrowCloud,
      title: UPLOAD_COPY.scanTitleCloud,
      badge: UPLOAD_COPY.scanBadgeCloud,
      body: UPLOAD_COPY.scanBodyCloud,
    }
  }
  return {
    eyebrow: UPLOAD_COPY.scanEyebrow,
    title: UPLOAD_COPY.scanTitle,
    badge: UPLOAD_COPY.scanBadge,
    body: UPLOAD_COPY.scanBody,
  }
}
