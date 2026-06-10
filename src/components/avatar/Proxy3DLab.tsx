// Proxy 3D Lab view (Track B3 → B3.7): upload a front PNG (required) and an
// optional back PNG, run the per-side cutout-first flow (B3.6) on whichever
// side lacks transparency, and generate a single- or dual-sided proxy 3D
// preview. The flat image card stays an explicit front-side fallback, never
// a silent default. Entirely additive — no Track A state is touched.
import { useEffect, useReducer, useRef, type ChangeEvent } from 'react'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { Panel } from '../ui/Panel'
import { GlbViewer } from './GlbViewer'
import { Proxy3dApiError, createProxy3d } from './proxy3dApi'
import { detectUsableAlpha, runProxyCutout } from './proxy3dCutout'
import {
  INITIAL_PROXY3D_STATE,
  MAX_PROXY3D_UPLOAD_BYTES,
  PROXY3D_COPY,
  PROXY3D_METHOD_LABEL,
  PROXY3D_RESULT_LABEL,
  formatBytes,
  plannedGeneration,
  proxy3dFlowReducer,
  sideReadiness,
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

export function Proxy3DLab() {
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

  const handleCutout = async (side: Proxy3dSide) => {
    const file = filesRef.current[side]
    if (!file || busy) return
    dispatch({ type: 'CUTOUT_START', side })
    const outcome = await runProxyCutout(file)
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
      cutoutBlobsRef.current[side] = null
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
    dispatch({ type: 'UPLOAD_START' })
    try {
      const record = await createProxy3d(payload.front, payload.frontName, {
        back: payload.back,
        backName: payload.backName,
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

  const handleReset = () => {
    if (busy) return
    clearSideRefs('front')
    clearSideRefs('back')
    selectSeqRef.current.front++
    selectSeqRef.current.back++
    dispatch({ type: 'RESET' })
  }

  const plan = plannedGeneration(state)
  const { record } = state

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
      </div>
    )
  }

  return (
    <div className="stack-lg proxy3dlab">
      <Panel title={PROXY3D_COPY.panelTitle}>
        <p className="muted proxy3dlab__intro">{PROXY3D_COPY.intro}</p>
        <p className="muted proxy3dlab__hint">{PROXY3D_COPY.dropHint}</p>

        <div className="proxy3dlab__sides">
          {renderSideCard('front')}
          {renderSideCard('back')}
        </div>

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

        <div className="row proxy3dlab__actions">
          <Button
            variant="primary"
            disabled={!plan || busy}
            onClick={handleSubmit}
          >
            <Icon name="cube" size={16} />
            {state.status === 'failed'
              ? PROXY3D_COPY.retryButton
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
          <div className="proxy3dlab__verdict">
            {PROXY3D_RESULT_LABEL[record.method]}
          </div>

          <dl className="proxy3dlab__meta">
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
