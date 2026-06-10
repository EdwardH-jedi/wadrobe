// Stable id generator. Uses crypto.randomUUID when available, with a
// non-cryptographic fallback that is good enough for local archive ids.
export function createId(prefix = 'g'): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') {
    return `${prefix}_${c.randomUUID()}`
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}
