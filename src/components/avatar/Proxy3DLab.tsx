// Proxy 3D Lab view (Track B3 → B3.9): upload a front PNG (required) and an
// optional back PNG, run the per-side cutout-first flow with tunable Track A
// cutout settings, adjust the back alignment manually, and generate a
// single- or dual-sided proxy 3D preview. Since B3.9 the lab can also be
// LINKED to a closet piece: the piece's archive image preloads as the front,
// a successful generation can be saved to the piece (job id + honest
// metadata only — the GLB stays in the local backend), and a saved preview
// can be reopened, regenerated, or unlinked. Standalone use is unchanged.
import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import type {
  GarmentItem,
  GarmentProxy3dPreview,
} from '../../domain/garmentTypes'
import { getGarmentDisplayImage } from '../../domain/garmentAsset'
import { formatDate } from '../../lib/format'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { Panel } from '../ui/Panel'
import { GlbViewer } from './GlbViewer'
import { Proxy3dApiError, createProxy3d, getProxy3d } from './proxy3dApi'
import {
  PROXY3D_MODE_LABEL,
  garmentImageToPngFile,
  previewFromRecord,
} from './proxy3dBridge'
import { detectUsableAlpha, runProxyCutout } from './proxy3dCutout'
import {
  BACK_ALIGNMENT_LIMITS,
  CUTOUT_SETTING_LIMITS,
  INITIAL_PROXY3D_STATE,
  MAX_PROXY3D_UPLOAD_BYTES,
  PROXY3D_COPY,
  PROXY3D_METHOD_LABEL,
  formatBytes,
  plannedGeneration,
  proxy3dFlowReducer,
  resultLabelFor,
  sideReadiness,
  type CutoutSettings,
  type Proxy3dSide,
  type SideState,
} from './proxy3dFlow'

function isPngFile(file: File): boolean {
  return file.type === 'image/png' || /\.png$/i.test(file.name)
}

interface SideRefs {
  front: File | null
  back: File | null
}

export interface Proxy3DLabProps {
  /** Track A bridge (B3.9): the closet piece this lab session is linked to. */
  linkedGarment?: GarmentItem | null
  /** Attach (preview) or remove (null) the piece's saved preview link. */
  onSetPreview?: (preview: GarmentProxy3dPreview | null) => void
  /** Detach the lab from the piece (keeps the lab's current state). */
  onUnlink?: () => void
}

/** Reopen panel for a piece's saved preview (B3.9). Checks the local backend
 *  first and stays honest when the result is gone or the backend is off. */
