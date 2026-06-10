// Proxy 3D Lab view (Track B3): upload a PNG, send it to the local backend
// (/api/proxy-3d), show the honest generation report, download the GLB, and
// preview it in a lazily-loaded three.js viewer. Entirely additive — no
// Track A state is touched; the view talks only to the Track B backend.
import { useEffect, useReducer, useRef, type ChangeEvent } from 'react'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { Panel } from '../ui/Panel'
import { GlbViewer } from './GlbViewer'
import { createProxy3d } from './proxy3dApi'
import {
  INITIAL_PROXY3D_STATE,
  MAX_PROXY3D_UPLOAD_BYTES,
  PROXY3D_COPY,
  PROXY3D_METHOD_LABEL,
  formatBytes,
  proxy3dFlowReducer,
} from './proxy3dFlow'

function isPngFile(file: File): boolean {
  return file.type === 'image/png' || /\.png$/i.test(file.name)
}

export function Proxy3DLab() {
  const [state, dispatch] = useReducer(
    proxy3dFlowReducer,
    INITIAL_PROXY3D_STATE,
  )
  const fileRef = useRef<File | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const revokePreview = () => {
    if (previewUrlRef.current) {
      // Guarded like createObjectURL below — jsdom implements neither.
      if (typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(previewUrlRef.current)
      }
      previewUrlRef.current = null
    }
  }
  // Revoke the thumbnail object URL when the view unmounts.
  useEffect(() => revokePreview, [])

  const handleFile = (file: File | null | undefined) => {
    if (!file || state.status === 'uploading') return
    if (!isPngFile(file)) {
      revokePreview()
      fileRef.current = null
      dispatch({ type: 'REJECT_FILE', reason: PROXY3D_COPY.rejectNotPng })
      return
    }
    if (file.size > MAX_PROXY3D_UPLOAD_BYTES) {
      revokePreview()
      fileRef.current = null
      dispatch({ type: 'REJECT_FILE', reason: PROXY3D_COPY.rejectTooLarge })
      return
    }
    revokePreview()
    // jsdom has no createObjectURL — the thumbnail is optional there.
    const previewUrl =
      typeof URL.createObjectURL === 'function'
        ? URL.createObjectURL(file)
        : null
    previewUrlRef.current = previewUrl
    fileRef.current = file
    dispatch({
      type: 'SELECT_FILE',
      file: { name: file.name, sizeBytes: file.size, previewUrl },
    })
  }

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFile(event.target.files?.[0])
    // Allow re-selecting the same file after a reset.
    event.target.value = ''
  }

  const handleSubmit = async () => {
    const file = fileRef.current
    if (!file || state.status === 'uploading') return
    dispatch({ type: 'UPLOAD_START' })
    try {
      const record = await createProxy3d(file, file.name)
      dispatch({ type: 'UPLOAD_SUCCESS', record })
    } catch (error) {
      dispatch({
        type: 'UPLOAD_FAILURE',
        message:
          error instanceof Error ? error.message : 'The upload failed.',
      })
    }
  }

  const handleReset = () => {
    if (state.status === 'uploading') return
    revokePreview()
    fileRef.current = null
    dispatch({ type: 'RESET' })
  }

  const canSubmit =
    (state.status === 'selected' || state.status === 'failed') &&
    fileRef.current !== null

  const { file, record } = state

  return (
    <div className="stack-lg proxy3dlab">
      <Panel title={PROXY3D_COPY.panelTitle}>
        <p className="muted proxy3dlab__intro">{PROXY3D_COPY.intro}</p>

        <div className="proxy3dlab__pick">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,.png"
            onChange={handleInputChange}
            hidden
          />
          <Button
            variant="ghost"
            disabled={state.status === 'uploading'}
            onClick={() => inputRef.current?.click()}
          >
            <Icon name="image" size={16} />
            {file ? PROXY3D_COPY.replaceButton : PROXY3D_COPY.selectButton}
          </Button>
          <span className="muted proxy3dlab__hint">
            {PROXY3D_COPY.dropHint}
          </span>
        </div>

        {file && (
          <div className="proxy3dlab__file">
            {file.previewUrl && (
              <img
                src={file.previewUrl}
                alt=""
                className="proxy3dlab__thumb"
              />
            )}
            <div>
              <div className="proxy3dlab__filename">{file.name}</div>
              <div className="muted">{formatBytes(file.sizeBytes)}</div>
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
              {state.status === 'failed' && (
                <div className="muted">{PROXY3D_COPY.backendHint}</div>
              )}
            </div>
          </div>
        )}

        <div className="row proxy3dlab__actions">
          <Button
            variant="primary"
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
          >
            <Icon name="cube" size={16} />
            {state.status === 'failed'
              ? PROXY3D_COPY.retryButton
              : PROXY3D_COPY.submitButton}
          </Button>
          {state.status !== 'idle' && (
            <Button
              variant="quiet"
              disabled={state.status === 'uploading'}
              onClick={handleReset}
            >
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
          <dl className="proxy3dlab__meta">
            <dt>{PROXY3D_COPY.metaJobId}</dt>
            <dd>
              <code>{record.job_id}</code>
            </dd>
            <dt>{PROXY3D_COPY.metaInput}</dt>
            <dd>
              {record.input.width}×{record.input.height}px
              {record.input.has_alpha ? ' · alpha channel' : ' · no alpha'}
            </dd>
            <dt>{PROXY3D_COPY.metaMethod}</dt>
            <dd>{PROXY3D_METHOD_LABEL[record.method]}</dd>
            <dt>{PROXY3D_COPY.metaAlphaMask}</dt>
            <dd>{record.alpha_mask_used ? 'Yes' : 'No'}</dd>
            <dt>{PROXY3D_COPY.metaVertices}</dt>
            <dd>{record.mesh.vertices.toLocaleString()}</dd>
            <dt>{PROXY3D_COPY.metaFaces}</dt>
            <dd>{record.mesh.faces.toLocaleString()}</dd>
          </dl>

          <div className="proxy3dlab__limits">
            <span className="eyebrow">{PROXY3D_COPY.limitationsLabel}</span>
            <p>{record.limitations}</p>
          </div>

          <GlbViewer src={record.result_url} />
        </Panel>
      )}
    </div>
  )
}
