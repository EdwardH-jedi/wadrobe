import { describe, expect, it } from 'vitest'
import { isExperimental3dEnabled } from './featureFlags'

describe('isExperimental3dEnabled', () => {
  it('is off by default (unset env)', () => {
    expect(isExperimental3dEnabled({})).toBe(false)
  })

  it('is off for a blank or non-truthy value', () => {
    for (const raw of ['', '   ', '0', 'false', 'off', 'no', 'maybe']) {
      expect(isExperimental3dEnabled({ VITE_ENABLE_EXPERIMENTAL_3D: raw })).toBe(
        false,
      )
    }
  })

  it('is on for the accepted truthy spellings, case- and space-insensitively', () => {
    for (const raw of ['1', 'true', 'TRUE', ' on ', 'Yes']) {
      expect(isExperimental3dEnabled({ VITE_ENABLE_EXPERIMENTAL_3D: raw })).toBe(
        true,
      )
    }
  })
})