function SavedPreviewPanel({
  garmentName,
  preview,
  onRegenerate,
  onRemove,
}: {
  garmentName: string
  preview: GarmentProxy3dPreview
  onRegenerate: () => void
  onRemove?: (() => void) | undefined
}) {
  const [availability, setAvailability] = useState<
    'checking' | 'available' | 'missing'
  >('checking')

  useEffect(() => {
    let active = true
    setAvailability('checking')
    getProxy3d(preview.jobId)
      .then(() => {
        if (active) setAvailability('available')
      })
      .catch(() => {
        if (active) setAvailability('missing')
      })
    return () => {
      active = false
    }
  }, [preview.jobId])

  const resultUrl = `/api/proxy-3d/${preview.jobId}/result.glb`

  return (
    <Panel
      title={PROXY3D_COPY.savedPreviewTitle}
      actions={
        availability === 'available' ? (
          <a
            className="btn btn--primary"
            href={resultUrl}
            download="result.glb"
          >
            <Icon name="upload" size={16} style={{ rotate: '180deg' }} />
            {PROXY3D_COPY.downloadButton}
          </a>
        ) : undefined
      }
    >
      <div className="proxy3dlab__verdict">
        {PROXY3D_MODE_LABEL[preview.mode]}
      </div>

      <dl className="proxy3dlab__meta">
        <dt>{PROXY3D_COPY.linkedEyebrow}</dt>
        <dd>{garmentName}</dd>
        <dt>{PROXY3D_COPY.savedModeLabel}</dt>
        <dd>{PROXY3D_MODE_LABEL[preview.mode]}</dd>
        <dt>{PROXY3D_COPY.savedGeneratedLabel}</dt>
        <dd>{formatDate(preview.generatedAt)}</dd>
        {preview.vertexCount !== undefined && (
          <>
            <dt>{PROXY3D_COPY.metaVertices}</dt>
            <dd>{preview.vertexCount.toLocaleString()}</dd>
          </>
        )}
        {preview.faceCount !== undefined && (
          <>
            <dt>{PROXY3D_COPY.metaFaces}</dt>
            <dd>{preview.faceCount.toLocaleString()}</dd>
          </>
        )}
      </dl>

      <div className="proxy3dlab__limits">
        <span className="eyebrow">{PROXY3D_COPY.limitationsLabel}</span>
        <p>{preview.limitations}</p>
      </div>

      {availability === 'checking' && (
        <p className="muted">{PROXY3D_COPY.savedChecking}</p>
      )}
      {availability === 'missing' && (
        <div className="proxy3dlab__warn" role="alert">
          <Icon name="info" size={16} />
          <div>{PROXY3D_COPY.savedMissing}</div>
        </div>
      )}
      {availability === 'available' && <GlbViewer src={resultUrl} />}

      <div className="row proxy3dlab__actions">
        <Button variant="primary" onClick={onRegenerate}>
          <Icon name="refresh" size={16} />
          {PROXY3D_COPY.savedRegenerateButton}
        </Button>
        {onRemove && (
          <Button variant="quiet" onClick={onRemove}>
            {PROXY3D_COPY.savedRemoveButton}
          </Button>
        )}
      </div>
      <p className="muted proxy3dlab__choicenote">
        {PROXY3D_COPY.savedRemoveNote}
      </p>
    </Panel>
  )
}

