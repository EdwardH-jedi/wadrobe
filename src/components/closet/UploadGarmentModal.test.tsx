import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ArchiveProvider } from '../../app/providers/ArchiveProvider'
import { UploadGarmentModal } from './UploadGarmentModal'
import { STORAGE_KEYS } from '../../lib/storage/storageTypes'
import {
  __setAssetBlobStoreForTests,
  createMemoryBlobStore,
} from '../../lib/storage/assetBlobStore'

// Modal-level failure-recovery coverage (Phase 10 hardening). The real upload
// pipeline needs canvas (absent in jsdom), so we mock the two canvas-bound seams
// — `processImageFile` (to reach the crop/cutout steps) and `attemptGarmentCutout`
// (to drive a thrown / failed cutout) — and prove the modal NEVER strands in the
// "working" state and the user can still archive.
const { attemptGarmentCutoutMock } = vi.hoisted(() => ({
  attemptGarmentCutoutMock: vi.fn(),
}))

vi.mock('./../../lib/image/garmentCutout', () => ({
  attemptGarmentCutout: attemptGarmentCutoutMock,
}))

vi.mock('./../../lib/image/imageFileUtils', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/image/imageFileUtils')>()
  return {
    ...actual,
    // Skip the real canvas read/downscale; hand back a usable thumbnail.
    processImageFile: vi.fn(async () => ({
      dataUrl: 'data:image/png;base64,AAA',
      dominantColorHex: '#223344',
    })),
  }
})

const WAIT = { timeout: 4000 }

function renderModal() {
  return render(
    <ArchiveProvider>
      <UploadGarmentModal open onClose={() => {}} onArchived={() => {}} />
    </ArchiveProvider>,
  )
}

async function uploadToCutoutStep(user: ReturnType<typeof userEvent.setup>) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File(['bytes'], 'piece.png', { type: 'image/png' })
  fireEvent.change(input, { target: { files: [file] } })
  // Crop step appears after the demo scan beat...
  await screen.findByText('Crop the garment area', {}, WAIT)
  // ...skip the crop (identity → "Continue")...
  await user.click(screen.getByRole('button', { name: /^Continue$/ }))
  // ...and land on the cutout step.
  await screen.findByText('Local background removal', {}, WAIT)
}

describe('UploadGarmentModal — cutout failure recovery', () => {
  beforeEach(() => {
    localStorage.clear()
    attemptGarmentCutoutMock.mockReset()
  })

  it('recovers from a THROWN cutout and still archives (name gate intact)', async () => {
    // The contract says attemptGarmentCutout never throws; this proves that even
    // if it did, the modal does not get stuck "working".
    attemptGarmentCutoutMock.mockRejectedValue(new Error('boom'))
    const user = userEvent.setup()
    renderModal()
    await screen.findByText('Drop a clothing photo')
    await uploadToCutoutStep(user)

    await user.click(screen.getByRole('button', { name: /Prepare cutout/ }))

    // Recovered: a failed message shows, and the "working" indicator is gone
    // (reaching this assertion at all proves it left the working state).
    await screen.findByText(/could not be prepared/i, {}, WAIT)
    expect(screen.queryByText('Removing background locally…')).toBeNull()

    // Non-blocking: continue without a cutout → metadata review.
    await user.click(
      screen.getByRole('button', { name: /Continue without cutout/ }),
    )
    await screen.findByText('Draft metadata suggestion', {}, WAIT)

    // Required-name validation still gates "Continue".
    expect(
      screen.getByText('Name this archive piece before confirming.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Continue$/ })).toBeDisabled()

    await user.type(screen.getByLabelText(/^Name$/), 'Recovered Piece')
    const cont = screen.getByRole('button', { name: /^Continue$/ })
    expect(cont).toBeEnabled()
    await user.click(cont)

    // Reference step → confirm → the piece archives (flow proceeds end-to-end).
    await screen.findByText('Attach product context', {}, WAIT)
    await user.click(
      screen.getByRole('button', { name: /Confirm Archive Piece/ }),
    )
    await screen.findByText('Archive Piece created', {}, WAIT)
  })

  it('a reset (Discard) clears stale failed cutout state on the next upload', async () => {
    // First upload: a returned `unavailable` result (the non-throw failure path).
    attemptGarmentCutoutMock.mockResolvedValue({
      status: 'unavailable',
      reason: 'Background removal was unavailable for this image.',
    })
    const user = userEvent.setup()
    renderModal()
    await screen.findByText('Drop a clothing photo')
    await uploadToCutoutStep(user)
    await user.click(screen.getByRole('button', { name: /Prepare cutout/ }))
    await screen.findByText(/was unavailable/i, {}, WAIT)

    // Discard returns to the dropzone.
    await user.click(screen.getByRole('button', { name: /Discard/ }))
    await screen.findByText('Drop a clothing photo')

    // Second upload reaches a FRESH cutout step — no stale failure carried over.
    await uploadToCutoutStep(user)
    expect(screen.queryByText(/was unavailable/i)).toBeNull()
    expect(
      screen.getByRole('button', { name: /Prepare cutout/ }),
    ).toBeInTheDocument()
  })
})

describe('UploadGarmentModal — blob-backed upload (Phase 11)', () => {
  const CUTOUT_DATA = 'data:image/webp;base64,Q1VUT1VU' // "CUTOUT"

  beforeEach(() => {
    localStorage.clear()
    attemptGarmentCutoutMock.mockReset()
    // A durable blob store stand-in so the upload blob-backs the accepted cutout.
    __setAssetBlobStoreForTests(createMemoryBlobStore(true))
  })
  afterEach(() => {
    __setAssetBlobStoreForTests(null)
  })

  it('accepting a cutout stores it as a blob ref, not a heavy data URL', async () => {
    attemptGarmentCutoutMock.mockResolvedValue({
      status: 'success',
      cutoutImageUrl: CUTOUT_DATA,
      source: 'local-flood-fill',
      warnings: [],
    })
    const user = userEvent.setup()
    renderModal()
    await screen.findByText('Drop a clothing photo')
    await uploadToCutoutStep(user)

    await user.click(screen.getByRole('button', { name: /Prepare cutout/ }))
    await user.click(await screen.findByRole('button', { name: /Use cutout/ }, WAIT))
    await screen.findByText('Draft metadata suggestion', {}, WAIT)
    await user.type(screen.getByLabelText(/^Name$/), 'Blobbed Cutout')
    await user.click(screen.getByRole('button', { name: /^Continue$/ }))
    await screen.findByText('Attach product context', {}, WAIT)
    await user.click(
      screen.getByRole('button', { name: /Confirm Archive Piece/ }),
    )
    await screen.findByText('Archive Piece created', {}, WAIT)

    // The persisted metadata is blob-backed: a ref is stored, the heavy cutout
    // data URL is NOT in the metadata.
    await waitFor(() =>
      expect(localStorage.getItem(STORAGE_KEYS.garments)).toContain(
        'indexeddb-blob',
      ),
    )
    const raw = localStorage.getItem(STORAGE_KEYS.garments)!
    expect(raw).toContain('"assetMode":"cutout"')
    expect(raw).not.toContain('Q1VUT1VU') // the cutout bytes live in the blob store
  })
})
