// Upload → archive ritual: pick a photo → a local demo scan sweeps the preview →
// a non-binding draft metadata suggestion → the user confirms/edits → the piece
// is persisted and celebrated as an "Archive Piece" → it transitions into the
// rail/closet. The analyzer is a LOCAL MOCK; no real AI / vision recognition
// runs. Flow logic lives in the pure `uploadReducer` (this file only wires it to
// image processing, persistence and timed visual beats).
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react'
import type { GarmentAsset, GarmentDraft } from '../../domain/garmentTypes'
import { CATEGORY_META } from '../../domain/garmentTaxonomy'
import {
  emptyGarmentDraft,
  isNameMissing,
  normalizeDraft,
} from '../../domain/garmentDraft'
import {
  buildUploadedAsset,
  getGarmentDisplayImage,
} from '../../domain/garmentAsset'
import { runGarmentAnalysis } from '../../lib/ai/mockGarmentAnalysis'
import { mockProductMatch } from '../../lib/productMatch/mockProductMatch'
import type { ProductMatchCandidate } from '../../lib/productMatch/productMatchTypes'
import { cx } from '../../lib/cx'
import {
  MAX_UPLOAD_BYTES,
  isSupportedImage,
  isWithinSizeLimit,
  processImageFile,
} from '../../lib/image/imageFileUtils'
import { cropImageToDataUrl } from '../../lib/image/cropImage'
import {
  cropRectFromControls,
  IDENTITY_CROP_CONTROLS,
  isIdentityCrop,
  MAX_CROP_ZOOM,
  type CropControls,
} from '../../lib/image/cropGeometry'
import {
  attemptGarmentCutout,
  type CutoutResult,
} from '../../lib/image/garmentCutout'
import { getAssetBlobStore } from '../../lib/storage/assetBlobStore'
import { blobBackDraftAsset } from '../../lib/storage/garmentAssetStorage'
import { formatDate } from '../../lib/format'
import { useArchive } from '../../app/providers/useArchive'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { GarmentFields } from './GarmentEditor'
import {
  UPLOAD_COPY,
  initialUploadState,
  uploadReducer,
} from './uploadFlow'

const SCAN_MIN_MS = 1300
const ARCHIVING_MS = 480
const ARCHIVED_HOLD_MS = 1600

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export interface UploadGarmentModalProps {
  open: boolean
  onClose: () => void
  onArchived?: (garmentId: string) => void
}

