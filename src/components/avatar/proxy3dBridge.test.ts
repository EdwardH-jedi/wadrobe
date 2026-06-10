import { describe, expect, it } from 'vitest'
import { PROXY3D_FORBIDDEN_CLAIM_TERMS } from '../../test/honesty'
import {
  PROXY3D_MODE_LABEL,
  modeFromMethod,
  previewFromRecord,
} from './proxy3dBridge'
import type { Proxy3dRecord } from './proxy3dFlow'

const RECORD: Proxy3dRecord = {
  job_id: 'd'.repeat(32),
  status: 'done',
  method: 'extruded-alpha-contour-dual',
  alpha_mask_used: true,
  input: { width: 240, height: 320, has_alpha: true },
  mesh: { vertices: 5104, faces: 5100 },
  result_url: `/api/proxy-3d/${'d'.repeat(32)}/result.glb`,
  limitations: 'Proxy 3D preview only.',
  created_at: 1_750_000_000,
  sides: 'dual',
  back_input: { width: 100, height: 140, has_alpha: true },
  back_alpha_mask_used: true,
}

describe('proxy3dBridge', () => {
  it('maps backend methods to honest modes', () => {
    expect(modeFromMethod('extruded-alpha-contour')).toBe('single-sided')
    expect(modeFromMethod('extruded-alpha-contour-dual')).toBe('dual-sided')
    expect(modeFromMethod('textured-plane')).toBe('flat-card')
  })

  it('builds serializable garment-link metadata from a record', () => {
    const preview = previewFromRecord(RECORD, 1_750_000_123_000)
    expect(preview).toEqual({
      jobId: RECORD.job_id,
      generatedAt: 1_750_000_123_000,
      mode: 'dual-sided',
      method: 'extruded-alpha-contour-dual',
      frontAlphaMaskUsed: true,
      backAlphaMaskUsed: true,
      vertexCount: 5104,
      faceCount: 5100,
      limitations: RECORD.limitations,
    })
    // Round-trip JSON-serializable.
    expect(JSON.parse(JSON.stringify(preview))).toEqual(preview)
  })

  it('mode labels stay honest', () => {
    for (const [key, value] of Object.entries(PROXY3D_MODE_LABEL)) {
      expect(value, `PROXY3D_MODE_LABEL.${key}`).not.toMatch(
        PROXY3D_FORBIDDEN_CLAIM_TERMS,
      )
    }
  })
})
