import { describe, expect, it } from 'vitest'
import { PROXY3D_FORBIDDEN_CLAIM_TERMS } from '../../test/honesty'
import {
  INITIAL_PROXY3D_STATE,
  PROXY3D_COPY,
  PROXY3D_METHOD_LABEL,
  PROXY3D_RESULT_LABEL,
  formatBytes,
  plannedGeneration,
  proxy3dFlowReducer,
  sideReadiness,
  type Proxy3dFlowAction,
  type Proxy3dFlowState,
  type Proxy3dRecord,
} from './proxy3dFlow'

const FRONT = { name: 'tee.png', sizeBytes: 2048, previewUrl: null }
const BACK = { name: 'tee-back.png', sizeBytes: 1024, previewUrl: null }
const CUTOUT = { previewUrl: 'data:image/png;base64,AA==', sizeBytes: 1234 }

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
  sides: 'single',
  back_input: null,
  back_alpha_mask_used: null,
}

const freeze = (state: Proxy3dFlowState): Proxy3dFlowState =>
  Object.freeze({ ...state })

const run = (
  actions: Proxy3dFlowAction[],
  start: Proxy3dFlowState = INITIAL_PROXY3D_STATE,
): Proxy3dFlowState =>
  actions.reduce((s, a) => proxy3dFlowReducer(freeze(s), a), start)

describe('proxy3dFlowReducer — per-side selection (B3.7)', () => {
  it('walks the single-sided happy path: front → uploading → ready', () => {
    let state = run([
      { type: 'SELECT_FILE', side: 'front', file: FRONT, alpha: 'usable' },
    ])
    expect(state.front.file).toEqual(FRONT)
    expect(state.back.file).toBeNull()
    expect(plannedGeneration(state)).toBe('single')

    state = run([{ type: 'UPLOAD_START' }], state)
    expect(state.status).toBe('uploading')
    state = run([{ type: 'UPLOAD_SUCCESS', record: RECORD }], state)
    expect(state.status).toBe('ready')
    expect(state.record).toEqual(RECORD)
  })

  it('plans dual generation when both sides are resolved', () => {
    const state = run([
      { type: 'SELECT_FILE', side: 'front', file: FRONT, alpha: 'usable' },
      { type: 'SELECT_FILE', side: 'back', file: BACK, alpha: 'usable' },
    ])
    expect(plannedGeneration(state)).toBe('dual')
  })

  it('requires the front: back alone cannot generate', () => {
    const state = run([
      { type: 'SELECT_FILE', side: 'back', file: BACK, alpha: 'usable' },
    ])
    expect(plannedGeneration(state)).toBeNull()
    expect(proxy3dFlowReducer(state, { type: 'UPLOAD_START' }).status).toBe(
      'editing',
    )
  })

  it('REMOVE_SIDE clears one side and downgrades the plan', () => {
    let state = run([
      { type: 'SELECT_FILE', side: 'front', file: FRONT, alpha: 'usable' },
      { type: 'SELECT_FILE', side: 'back', file: BACK, alpha: 'usable' },
    ])
    state = run([{ type: 'REMOVE_SIDE', side: 'back' }], state)
    expect(state.back.file).toBeNull()
    expect(plannedGeneration(state)).toBe('single')
  })

  it('a no-alpha side blocks generation until its explicit choice', () => {
    const frontPending = run([
      { type: 'SELECT_FILE', side: 'front', file: FRONT, alpha: 'none' },
    ])
    expect(sideReadiness(frontPending.front)).toBe('pending-choice')
    expect(plannedGeneration(frontPending)).toBeNull()

    const backPending = run([
      { type: 'SELECT_FILE', side: 'front', file: FRONT, alpha: 'usable' },
      { type: 'SELECT_FILE', side: 'back', file: BACK, alpha: 'none' },
    ])
    expect(plannedGeneration(backPending)).toBeNull()
  })

  it('UPLOAD_START is still allowed from a pending front (the explicit flat card)', () => {
    const state = run([
      { type: 'SELECT_FILE', side: 'front', file: FRONT, alpha: 'none' },
    ])
    expect(proxy3dFlowReducer(state, { type: 'UPLOAD_START' }).status).toBe(
      'uploading',
    )
  })
})