export function UploadGarmentModal({
  open,
  onClose,
  onArchived,
}: UploadGarmentModalProps) {
  const { addGarment } = useArchive()
  const [state, dispatch] = useReducer(uploadReducer, initialUploadState)
  const [drag, setDrag] = useState(false)
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null,
  )
  const [cropControls, setCropControls] = useState<CropControls>(
    IDENTITY_CROP_CONTROLS,
  )
  const [cropBusy, setCropBusy] = useState(false)
  const [cutoutPhase, setCutoutPhase] = useState<'idle' | 'working' | 'done'>(
    'idle',
  )
  const [cutoutResult, setCutoutResult] = useState<CutoutResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const requestIdRef = useRef(0)
  const archivingRef = useRef(false)

  // Keep the latest callbacks in refs so the archived auto-advance timer is not
  // reset by parent re-renders that hand us new callback identities.
  const onArchivedRef = useRef(onArchived)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onArchivedRef.current = onArchived
    onCloseRef.current = onClose
  })

  // Bumping the request id invalidates any in-flight scan so a stale result can
  // never land after the user resets or closes mid-scan.
  const resetCutout = useCallback(() => {
    setCutoutPhase('idle')
    setCutoutResult(null)
  }, [])

  const resetFlow = useCallback(() => {
    requestIdRef.current += 1
    archivingRef.current = false
    setDrag(false)
    setSelectedCandidateId(null)
    setCropControls(IDENTITY_CROP_CONTROLS)
    setCropBusy(false)
    resetCutout()
    dispatch({ type: 'RESET' })
  }, [resetCutout])

  // Clear transient state whenever the modal closes.
  useEffect(() => {
    if (!open) resetFlow()
  }, [open, resetFlow])

  // Timed visual beats. Persistence already happened at confirm, so these are
  // purely cosmetic — if a timer is skipped, the garment is still saved.
  useEffect(() => {
    if (state.status === 'archiving') {
      const t = window.setTimeout(
        () => dispatch({ type: 'ARCHIVE_DONE' }),
        ARCHIVING_MS,
      )
      return () => window.clearTimeout(t)
    }
    if (state.status === 'archived' && state.garment) {
      const id = state.garment.id
      const t = window.setTimeout(() => {
        onArchivedRef.current?.(id)
        onCloseRef.current()
      }, ARCHIVED_HOLD_MS)
      return () => window.clearTimeout(t)
    }
  }, [state.status, state.garment])

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    if (!isSupportedImage(file)) {
      dispatch({
        type: 'REJECT',
        message: 'That file is not an image. Try a JPG, PNG or WebP.',
      })
      return
    }
    if (!isWithinSizeLimit(file)) {
      dispatch({
        type: 'REJECT',
        message: `That image is over ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB. Try a smaller file.`,
      })
      return
    }

    dispatch({ type: 'SCAN_START' })
    setCropControls(IDENTITY_CROP_CONTROLS)
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    try {
      // Process the image and run the local mock, but hold the scan briefly.
      const [processed] = await Promise.all([
        processImageFile(file),
        delay(SCAN_MIN_MS),
      ])
      const result = await runGarmentAnalysis({
        fileName: file.name,
        fileSizeBytes: file.size,
        dominantColorHex: processed.dominantColorHex,
      })
      if (requestIdRef.current !== requestId) return

      const draft: GarmentDraft = {
        ...emptyGarmentDraft(processed.dataUrl),
        category: result.category,
        color: result.color,
        colorHex: result.colorHex,
        styleTags: [...result.styleTags],
        asset: buildUploadedAsset(processed.dataUrl),
      }
      dispatch({ type: 'SUGGESTED', draft, guess: result })
    } catch {
      if (requestIdRef.current !== requestId) return
      dispatch({
        type: 'SCAN_FAIL',
        message:
          'This image could not be read — the file appears to be damaged. Please choose a different clothing photo.',
      })
    }
  }

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    void handleFile(e.target.files?.[0])
    e.target.value = '' // allow re-selecting the same file
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDrag(false)
    void handleFile(e.dataTransfer.files?.[0])
  }

  // --- Crop step (Phase 9) ---------------------------------------------------
  // Generate a cropped JPEG from the (already-downscaled) uploaded thumbnail and
  // move to review. An identity crop or a canvas failure falls back to the
  // original photo, so this can never block archiving.
  const applyCrop = async () => {
    if (state.status !== 'crop' || !state.draft || cropBusy) return
    const rect = cropRectFromControls(cropControls)
    if (isIdentityCrop(rect)) {
      resetCutout()
      dispatch({ type: 'APPLY_CROP', croppedImageUrl: null })
      return
    }
    setCropBusy(true)
    try {
      const cropped = await cropImageToDataUrl(state.draft.imageDataUrl, rect)
      // If the crop was a no-op (canvas absent), treat it as "use original".
      const croppedImageUrl =
        cropped && cropped !== state.draft.imageDataUrl ? cropped : null
      resetCutout()
      dispatch({ type: 'APPLY_CROP', croppedImageUrl })
    } catch {
      resetCutout()
      dispatch({ type: 'APPLY_CROP', croppedImageUrl: null })
    } finally {
      setCropBusy(false)
    }
  }

  const useOriginalAndReview = () => {
    if (state.status !== 'crop') return
    resetCutout()
    dispatch({ type: 'APPLY_CROP', croppedImageUrl: null })
  }

  const cropRect = cropRectFromControls(cropControls)

  // --- Cutout step (Phase 10) ------------------------------------------------
  // Opt-in local background removal on the prepared display image. Non-blocking:
  // any unavailable/failed result is shown honestly and the user can continue.
  const prepareCutout = async () => {
    if (state.status !== 'cutout' || !state.draft || cutoutPhase === 'working') {
      return
    }
    setCutoutPhase('working')
    const reqId = requestIdRef.current + 1
    requestIdRef.current = reqId
    const source = getGarmentDisplayImage(state.draft)
    // `attemptGarmentCutout` is non-throwing by contract, but we still guard:
    // an unexpected throw (e.g. a future adapter) must NEVER strand the modal in
    // the "working" state — it falls back to an honest failed result.
    let result: CutoutResult
    try {
      result = await attemptGarmentCutout(source)
    } catch {
      result = { status: 'failed', reason: UPLOAD_COPY.cutoutFailed }
    }
    if (requestIdRef.current !== reqId) return // reset/closed mid-run
    setCutoutResult(result)
    setCutoutPhase('done')
  }

  const useCutout = () => {
    if (state.status !== 'cutout') return
    if (cutoutResult?.status !== 'success') return
    dispatch({ type: 'APPLY_CUTOUT', cutoutImageUrl: cutoutResult.cutoutImageUrl })
  }

  const skipCutout = () => {
    if (state.status !== 'cutout') return
    dispatch({ type: 'APPLY_CUTOUT', cutoutImageUrl: null })
  }

  const cutoutSucceeded = cutoutResult?.status === 'success'

  const handleArchive = async () => {
    if (state.status !== 'reference' || !state.draft || archivingRef.current) {
      return
    }
    if (isNameMissing(state.draft.name)) return // a name is required to archive
    archivingRef.current = true // guard the async gap against a double submit
    try {
      // Move heavy local images (cropped/cutout) into the blob store when a
      // durable backend exists — non-blocking and never throws into the flow
      // (a failure simply keeps the data URL). The piece is persisted at confirm.
      const normalized = normalizeDraft(state.draft)
      const store = await getAssetBlobStore()
      const draftToArchive = await blobBackDraftAsset(normalized, store)
      const garment = addGarment(draftToArchive)
      dispatch({ type: 'ARCHIVE_START', garment })
    } finally {
      archivingRef.current = false
    }
  }

  // Move from metadata to the optional product/reference step. Gated on the
  // name so the reference step can never be reached on a nameless draft.
  const goToReference = () => {
    if (!state.draft || isNameMissing(state.draft.name)) return
    const candidates = mockProductMatch({
      category: state.draft.category,
      color: state.draft.color,
      styleTags: state.draft.styleTags,
      name: state.draft.name,
      brand: state.draft.brand,
    })
    dispatch({ type: 'TO_REFERENCE', candidates })
  }

  // Reference-step asset editing. The asset always exists from the scan step.
  const setAsset = (patch: Partial<GarmentAsset>) => {
    if (!state.draft) return
    const base =
      state.draft.asset ?? buildUploadedAsset(state.draft.imageDataUrl)
    dispatch({ type: 'EDIT_DRAFT', patch: { asset: { ...base, ...patch } } })
  }

  // The "uploaded photo" display: the best prepared version of the user's own
  // photo — an accepted cutout, else the crop, else the raw upload. Reused
  // everywhere we revert away from a reference, so a cutout/crop is never lost
  // when toggling display sources.
  const uploadedDisplay = (
    asset: GarmentAsset,
  ): Pick<GarmentAsset, 'displayImageUrl' | 'assetMode'> => {
    if (asset.cutoutImageUrl)
      return { displayImageUrl: asset.cutoutImageUrl, assetMode: 'cutout' }
    if (asset.croppedImageUrl)
      return { displayImageUrl: asset.croppedImageUrl, assetMode: 'cropped' }
    return { displayImageUrl: asset.originalImageUrl, assetMode: 'uploaded' }
  }

  const useUploadedAsset = () => {
    if (!state.draft) return
    const base =
      state.draft.asset ?? buildUploadedAsset(state.draft.imageDataUrl)
    setAsset(uploadedDisplay(base))
  }

  const useReferenceAsset = () => {
    const ref = state.draft?.asset?.productReferenceImageUrl
    if (ref) setAsset({ displayImageUrl: ref, assetMode: 'product-reference' })
  }

  // Editing the reference URL re-syncs the display when "Reference image" is the
  // active source (and reverts to the uploaded photo when the URL is cleared),
  // so the source toggle never goes into an incoherent state.
  const setReferenceImageUrl = (url: string) => {
    if (!state.draft) return
    const base =
      state.draft.asset ?? buildUploadedAsset(state.draft.imageDataUrl)
    const patch: Partial<GarmentAsset> = { productReferenceImageUrl: url }
    if (base.assetMode === 'product-reference') {
      if (url.trim()) {
        patch.displayImageUrl = url
      } else {
        Object.assign(patch, uploadedDisplay(base))
      }
    }
    dispatch({ type: 'EDIT_DRAFT', patch: { asset: { ...base, ...patch } } })
  }

  const pickCandidate = (candidate: ProductMatchCandidate) => {
    if (!state.draft) return
    setSelectedCandidateId(candidate.id)
    const base =
      state.draft.asset ?? buildUploadedAsset(state.draft.imageDataUrl)
    if (candidate.candidateType === 'manual') {
      // Manual entry clears any picked reference; the user fills the fields.
      dispatch({
        type: 'EDIT_DRAFT',
        patch: {
          asset: {
            ...base,
            sourceLabel: undefined,
            sourceUrl: undefined,
            productReferenceImageUrl: undefined,
            ...uploadedDisplay(base),
          },
        },
      })
      return
    }
    dispatch({
      type: 'EDIT_DRAFT',
      patch: {
        brand: candidate.brand ?? state.draft.brand,
        asset: {
          ...base,
          sourceLabel: candidate.productName,
          sourceUrl: candidate.sourceUrl,
          productReferenceImageUrl: candidate.imageUrl,
          ...(candidate.imageUrl
            ? {
                displayImageUrl: candidate.imageUrl,
                assetMode: 'product-reference' as const,
              }
            : uploadedDisplay(base)),
        },
      },
    })
  }

  // Self-sufficient finish path for the "View in archive" button (the
  // auto-advance timer is only a fallback).
  const finishNow = () => {
    if (state.garment) onArchived?.(state.garment.id)
    onClose()
  }

  const confidencePct = state.guess ? Math.round(state.guess.confidence * 100) : 0
  const nameMissing =
    (state.status === 'review' || state.status === 'reference') && state.draft
      ? isNameMissing(state.draft.name)
      : false

  const footer = (() => {
    switch (state.status) {
      case 'crop':
        return (
          <>
            <Button variant="ghost" onClick={resetFlow}>
              Discard
            </Button>
            <Button variant="ghost" onClick={useOriginalAndReview} disabled={cropBusy}>
              Use original
            </Button>
            <Button variant="primary" onClick={applyCrop} disabled={cropBusy}>
              <Icon name="check" size={16} />
              {isIdentityCrop(cropRect) ? 'Continue' : 'Use crop'}
            </Button>
          </>
        )
      case 'cutout': {
        const working = cutoutPhase === 'working'
        const attempted = cutoutPhase === 'done'
        return (
          <>
            <Button variant="ghost" onClick={resetFlow}>
              Discard
            </Button>
            <Button
              variant={attempted && !cutoutSucceeded ? 'primary' : 'ghost'}
              onClick={skipCutout}
              disabled={working}
            >
              {UPLOAD_COPY.cutoutSkip}
            </Button>
            {cutoutSucceeded ? (
              <Button variant="primary" onClick={useCutout}>
                <Icon name="check" size={16} />
                {UPLOAD_COPY.cutoutUse}
              </Button>
            ) : !attempted ? (
              <Button variant="primary" onClick={prepareCutout} disabled={working}>
                {working ? UPLOAD_COPY.cutoutWorking : UPLOAD_COPY.cutoutPrepare}
              </Button>
            ) : null}
          </>
        )
      }
      case 'review':
        return (
          <>
            <Button variant="ghost" onClick={resetFlow}>
              Discard
            </Button>
            <Button
              variant="primary"
              disabled={nameMissing}
              onClick={goToReference}
            >
              Continue
            </Button>
          </>
        )
      case 'reference':
        return (
          <>
            <Button
              variant="ghost"
              onClick={() => dispatch({ type: 'BACK_TO_REVIEW' })}
            >
              Back
            </Button>
            <Button
              variant="primary"
              disabled={nameMissing}
              onClick={handleArchive}
            >
              <Icon name="check" size={16} />
              Confirm Archive Piece
            </Button>
          </>
        )
      case 'archived':
        return (
          <Button variant="primary" onClick={finishNow}>
            View in archive
          </Button>
        )
      case 'error':
        return (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={resetFlow}>
              Try another photo
            </Button>
          </>
        )
      case 'archiving':
        return null
      default:
        return (
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        )
    }
  })()

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      eyebrow="Upload"
      title="Archive a piece"
      footer={footer}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={onInputChange}
      />

      {state.status === 'idle' && (
        <div className="upload">
          <div
            className={`dropzone${drag ? ' dropzone--drag' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
          >
            <Icon name="image" size={40} className="dropzone__icon" />
            <div className="dropzone__title display">Drop a clothing photo</div>
            <div className="dropzone__hint">
              or click to browse · JPG, PNG, WebP · flat-lay or on-body
            </div>
          </div>
          {state.error && (
            <p style={{ color: 'var(--danger)', fontSize: 12.5 }}>
              {state.error}
            </p>
          )}
        </div>
      )}

      {state.status === 'scanning' && (
        <div className="upload">
          <div className="upload__grid">
            <div className="preview">
              {/* The image is still decoding; the scan sweep carries the moment. */}
              <div className="preview__scan" />
              <span className="preview__grade">
                <Badge variant="accent">{UPLOAD_COPY.scanBadge}</Badge>
              </span>
            </div>
            <div className="col" style={{ gap: 10, justifyContent: 'center' }}>
              <div className="eyebrow">{UPLOAD_COPY.scanEyebrow}</div>
              <div
                className="display"
                style={{ fontSize: 22, color: 'var(--text-100)' }}
              >
                {UPLOAD_COPY.scanTitle}
              </div>
              <p className="muted" style={{ fontSize: 12.5 }}>
                {UPLOAD_COPY.scanBody}
              </p>
            </div>
          </div>
        </div>
      )}

      {state.status === 'crop' && state.draft && (
        <div className="upload__grid">
          <div className="cropstage">
            <div className="cropframe">
              <img
                className="cropframe__img"
                src={state.draft.imageDataUrl}
                alt="Uploaded piece"
              />
              <div
                className="cropframe__window"
                style={{
                  left: `${cropRect.x * 100}%`,
                  top: `${cropRect.y * 100}%`,
                  width: `${cropRect.width * 100}%`,
                  height: `${cropRect.height * 100}%`,
                }}
              />
            </div>
          </div>

          <div className="upload">
            <div className="col" style={{ gap: 4 }}>
              <span className="eyebrow">{UPLOAD_COPY.cropEyebrow}</span>
              <h3
                className="display"
                style={{ fontSize: 18, color: 'var(--text-100)' }}
              >
                {UPLOAD_COPY.cropTitle}
              </h3>
              <p className="muted" style={{ fontSize: 11.5 }}>
                {UPLOAD_COPY.cropHint}
              </p>
            </div>

            <div className="cropsliders">
              <label className="field">
                <span className="field__label">Zoom</span>
                <input
                  type="range"
                  min={1}
                  max={MAX_CROP_ZOOM}
                  step={0.05}
                  value={cropControls.zoom}
                  onChange={(e) =>
                    setCropControls((c) => ({
                      ...c,
                      zoom: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label className="field">
                <span className="field__label">Horizontal</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={cropControls.offsetX}
                  disabled={cropControls.zoom <= 1}
                  onChange={(e) =>
                    setCropControls((c) => ({
                      ...c,
                      offsetX: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label className="field">
                <span className="field__label">Vertical</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={cropControls.offsetY}
                  disabled={cropControls.zoom <= 1}
                  onChange={(e) =>
                    setCropControls((c) => ({
                      ...c,
                      offsetY: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <button
                type="button"
                className="cropsliders__reset"
                onClick={() => setCropControls(IDENTITY_CROP_CONTROLS)}
                disabled={isIdentityCrop(cropRect)}
              >
                Reset crop
              </button>
            </div>
          </div>
        </div>
      )}

      {state.status === 'cutout' && state.draft && (
        <div className="upload__grid">
          <div className="cutoutstage">
            {cutoutSucceeded && cutoutResult?.status === 'success' ? (
              <div className="cutoutcompare">
                <figure className="cutoutcompare__cell">
                  <div className="preview preview--mini">
                    <img
                      src={getGarmentDisplayImage(state.draft)}
                      alt={UPLOAD_COPY.cutoutBeforeLabel}
                    />
                  </div>
                  <figcaption>{UPLOAD_COPY.cutoutBeforeLabel}</figcaption>
                </figure>
                <figure className="cutoutcompare__cell">
                  <div className="cutoutafter">
                    <img
                      src={cutoutResult.cutoutImageUrl}
                      alt={UPLOAD_COPY.cutoutAfterLabel}
                    />
                  </div>
                  <figcaption>{UPLOAD_COPY.cutoutAfterLabel}</figcaption>
                </figure>
              </div>
            ) : (
              <div className="preview">
                <img
                  src={getGarmentDisplayImage(state.draft)}
                  alt="Prepared piece"
                />
                {cutoutPhase === 'working' && <div className="preview__scan" />}
              </div>
            )}
          </div>

          <div className="upload">
            <div className="col" style={{ gap: 4 }}>
              <span className="eyebrow">{UPLOAD_COPY.cutoutEyebrow}</span>
              <h3
                className="display"
                style={{ fontSize: 18, color: 'var(--text-100)' }}
              >
                {UPLOAD_COPY.cutoutTitle}
              </h3>
              <p className="muted" style={{ fontSize: 11.5 }}>
                {UPLOAD_COPY.cutoutHint}
              </p>
            </div>

            {cutoutPhase === 'working' && (
              <p className="muted" style={{ fontSize: 12.5 }}>
                {UPLOAD_COPY.cutoutWorking}
              </p>
            )}

            {cutoutSucceeded && cutoutResult?.status === 'success' && (
              <div className="cutoutnote cutoutnote--ok">
                Background removed locally.
                {cutoutResult.warnings?.[0]
                  ? ` ${cutoutResult.warnings[0]}`
                  : ''}
              </div>
            )}

            {cutoutPhase === 'done' &&
              cutoutResult &&
              cutoutResult.status !== 'success' && (
                <div className="cutoutnote cutoutnote--warn">
                  {cutoutResult.reason}
                </div>
              )}
          </div>
        </div>
      )}

      {state.status === 'review' && state.draft && (
        <div className="upload__grid">
          <div className="preview">
            <img src={getGarmentDisplayImage(state.draft)} alt="Uploaded piece" />
            <span className="preview__grade">
              <Badge variant="accent">
                {CATEGORY_META[state.draft.category].label}
              </Badge>
            </span>
          </div>

          <div className="upload">
            {state.guess && (
              <div className="guess__banner">
                <span className="col" style={{ gap: 4 }}>
                  <span className="row" style={{ gap: 8 }}>
                    <Icon name="sparkles" size={16} />
                    <b>{UPLOAD_COPY.suggestionLabel}</b>
                  </span>
                  <span className="muted" style={{ fontSize: 11.5 }}>
                    {UPLOAD_COPY.suggestionHint}
                  </span>
                </span>
                <span className="guess__conf">Demo · {confidencePct}%</span>
              </div>
            )}
            <GarmentFields
              draft={state.draft}
              nameInvalid={nameMissing}
              onChange={(patch) => dispatch({ type: 'EDIT_DRAFT', patch })}
            />
            {nameMissing && (
              <p style={{ color: 'var(--danger)', fontSize: 12 }}>
                Name this archive piece before confirming.
              </p>
            )}
          </div>
        </div>
      )}

      {state.status === 'reference' && state.draft && (
        <div className="upload__grid">
          <div className="preview">
            <img
              src={getGarmentDisplayImage(state.draft)}
              alt="Archive asset preview"
            />
            <span className="preview__grade">
              <Badge variant="accent">
                {state.draft.asset?.assetMode === 'product-reference'
                  ? 'Reference'
                  : 'Uploaded'}
              </Badge>
            </span>
          </div>

          <div className="upload">
            <div className="col" style={{ gap: 4 }}>
              <span className="eyebrow">{UPLOAD_COPY.referenceEyebrow}</span>
              <h3
                className="display"
                style={{ fontSize: 18, color: 'var(--text-100)' }}
              >
                {UPLOAD_COPY.referenceTitle}
              </h3>
              <p className="muted" style={{ fontSize: 11.5 }}>
                {UPLOAD_COPY.referenceHint}
              </p>
            </div>

            <div className="field">
              <span className="field__label">Reference candidates (demo)</span>
              <div className="refcards">
                {state.candidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    className={cx(
                      'refcard',
                      selectedCandidateId === candidate.id && 'refcard--active',
                    )}
                    onClick={() => pickCandidate(candidate)}
                  >
                    <span className="refcard__name">
                      {candidate.productName ?? candidate.brand ?? 'Reference'}
                    </span>
                    <span className="refcard__reason">{candidate.reason}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="field__row">
              <div className="field">
                <label className="field__label" htmlFor="r-name">
                  Product name (optional)
                </label>
                <input
                  id="r-name"
                  className="field__input"
                  value={state.draft.asset?.sourceLabel ?? ''}
                  placeholder="e.g. Racing Jacket"
                  onChange={(e) => setAsset({ sourceLabel: e.target.value })}
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="r-source">
                  Source URL (optional)
                </label>
                <input
                  id="r-source"
                  className="field__input"
                  value={state.draft.asset?.sourceUrl ?? ''}
                  placeholder="https://…"
                  onChange={(e) => setAsset({ sourceUrl: e.target.value })}
                />
              </div>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="r-ref-img">
                Reference image URL (optional)
              </label>
              <input
                id="r-ref-img"
                className="field__input"
                value={state.draft.asset?.productReferenceImageUrl ?? ''}
                placeholder="https://…  (used as the display image only if you pick it)"
                onChange={(e) => setReferenceImageUrl(e.target.value)}
              />
            </div>

            <div className="field">
              <span className="field__label">Archive display image</span>
              <div className="catpills">
                <button
                  type="button"
                  className={cx(
                    'catpill',
                    state.draft.asset?.assetMode !== 'product-reference' &&
                      'catpill--active',
                  )}
                  onClick={useUploadedAsset}
                >
                  Uploaded photo
                </button>
                <button
                  type="button"
                  disabled={!state.draft.asset?.productReferenceImageUrl}
                  className={cx(
                    'catpill',
                    state.draft.asset?.assetMode === 'product-reference' &&
                      'catpill--active',
                  )}
                  onClick={useReferenceAsset}
                >
                  Reference image
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {state.status === 'archiving' && (
        <div className="archived">
          <div className="archived__seal archived__seal--working">
            <Icon name="layers" size={18} />
          </div>
          <div className="display" style={{ fontSize: 20, color: 'var(--text-100)' }}>
            {UPLOAD_COPY.archivingTitle}
          </div>
        </div>
      )}

      {state.status === 'archived' && state.garment && (
        <div className="archived">
          <div className="archived__seal">
            <Icon name="check" size={20} />
          </div>
          <div className="eyebrow">{UPLOAD_COPY.archivedEyebrow}</div>
          <div className="archived__card">
            <div className="archived__media">
              <img
                src={getGarmentDisplayImage(state.garment)}
                alt={state.garment.name}
              />
            </div>
            <div className="archived__meta">
              <h3 className="archived__name display">{state.garment.name}</h3>
              <div className="row" style={{ gap: 8 }}>
                <Badge variant="accent">
                  {CATEGORY_META[state.garment.category].label}
                </Badge>
                <span
                  className="garment-card__dot"
                  style={{ background: state.garment.colorHex }}
                />
                <span className="muted" style={{ fontSize: 12 }}>
                  {state.garment.color}
                </span>
              </div>
              {state.garment.styleTags.length > 0 && (
                <div className="garment-card__tags">
                  {state.garment.styleTags.slice(0, 4).map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="muted" style={{ fontSize: 11.5 }}>
                Archived · {formatDate(state.garment.createdAt)}
              </div>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 12 }}>
            {UPLOAD_COPY.archivedHint}
          </p>
        </div>
      )}

      {state.status === 'error' && (
        <div className="upload">
          <div className="empty" style={{ borderStyle: 'solid' }}>
            <Icon name="image" size={34} className="empty__icon" />
            <div className="empty__title display">{UPLOAD_COPY.errorTitle}</div>
            {state.error && <p className="empty__text">{state.error}</p>}
          </div>
        </div>
      )}
    </Modal>
  )
}
