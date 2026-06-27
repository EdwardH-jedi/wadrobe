import { afterEach, describe, expect, it } from 'vitest'
import { hasVisionConsent, grantVisionConsent } from './visionConsent'

afterEach(() => {
  try {
    sessionStorage.clear()
  } catch {
    /* no storage */
  }
})

describe('visionConsent', () => {
  it('is false before granting', () => {
    expect(hasVisionConsent()).toBe(false)
  })

  it('is true after granting, within the session', () => {
    grantVisionConsent()
    expect(hasVisionConsent()).toBe(true)
  })
})