describe('proxy3dFlowReducer — per-side cutout (B3.6/B3.7)', () => {
  const frontPending = () =>
    run([{ type: 'SELECT_FILE', side: 'front', file: FRONT, alpha: 'none' }])

  it('walks the cutout path on the front side', () => {
    let state = run([{ type: 'CUTOUT_START', side: 'front' }], frontPending())
    expect(state.front.cutting).toBe(true)
    expect(plannedGeneration(state)).toBeNull()

    state = run(
      [{ type: 'CUTOUT_SUCCESS', side: 'front', cutout: CUTOUT }],
      state,
    )
    expect(state.front.cutout).toEqual(CUTOUT)
    expect(sideReadiness(state.front)).toBe('ready-cutout')
    expect(plannedGeneration(state)).toBe('single')
  })

  it('walks the cutout path on the back side independently', () => {
    let state = run([
      { type: 'SELECT_FILE', side: 'front', file: FRONT, alpha: 'usable' },
      { type: 'SELECT_FILE', side: 'back', file: BACK, alpha: 'none' },
      { type: 'CUTOUT_START', side: 'back' },
    ])
    expect(state.back.cutting).toBe(true)
    expect(state.front.cutting).toBe(false)

    state = run(
      [{ type: 'CUTOUT_SUCCESS', side: 'back', cutout: CUTOUT }],
      state,
    )
    expect(state.back.cutout).toEqual(CUTOUT)
    expect(plannedGeneration(state)).toBe('dual')
  })

  it('a cutout failure keeps the explicit choices with the reason', () => {
    let state = run([{ type: 'CUTOUT_START', side: 'front' }], frontPending())
    state = run(
      [{ type: 'CUTOUT_FAILURE', side: 'front', reason: 'busy background' }],
      state,
    )
    expect(state.front.cutting).toBe(false)
    expect(state.front.cutoutError).toBe('busy background')
    expect(sideReadiness(state.front)).toBe('pending-choice')
  })

  it('USE_BACK_AS_IS resolves a pending back without a cutout', () => {
    let state = run([
      { type: 'SELECT_FILE', side: 'front', file: FRONT, alpha: 'usable' },
      { type: 'SELECT_FILE', side: 'back', file: BACK, alpha: 'none' },
    ])
    state = run([{ type: 'USE_BACK_AS_IS' }], state)
    expect(sideReadiness(state.back)).toBe('ready-as-is')
    expect(plannedGeneration(state)).toBe('dual')
  })

  it('guards cutout actions against out-of-order use', () => {
    // No cutout on a usable side.
    const usable = run([
      { type: 'SELECT_FILE', side: 'front', file: FRONT, alpha: 'usable' },
    ])
    expect(
      proxy3dFlowReducer(usable, { type: 'CUTOUT_START', side: 'front' })
        .front.cutting,
    ).toBe(false)
    // Success/failure only land while cutting.
    expect(
      proxy3dFlowReducer(frontPending(), {
        type: 'CUTOUT_SUCCESS',
        side: 'front',
        cutout: CUTOUT,
      }).front.cutout,
    ).toBeNull()
    // Selection cannot change mid-cutout.
    const cutting = run(
      [{ type: 'CUTOUT_START', side: 'front' }],
      frontPending(),
    )
    expect(
      proxy3dFlowReducer(cutting, {
        type: 'SELECT_FILE',
        side: 'back',
        file: BACK,
        alpha: 'usable',
      }),
    ).toBe(cutting)
    // USE_BACK_AS_IS needs a pending no-alpha back.
    expect(
      proxy3dFlowReducer(usable, { type: 'USE_BACK_AS_IS' }).back.useAsIs,
    ).toBe(false)
  })

  it('replacing a side clears its previous cutout and as-is choice', () => {
    const state = run([
      { type: 'SELECT_FILE', side: 'front', file: FRONT, alpha: 'usable' },
      { type: 'SELECT_FILE', side: 'back', file: BACK, alpha: 'none' },
      { type: 'USE_BACK_AS_IS' },
      {
        type: 'SELECT_FILE',
        side: 'back',
        file: { name: 'other.png', sizeBytes: 99, previewUrl: null },
        alpha: 'usable',
      },
    ])
    expect(state.back.useAsIs).toBe(false)
    expect(state.back.cutout).toBeNull()
    expect(sideReadiness(state.back)).toBe('ready-original')
  })
})