export function Proxy3DLab({
  linkedGarment,
  onSetPreview,
  onUnlink,
}: Proxy3DLabProps = {}) {
  const [state, dispatch] = useReducer(
    proxy3dFlowReducer,
    INITIAL_PROXY3D_STATE,
  )
  const filesRef = useRef<SideRefs>({ front: null, back: null })
  const cutoutBlobsRef = useRef<{ front: Blob | null; back: Blob | null }>({
    front: null,
    back: null,
  })
  const previewUrlsRef = useRef<{ front: string | null; back: string | null }>(
    { front: null, back: null },
  )
  const inputRefs = {
    front: useRef<HTMLInputElement | null>(null),
    back: useRef<HTMLInputElement | null>(null),
  }
  // Guards async alpha-detection results against a newer selection per side.
  const selectSeqRef = useRef({ front: 0, back: 0 })

  const linked = linkedGarment ?? null
  // 'saved' shows the reopen panel for an existing preview; 'generate' runs
  // the normal lab flow (preloading the piece image as the front).
  const [linkedView, setLinkedView] = useState<'saved' | 'generate'>(
    linked?.proxy3dPreview ? 'saved' : 'generate',
  )
  const [prepare, setPrepare] = useState<'idle' | 'working' | 'failed'>('idle')
  const [attached, setAttached] = useState(false)
  // The garment id the front image was last preloaded for.
  const preparedForRef = useRef<string | null>(null)

  const revokePreview = (side: Proxy3dSide) => {
    const url = previewUrlsRef.current[side]
    if (url) {
      // Guarded like createObjectURL below — jsdom implements neither.
      if (typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(url)
      }
      previewUrlsRef.current[side] = null
    }
  }
  // Revoke thumbnail object URLs when the view unmounts.
  useEffect(
    () => () => {
      revokePreview('front')
      revokePreview('back')
    },
    [],
  )

  const busy =
    state.status === 'uploading' || state.front.cutting || state.back.cutting

  const clearSideRefs = (side: Proxy3dSide) => {
    revokePreview(side)
    filesRef.current[side] = null
    cutoutBlobsRef.current[side] = null
  }

  const handleFile = async (
    side: Proxy3dSide,
    file: File | null | undefined,
  ) => {
    if (!file || busy) return
    const seq = ++selectSeqRef.current[side]
    if (!isPngFile(file)) {
      dispatch({ type: 'REJECT_FILE', reason: PROXY3D_COPY.rejectNotPng })
      return
    }
    if (file.size > MAX_PROXY3D_UPLOAD_BYTES) {
      dispatch({ type: 'REJECT_FILE', reason: PROXY3D_COPY.rejectTooLarge })
      return
    }
    const alpha = await detectUsableAlpha(file)
    if (seq !== selectSeqRef.current[side]) return // a newer file was picked
    clearSideRefs(side)
    // jsdom has no createObjectURL — the thumbnail is optional there.
    const previewUrl =
      typeof URL.createObjectURL === 'function'
        ? URL.createObjectURL(file)
        : null
    previewUrlsRef.current[side] = previewUrl
    filesRef.current[side] = file
    dispatch({
      type: 'SELECT_FILE',
      side,
      file: { name: file.name, sizeBytes: file.size, previewUrl },
      alpha,
    })
  }

  // Reset bridge-local state when the linked piece changes (or unlinks), and
  // fall back to the generate flow when a saved preview link disappears.
  // Declared BEFORE the preload effect so on mount/piece-change the reset
  // runs first and cannot clobber the preload's 'working' status.
  useEffect(() => {
    setAttached(false)
    setPrepare('idle')
    setLinkedView(linked?.proxy3dPreview ? 'saved' : 'generate')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked?.id])
  useEffect(() => {
    if (linkedView === 'saved' && !linked?.proxy3dPreview) {
      setLinkedView('generate')
    }
  }, [linkedView, linked?.proxy3dPreview])

  // B3.9: preload the linked piece's display image as the front (once per
  // piece). Conversion to PNG keeps any cutout transparency; when it fails
  // (no canvas / undecodable) the lab stays usable via manual selection.
  // No cancellation cleanup on purpose: React StrictMode double-invokes
  // effects, and cancelling the first run while the ref guard blocks the
  // second would prepare nothing. A stale completion is already deduped by
  // handleFile's per-side selection sequence guard.
  useEffect(() => {
    if (!linked || linkedView !== 'generate') return
    if (preparedForRef.current === linked.id) return
    preparedForRef.current = linked.id
    if (filesRef.current.front) return // user already picked a front
    setPrepare('working')
    void (async () => {
      const file = await garmentImageToPngFile(
        getGarmentDisplayImage(linked),
        `${linked.name}.png`,
      )
      if (!file) {
        setPrepare('failed')
        return
      }
      await handleFile('front', file)
      setPrepare('idle')
    })()
    // handleFile is recreated per render; the preparedForRef guard makes this
    // effect once-per-piece, so the narrow dependency list is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked?.id, linkedView])

  const handleCutout = async (side: Proxy3dSide) => {
    const file = filesRef.current[side]
    if (!file || busy) return
    // A (re)cut replaces the previous result — drop the stale blob now.
    cutoutBlobsRef.current[side] = null
    const settings = state[side].cutoutSettings
    dispatch({ type: 'CUTOUT_START', side })
    const outcome = await runProxyCutout(file, {
      tolerance: settings.tolerance,
      uniformityMin: settings.uniformityMin,
    })
    if (outcome.status === 'success') {
      cutoutBlobsRef.current[side] = outcome.blob
      dispatch({
        type: 'CUTOUT_SUCCESS',
        side,
        cutout: {
          previewUrl: outcome.previewUrl,
          sizeBytes: outcome.blob.size,
        },
      })
    } else {
      dispatch({ type: 'CUTOUT_FAILURE', side, reason: outcome.reason })
    }
  }

  const handleRemoveBack = () => {
    if (busy) return
    clearSideRefs('back')
    selectSeqRef.current.back++
    dispatch({ type: 'REMOVE_SIDE', side: 'back' })
  }

  const submit = async (payload: {
    front: Blob
    frontName: string
    back?: Blob
    backName?: string
  }) => {
    setAttached(false)
    dispatch({ type: 'UPLOAD_START' })
    try {
      const record = await createProxy3d(payload.front, payload.frontName, {
        back: payload.back,
        backName: payload.backName,
        ...(payload.back
          ? {
              backScale: state.backAlignment.scale,
              backOffsetX: state.backAlignment.offsetX,
              backOffsetY: state.backAlignment.offsetY,
            }
          : {}),
      })
      dispatch({ type: 'UPLOAD_SUCCESS', record })
    } catch (error) {
      // Unreachable backend or a bare 5xx (e.g. the dev proxy reporting a
      // refused connection) -> show the "is the backend running?" hint.
      const connectivity =
        error instanceof Proxy3dApiError &&
        (error.status === null || error.status >= 500)
      dispatch({
        type: 'UPLOAD_FAILURE',
        message: error instanceof Error ? error.message : 'The upload failed.',
        connectivity,
      })
    }
  }

  /** Main Generate: single- or dual-sided per the resolved sides. */
  const handleSubmit = () => {
    const plan = plannedGeneration(state)
    const frontFile = filesRef.current.front
    if (!plan || !frontFile || busy) return
    const frontCutout = state.front.cutout
      ? cutoutBlobsRef.current.front
      : null
    const payload: Parameters<typeof submit>[0] = {
      front: frontCutout ?? frontFile,
      frontName: frontCutout ? 'front-cutout.png' : frontFile.name,
    }
    if (plan === 'dual') {
      const backFile = filesRef.current.back
      if (!backFile) return
      const backCutout = state.back.cutout ? cutoutBlobsRef.current.back : null
      payload.back = backCutout ?? backFile
      payload.backName = backCutout ? 'back-cutout.png' : backFile.name
    }
    void submit(payload)
  }

  /** Explicit front-side fallback: flat card from the original front only. */
  const handleFlatCard = () => {
    const frontFile = filesRef.current.front
    if (!frontFile || busy) return
    void submit({ front: frontFile, frontName: frontFile.name })
  }

  const handleAttach = () => {
    if (!state.record || !onSetPreview) return
    onSetPreview(previewFromRecord(state.record, Date.now()))
    setAttached(true)
  }

  const handleRegenerateSaved = () => {
    preparedForRef.current = null // re-prepare the front from the piece image
    setLinkedView('generate')
  }

  const handleReset = () => {
    if (busy) return
    clearSideRefs('front')
    clearSideRefs('back')
    selectSeqRef.current.front++
    selectSeqRef.current.back++
    preparedForRef.current = null
    setAttached(false)
    setPrepare('idle')
    dispatch({ type: 'RESET' })
  }

  const plan = plannedGeneration(state)
  const { record, backAlignment } = state

  const renderSlider = (
    label: string,
    value: number,
    limits: { min: number; max: number; step: number },
    display: string,
    onChange: (value: number) => void,
  ) => (
    <label className="proxy3dlab__slider">
      <span>{label}</span>
      <input
        type="range"
        aria-label={label}
        min={limits.min}
        max={limits.max}
        step={limits.step}
        value={value}
        disabled={busy}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <code>{display}</code>
    </label>
  )

  const renderCutoutTuning = (side: Proxy3dSide, sideState: SideState) => {
    const settings = sideState.cutoutSettings
    const setSetting = (setting: keyof CutoutSettings) => (value: number) =>
      dispatch({ type: 'SET_CUTOUT_SETTING', side, setting, value })
    return (
      <div className="proxy3dlab__tuning">
        <div className="eyebrow">{PROXY3D_COPY.cutoutTuningTitle}</div>
        <div className="muted proxy3dlab__tuninghint">
          {PROXY3D_COPY.cutoutTuningHint}
        </div>
        {renderSlider(
          PROXY3D_COPY.toleranceLabel,
          settings.tolerance,
          CUTOUT_SETTING_LIMITS.tolerance,
          String(settings.tolerance),
          setSetting('tolerance'),
        )}
        {renderSlider(
          PROXY3D_COPY.uniformityLabel,
          settings.uniformityMin,
          CUTOUT_SETTING_LIMITS.uniformityMin,
          settings.uniformityMin.toFixed(2),
          setSetting('uniformityMin'),
        )}
        <div className="row proxy3dlab__choices">
          {sideState.cutout && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void handleCutout(side)}
            >
              <Icon name="refresh" size={15} />
              {PROXY3D_COPY.recreateCutoutButton}
            </Button>
          )}
          <Button
            variant="quiet"
            size="sm"
            disabled={busy}
            onClick={() => dispatch({ type: 'RESET_CUTOUT_SETTINGS', side })}
          >
            {PROXY3D_COPY.resetCutoutSettingsButton}
          </Button>
        </div>
      </div>
    )
  }

  const renderSideCard = (side: Proxy3dSide) => {
    const sideState: SideState = state[side]
    const readiness = sideReadiness(sideState)
    const file = sideState.file
    const isBack = side === 'back'

    return (
      <div className="proxy3dlab__side" data-side={side}>
        <div className="eyebrow proxy3dlab__sidelabel">
          {isBack ? PROXY3D_COPY.backLabel : PROXY3D_COPY.frontLabel}
        </div>

        <div className="proxy3dlab__pick">
          <input
            ref={inputRefs[side]}
            type="file"
            accept="image/png,.png"
            data-side={side}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              void handleFile(side, event.target.files?.[0])
              event.target.value = ''
            }}
            hidden
          />
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => inputRefs[side].current?.click()}
          >
            <Icon name="image" size={15} />
            {file ? PROXY3D_COPY.replaceButton : PROXY3D_COPY.selectButton}
          </Button>
          {isBack && file && (
            <Button
              variant="quiet"
              size="sm"
              disabled={busy}
              onClick={handleRemoveBack}
            >
              {PROXY3D_COPY.removeBackButton}
            </Button>
          )}
        </div>

        {!isBack && prepare === 'working' && (
          <div className="muted proxy3dlab__asisnote">
            {PROXY3D_COPY.linkedPreparing}
          </div>
        )}
        {!isBack && prepare === 'failed' && (
          <div className="muted proxy3dlab__asisnote">
            {PROXY3D_COPY.linkedPrepareFailed}
          </div>
        )}

        {file && (
          <div className="proxy3dlab__file">
            {file.previewUrl && (
              <img src={file.previewUrl} alt="" className="proxy3dlab__thumb" />
            )}
            <div>
              <div className="proxy3dlab__filename">{file.name}</div>
              <div className="muted">
                {formatBytes(file.sizeBytes)}
                {' · '}
                {sideState.alpha === 'usable'
                  ? PROXY3D_COPY.alphaOkNote
                  : sideState.alpha === 'none'
                    ? PROXY3D_COPY.noAlphaTitle
                    : PROXY3D_COPY.alphaUnknownNote}
              </div>
            </div>
          </div>
        )}

        {readiness === 'pending-choice' && (
          <div className="proxy3dlab__warn" role="alert">
            <Icon name="info" size={16} />
            <div>
              <b>{PROXY3D_COPY.noAlphaTitle} — </b>
              {isBack
                ? PROXY3D_COPY.noAlphaBackWarning
                : PROXY3D_COPY.noAlphaWarning}
              {sideState.cutoutError && (
                <div className="muted">
                  {PROXY3D_COPY.cutoutFailedIntro}
                  {sideState.cutoutError}
                </div>
              )}
              <div className="row proxy3dlab__choices">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy}
                  onClick={() => void handleCutout(side)}
                >
                  <Icon name="sparkles" size={15} />
                  {PROXY3D_COPY.cutoutButton}
                </Button>
                {isBack ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => dispatch({ type: 'USE_BACK_AS_IS' })}
                    title={PROXY3D_COPY.backUseAsIsNote}
                  >
                    {PROXY3D_COPY.backUseAsIsButton}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={handleFlatCard}
                    title={PROXY3D_COPY.flatCardNote}
                  >
                    {PROXY3D_COPY.flatCardButton}
                  </Button>
                )}
              </div>
              {!isBack && (
                <div className="muted proxy3dlab__choicenote">
                  {PROXY3D_COPY.flatCardNote}
                </div>
              )}
            </div>
          </div>
        )}

        {readiness === 'ready-as-is' && (
          <div className="muted proxy3dlab__asisnote">
            {PROXY3D_COPY.backAsIsChosenNote}{' '}
            {PROXY3D_COPY.backUseAsIsNote}
          </div>
        )}

        {sideState.cutting && (
          <div className="proxy3dlab__working">
            <Icon name="refresh" size={18} className="spin" />
            <div>
              <b>{PROXY3D_COPY.cuttingTitle}</b>
              <div className="muted">{PROXY3D_COPY.cuttingHint}</div>
            </div>
          </div>
        )}

        {sideState.cutout && (
          <div className="proxy3dlab__file proxy3dlab__file--cutout">
            <img
              src={sideState.cutout.previewUrl}
              alt=""
              className="proxy3dlab__thumb"
            />
            <div>
              <div className="proxy3dlab__filename">
                {PROXY3D_COPY.cutoutReadyTitle}
              </div>
              <div className="muted">
                {formatBytes(sideState.cutout.sizeBytes)} ·{' '}
                {PROXY3D_COPY.cutoutReadyHint}
              </div>
            </div>
          </div>
        )}

        {sideState.alpha === 'none' && renderCutoutTuning(side, sideState)}
      </div>
    )
  }

  // B3.9: reopen mode for a piece's saved preview.
  if (linked?.proxy3dPreview && linkedView === 'saved') {
    return (
      <div className="stack-lg proxy3dlab">
        <SavedPreviewPanel
          garmentName={linked.name}
          preview={linked.proxy3dPreview}
          onRegenerate={handleRegenerateSaved}
          onRemove={onSetPreview ? () => onSetPreview(null) : undefined}
        />
      </div>
    )
  }

  const frontPreviewUrl =
    state.front.cutout?.previewUrl ?? state.front.file?.previewUrl ?? null
  const backPreviewUrl =
    state.back.cutout?.previewUrl ?? state.back.file?.previewUrl ?? null
  const showAlignment = plan === 'dual'

  return (
    <div className="stack-lg proxy3dlab">
      <Panel title={PROXY3D_COPY.panelTitle}>
        {linked && (
          <div className="proxy3dlab__linked">
            <div>
              <span className="eyebrow">{PROXY3D_COPY.linkedEyebrow}</span>
              <div className="proxy3dlab__filename">{linked.name}</div>
              <div className="muted proxy3dlab__choicenote">
                {PROXY3D_COPY.linkedGenerateHint}
              </div>
            </div>
            {onUnlink && (
              <Button variant="quiet" size="sm" onClick={onUnlink}>
                {PROXY3D_COPY.unlinkButton}
              </Button>
            )}
          </div>
        )}
        <p className="muted proxy3dlab__intro">{PROXY3D_COPY.intro}</p>
        <p className="muted proxy3dlab__hint">{PROXY3D_COPY.dropHint}</p>

        <div className="proxy3dlab__sides">
          {renderSideCard('front')}
          {renderSideCard('back')}
        </div>

        {showAlignment && (
          <div className="proxy3dlab__align" data-testid="back-alignment">
            <div className="eyebrow">{PROXY3D_COPY.alignTitle}</div>
            <div className="muted proxy3dlab__tuninghint">
              {PROXY3D_COPY.alignHint}
            </div>
            <div className="proxy3dlab__aligngrid">
              <div>
                {renderSlider(
                  PROXY3D_COPY.alignScaleLabel,
                  backAlignment.scale,
                  BACK_ALIGNMENT_LIMITS.scale,
                  `${backAlignment.scale.toFixed(2)}×`,
                  (value) =>
                    dispatch({
                      type: 'SET_BACK_ALIGNMENT',
                      patch: { scale: value },
                    }),
                )}
                {renderSlider(
                  PROXY3D_COPY.alignOffsetXLabel,
                  backAlignment.offsetX,
                  BACK_ALIGNMENT_LIMITS.offsetX,
                  backAlignment.offsetX.toFixed(2),
                  (value) =>
                    dispatch({
                      type: 'SET_BACK_ALIGNMENT',
                      patch: { offsetX: value },
                    }),
                )}
                {renderSlider(
                  PROXY3D_COPY.alignOffsetYLabel,
                  backAlignment.offsetY,
                  BACK_ALIGNMENT_LIMITS.offsetY,
                  backAlignment.offsetY.toFixed(2),
                  (value) =>
                    dispatch({
                      type: 'SET_BACK_ALIGNMENT',
                      patch: { offsetY: value },
                    }),
                )}
                <Button
                  variant="quiet"
                  size="sm"
                  disabled={busy}
                  onClick={() => dispatch({ type: 'RESET_BACK_ALIGNMENT' })}
                >
                  {PROXY3D_COPY.alignResetButton}
                </Button>
              </div>
              {frontPreviewUrl && backPreviewUrl && (
                <div>
                  <div className="proxy3dlab__alignpreview">
                    <img
                      src={frontPreviewUrl}
                      alt=""
                      className="proxy3dlab__alignfront"
                    />
                    <img
                      src={backPreviewUrl}
                      alt=""
                      className="proxy3dlab__alignback"
                      style={{
                        left: `${50 + backAlignment.offsetX * 100}%`,
                        top: `${50 + backAlignment.offsetY * 100}%`,
                        transform: `translate(-50%, -50%) scale(${backAlignment.scale})`,
                      }}
                    />
                  </div>
                  <div className="muted proxy3dlab__choicenote">
                    {PROXY3D_COPY.alignPreviewNote}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {state.error && (
          <div className="proxy3dlab__error" role="alert">
            <Icon name="info" size={16} />
            <div>
              {state.status === 'failed' && (
                <b>{PROXY3D_COPY.errorTitle} — </b>
              )}
              {state.error}
              {state.status === 'failed' && state.errorIsConnectivity && (
                <div className="muted">{PROXY3D_COPY.backendHint}</div>
              )}
            </div>
          </div>
        )}

        {plan && (
          <div className="muted proxy3dlab__plannote">
            {plan === 'dual'
              ? PROXY3D_COPY.planDualNote
              : PROXY3D_COPY.planSingleNote}
          </div>
        )}

        <div className="row proxy3dlab__actions">
          <Button
            variant="primary"
            disabled={!plan || busy}
            onClick={handleSubmit}
          >
            <Icon name="cube" size={16} />
            {state.status === 'failed'
              ? PROXY3D_COPY.retryButton
              : state.status === 'ready'
                ? PROXY3D_COPY.regenerateButton
                : plan === 'dual'
                  ? PROXY3D_COPY.submitDualButton
                  : PROXY3D_COPY.submitButton}
          </Button>
          {(state.front.file || state.back.file || state.record) && (
            <Button variant="quiet" disabled={busy} onClick={handleReset}>
              {PROXY3D_COPY.resetButton}
            </Button>
          )}
        </div>

        {state.status === 'uploading' && (
          <div className="proxy3dlab__working">
            <Icon name="refresh" size={18} className="spin" />
            <div>
              <b>{PROXY3D_COPY.uploadingTitle}</b>
              <div className="muted">{PROXY3D_COPY.uploadingHint}</div>
            </div>
          </div>
        )}
      </Panel>

      {state.status === 'ready' && record && (
        <Panel
          title={PROXY3D_COPY.readyTitle}
          actions={
            <a
              className="btn btn--primary"
              href={record.result_url}
              download="result.glb"
            >
              <Icon name="upload" size={16} style={{ rotate: '180deg' }} />
              {PROXY3D_COPY.downloadButton}
            </a>
          }
        >
          <div className="proxy3dlab__verdict">{resultLabelFor(record)}</div>

          {linked && onSetPreview && (
            <div className="row proxy3dlab__attach">
              <Button
                variant="primary"
                size="sm"
                disabled={attached}
                onClick={handleAttach}
              >
                <Icon name="check" size={15} />
                {PROXY3D_COPY.attachButton}
              </Button>
              {attached && (
                <span className="muted">{PROXY3D_COPY.attachedNote}</span>
              )}
            </div>
          )}

          <dl className="proxy3dlab__meta">
            {linked && (
              <>
                <dt>{PROXY3D_COPY.linkedEyebrow}</dt>
                <dd>{linked.name}</dd>
              </>
            )}
            <dt>{PROXY3D_COPY.metaJobId}</dt>
            <dd>
              <code>{record.job_id}</code>
            </dd>
            <dt>{PROXY3D_COPY.metaSides}</dt>
            <dd>
              {record.sides === 'dual'
                ? PROXY3D_COPY.metaSidesDual
                : PROXY3D_COPY.metaSidesSingle}
            </dd>
            <dt>{PROXY3D_COPY.metaInput}</dt>
            <dd>
              {record.input.width}×{record.input.height}px
              {record.input.has_alpha ? ' · alpha channel' : ' · no alpha'}
            </dd>
            {record.back_input && (
              <>
                <dt>{PROXY3D_COPY.metaBackInput}</dt>
                <dd>
                  {record.back_input.width}×{record.back_input.height}px
                  {record.back_input.has_alpha
                    ? ' · alpha channel'
                    : ' · no alpha'}
                </dd>
              </>
            )}
            <dt>{PROXY3D_COPY.metaMethod}</dt>
            <dd>{PROXY3D_METHOD_LABEL[record.method]}</dd>
            <dt>{PROXY3D_COPY.metaAlphaMask}</dt>
            <dd>{record.alpha_mask_used ? 'Yes' : 'No'}</dd>
            {record.back_alpha_mask_used !== null &&
              record.back_alpha_mask_used !== undefined && (
                <>
                  <dt>{PROXY3D_COPY.metaBackAlphaMask}</dt>
                  <dd>{record.back_alpha_mask_used ? 'Yes' : 'No'}</dd>
                </>
              )}
            {record.back_alignment?.manual && (
              <>
                <dt>{PROXY3D_COPY.alignTitle}</dt>
                <dd>
                  {record.back_alignment.scale.toFixed(2)}× · x{' '}
                  {record.back_alignment.offset_x.toFixed(2)} · y{' '}
                  {record.back_alignment.offset_y.toFixed(2)}
                </dd>
              </>
            )}
            <dt>{PROXY3D_COPY.metaVertices}</dt>
            <dd>{record.mesh.vertices.toLocaleString()}</dd>
            <dt>{PROXY3D_COPY.metaFaces}</dt>
            <dd>{record.mesh.faces.toLocaleString()}</dd>
          </dl>

          <div className="proxy3dlab__limits">
            <span className="eyebrow">{PROXY3D_COPY.limitationsLabel}</span>
            <p>{record.limitations}</p>
          </div>

          {record.sides === 'dual' && (
            <p className="muted proxy3dlab__rotatehint">
              {PROXY3D_COPY.rotateHint}
            </p>
          )}

          <GlbViewer src={record.result_url} />
        </Panel>
      )}
    </div>
  )
}
