// Session-scoped consent for sending a photo to the vision server. Stored in
// sessionStorage so it resets when the tab closes — an honest "this session
// only" gate, not a permanent opt-in. No storage (jsdom / private mode) → the
// gate re-shows; we never assume consent we cannot read.
const CONSENT_KEY = 'archive:vision-consent'

export function hasVisionConsent(): boolean {
  try {
    return sessionStorage.getItem(CONSENT_KEY) === 'granted'
  } catch {
    return false
  }
}

export function grantVisionConsent(): void {
  try {
    sessionStorage.setItem(CONSENT_KEY, 'granted')
  } catch {
    // Storage unavailable — consent just won't persist; the gate re-shows.
  }
}