describe('proxy3dFlowReducer — failures & reset', () => {
  it('records a failure, keeps both sides, and allows retry', () => {
    let state = run([
      { type: 'SELECT_FILE', side: 'front', file: FRONT, alpha: 'usable' },
      { type: 'SELECT_FILE', side: 'back', file: BACK, alpha: 'usable' },
      { type: 'UPLOAD_START' },
      { type: 'UPLOAD_FAILURE', message: 'HTTP 422', connectivity: false },
    ])
    expect(state.status).toBe('failed')
    expect(state.front.file).toEqual(FRONT)
    expect(state.back.file).toEqual(BACK)
    expect(state.errorIsConnectivity).toBe(false)

    state = run([{ type: 'UPLOAD_START' }], state)
    expect(state.status).toBe('uploading')
    expect(state.error).toBeNull()
  })

  it('flags connectivity failures so the UI can hint about the backend', () => {
    const state = run([
      { type: 'SELECT_FILE', side: 'front', file: FRONT, alpha: 'usable' },
      { type: 'UPLOAD_START' },
      {
        type: 'UPLOAD_FAILURE',
        message: 'Could not reach the local proxy-3D backend.',
        connectivity: true,
      },
    ])
    expect(state.errorIsConnectivity).toBe(true)
  })

  it('keeps the reason on REJECT_FILE without touching the sides', () => {
    const state = run([
      { type: 'SELECT_FILE', side: 'front', file: FRONT, alpha: 'usable' },
      { type: 'REJECT_FILE', reason: PROXY3D_COPY.rejectNotPng },
    ])
    expect(state.error).toBe(PROXY3D_COPY.rejectNotPng)
    expect(state.front.file).toEqual(FRONT)
  })

  it('RESET returns to the initial state from anywhere', () => {
    const state = run([
      { type: 'SELECT_FILE', side: 'front', file: FRONT, alpha: 'usable' },
      { type: 'SELECT_FILE', side: 'back', file: BACK, alpha: 'usable' },
      { type: 'UPLOAD_START' },
      { type: 'UPLOAD_SUCCESS', record: RECORD },
    ])
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
    for (const [key, value] of Object.entries(PROXY3D_RESULT_LABEL)) {
      expect(value, `PROXY3D_RESULT_LABEL.${key}`).not.toMatch(
        PROXY3D_FORBIDDEN_CLAIM_TERMS,
      )
    }
  })

  it('labels every mode as a proxy/fallback, never more', () => {
    expect(PROXY3D_RESULT_LABEL['extruded-alpha-contour']).toMatch(
      /Single-sided silhouette proxy/,
    )
    expect(PROXY3D_RESULT_LABEL['extruded-alpha-contour-dual']).toMatch(
      /Dual-sided silhouette proxy/,
    )
    expect(PROXY3D_RESULT_LABEL['textured-plane']).toMatch(
      /Flat image card fallback/,
    )
  })
})

describe('formatBytes', () => {
  it('formats bytes, kilobytes and megabytes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})
