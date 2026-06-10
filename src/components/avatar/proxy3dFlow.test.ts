import { describe, expect, it } from 'vitest'
import { PROXY3D_FORBIDDEN_CLAIM_TERMS } from '../../test/honesty'
import {
  INITIAL_PROXY3D_STATE,
  PROXY3D_COPY,
  PROXY3D_METHOD_LABEL,
  formatBytes,
  proxy3dFlowReducer,
  type Proxy3dFlowState,
  type Proxy3dRecord,
} from './proxy3dFlow'

const FILE = { name: 'tee.png', sizeBytes: 2048, previewUrl: null }

const RECORD: Proxy3dRecord = {
  job_id: 'a'.repeat(32),
  status: 'done',
  method: 'extruded-alpha-contour',
  alpha_mask_used: true,
  input: { width: 240, height: 320, has_alpha: true },
  mesh: { vertices: 2552, faces: 5100 },
  result_url: `/api/proxy-3d/${'a'.repeat(32)}/result.glb`,
  limitations: 'Proxy 3D preview only. It is not real virtual try-on.',
  created_at: 1_750_000_000,
}

const freeze = (state: Proxy3dFlowState): Proxy3dFlowState =>
  Object.freeze({ ...state })

describe('proxy3dFlowReducer', () => {
  it('walks the happy path: idle → selected → uploading → ready', () => {
    let state = proxy3dFlowReducer(freeze(INITIAL_PROXY3D_STATE), {
      type: 'SELECT_FILE',
      file: FILE,
    })
    expect(state.status).toBe('selected')
    expect(state.file).toEqual(FILE)
    expect(state.error).toBeNull()

    state = proxy3dFlowReducer(freeze(state), { type: 'UPLOAD_START' })
    expect(state.status).toBe('uploading')

    state = proxy3dFlowReducer(freeze(state), {
      type: 'UPLOAD_SUCCESS',
      record: RECORD,
    })
    expect(state.status).toBe('ready')
    expect(state.record).toEqual(RECORD)
    expect(state.error).toBeNull()
  })

  it('records a failure and allows a retry from failed', () => {
    let state = proxy3dFlowReducer(INITIAL_PROXY3D_STATE, {
      type: 'SELECT_FILE',
      file: FILE,
    })
    state = proxy3dFlowReducer(state, { type: 'UPLOAD_START' })
    state = proxy3dFlowReducer(freeze(state), {
      type: 'UPLOAD_FAILURE',
      message: 'The backend rejected the request (HTTP 422).',
    })
    expect(state.status).toBe('failed')
    expect(state.error).toMatch(/422/)
    expect(state.file).toEqual(FILE)

    // Retry straight from failed.
    state = proxy3dFlowReducer(freeze(state), { type: 'UPLOAD_START' })
    expect(state.status).toBe('uploading')
    expect(state.error).toBeNull()
  })

  it('clears the selection and keeps the reason on REJECT_FILE', () => {
    const state = proxy3dFlowReducer(INITIAL_PROXY3D_STATE, {
      type: 'REJECT_FILE',
      reason: PROXY3D_COPY.rejectNotPng,
    })
    expect(state.status).toBe('idle')
    expect(state.file).toBeNull()
    expect(state.error).toBe(PROXY3D_COPY.rejectNotPng)
  })

  it('replacing the file from ready discards the previous record', () => {
    let state = proxy3dFlowReducer(INITIAL_PROXY3D_STATE, {
      type: 'SELECT_FILE',
      file: FILE,
    })
    state = proxy3dFlowReducer(state, { type: 'UPLOAD_START' })
    state = proxy3dFlowReducer(state, { type: 'UPLOAD_SUCCESS', record: RECORD })

    const next = { name: 'coat.png', sizeBytes: 4096, previewUrl: null }
    state = proxy3dFlowReducer(freeze(state), {
      type: 'SELECT_FILE',
      file: next,
    })
    expect(state.status).toBe('selected')
    expect(state.file).toEqual(next)
    expect(state.record).toBeNull()
  })

  it('ignores out-of-order actions', () => {
    // No upload without a selection.
    expect(
      proxy3dFlowReducer(INITIAL_PROXY3D_STATE, { type: 'UPLOAD_START' }),
    ).toEqual(INITIAL_PROXY3D_STATE)

    // Success/failure only land while uploading.
    const selected = proxy3dFlowReducer(INITIAL_PROXY3D_STATE, {
      type: 'SELECT_FILE',
      file: FILE,
    })
    expect(
      proxy3dFlowReducer(selected, { type: 'UPLOAD_SUCCESS', record: RECORD })
        .status,
    ).toBe('selected')
    expect(
      proxy3dFlowReducer(selected, { type: 'UPLOAD_FAILURE', message: 'x' })
        .status,
    ).toBe('selected')

    // Selections cannot change mid-upload.
    const uploading = proxy3dFlowReducer(selected, { type: 'UPLOAD_START' })
    expect(
      proxy3dFlowReducer(uploading, { type: 'SELECT_FILE', file: FILE }),
    ).toBe(uploading)
    expect(
      proxy3dFlowReducer(uploading, { type: 'REJECT_FILE', reason: 'x' }),
    ).toBe(uploading)
  })

  it('RESET returns to the initial state from anywhere', () => {
    let state = proxy3dFlowReducer(INITIAL_PROXY3D_STATE, {
      type: 'SELECT_FILE',
      file: FILE,
    })
    state = proxy3dFlowReducer(state, { type: 'UPLOAD_START' })
    state = proxy3dFlowReducer(state, { type: 'UPLOAD_SUCCESS', record: RECORD })
    expect(proxy3dFlowReducer(state, { type: 'RESET' })).toEqual(
      INITIAL_PROXY3D_STATE,
    )
  })
})

describe('PROXY3D_COPY honesty', () => {
  it('never makes forbidden capability claims', () => {
    for (const [key, value] of Object.entries(PROXY3D_COPY)) {
      expect(value, `PROXY3D_COPY.${key}`).not.toMatch(
        PROXY3D_FORBIDDEN_CLAIM_TERMS,
      )
    }
    for (const [key, value] of Object.entries(PROXY3D_METHOD_LABEL)) {
      expect(value, `PROXY3D_METHOD_LABEL.${key}`).not.toMatch(
        PROXY3D_FORBIDDEN_CLAIM_TERMS,
      )
    }
  })

  it('describes the artifact as a proxy preview', () => {
    expect(PROXY3D_COPY.panelTitle).toMatch(/proxy/i)
    expect(PROXY3D_COPY.intro).toMatch(/proxy 3D preview/i)
    expect(PROXY3D_COPY.viewerCaption).toMatch(/experimental/i)
  })
})

describe('formatBytes', () => {
  it('formats bytes, kilobytes and megabytes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})
