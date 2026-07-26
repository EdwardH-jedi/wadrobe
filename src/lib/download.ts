// Hand a locally-built Blob to the browser's download. No network, no upload —
// the bytes never leave the machine.
/**
 * Trigger a file download. Returns false when the environment cannot mint object
 * URLs (jsdom in unit tests), so callers can report a failure instead of
 * pretending the file was saved.
 */
export function downloadBlob(blob: Blob, fileName: string): boolean {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return false
  }
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    // Revoked on the next tick so the click has already claimed the blob.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
  return true
}
