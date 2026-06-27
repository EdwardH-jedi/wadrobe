// Candidate selection flow lock (Wardrobe Flow C2). Candidates now come through
// the C1 provider seam (mock by default). This proves the seam feeds the EXISTING
// reference step and that picking a demo candidate prefills the same slot as a
// manual URL, then flows through approval → archive unchanged — and that the
// manual URL fallback stays available the whole time.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ArchiveProvider } from '../../app/providers/ArchiveProvider'
import { UploadGarmentModal } from './UploadGarmentModal'
import { STORAGE_KEYS } from '../../lib/storage/storageTypes'

vi.mock('./../../lib/image/imageFileUtils', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/image/imageFileUtils')>()
  return {
    ...actual,
    processImageFile: vi.fn(async () => ({
      dataUrl: 'data:image/png;base64,AAA',
      dominantColorHex: '#223344',
    })),
  }
})

vi.mock('./../../lib/image/garmentCutout', () => ({
  attemptGarmentCutout: vi.fn(async () => ({
    status: 'unavailable',
    reason: 'Background removal was unavailable for this image.',
  })),
}))

const WAIT = { timeout: 4000 }

function renderModal() {
  return render(
    <ArchiveProvider>
      <UploadGarmentModal open onClose={() => {}} onArchived={() => {}} />
    </ArchiveProvider>,
  )
}

describe('wardrobe candidate selection flow (C2)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('picks a seam-provided demo candidate, prefills, and archives', async () => {
    const user = userEvent.setup()
    renderModal()

    await screen.findByText('Drop a clothing photo')
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    fireEvent.change(input, {
      target: { files: [new File(['bytes'], 'wool-coat.png', { type: 'image/png' })] },
    })
    await screen.findByText('Crop the garment area', {}, WAIT)
    await user.click(screen.getByRole('button', { name: /^Continue$/ }))
    await screen.findByText('Local background removal', {}, WAIT)
    await user.click(
      screen.getByRole('button', { name: /Continue without cutout/ }),
    )

    await screen.findByText('Draft metadata suggestion', {}, WAIT)
    await user.type(screen.getByLabelText(/^Name$/), 'My Coat')
    await user.click(screen.getByRole('button', { name: /^Continue$/ }))

    // Reference step: candidates rendered from the seam, honestly tagged as demo.
    await screen.findByText('Attach product context', {}, WAIT)
    expect(screen.getByText('Reference candidates (demo)')).toBeInTheDocument()
    expect(screen.getAllByText(/Demo · \d+%/).length).toBeGreaterThan(0)
    // Manual URL fallback is always available.
    expect(screen.getByLabelText(/Source URL/i)).toBeInTheDocument()

    // Pick a demo candidate → it prefills the same slot a manual URL would.
    const demoCard = screen
      .getByText(/Local demo reference from category/i)
      .closest('button') as HTMLButtonElement
    await user.click(demoCard)
    const productName = screen.getByLabelText(
      /Product name/i,
    ) as HTMLInputElement
    expect(productName.value.length).toBeGreaterThan(0)
    const label = productName.value

    // Approve → archive, unchanged downstream path.
    await user.click(
      screen.getByRole('button', { name: /Confirm Archive Piece/ }),
    )
    await screen.findByText('Archive Piece created', {}, WAIT)

    await waitFor(() => {
      expect(localStorage.getItem(STORAGE_KEYS.garments) ?? '').toContain(label)
    }, WAIT)
  })
})
