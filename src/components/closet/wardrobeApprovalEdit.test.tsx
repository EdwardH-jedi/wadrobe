// Approval/edit step lock (Wardrobe Flow A3). The upload flow already shows the
// draft in an editable GarmentFields form before save; this guards the approval
// semantics end-to-end: editing a suggested analysis field flips userEdited to
// true, a manual purchase-meta field is saved, and the name gate still holds.
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

describe('wardrobe approval/edit before archive (A3)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('editing a suggested field sets userEdited and the edits are saved', async () => {
    const user = userEvent.setup()
    renderModal()

    // Upload → crop → skip cutout → reach the editable draft (approval) form.
    await screen.findByText('Drop a clothing photo')
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    fireEvent.change(input, {
      target: { files: [new File(['bytes'], 'tee.png', { type: 'image/png' })] },
    })
    await screen.findByText('Crop the garment area', {}, WAIT)
    await user.click(screen.getByRole('button', { name: /^Continue$/ }))
    await screen.findByText('Local background removal', {}, WAIT)
    await user.click(
      screen.getByRole('button', { name: /Continue without cutout/ }),
    )

    // Approval form: name gate holds, then edit a suggested analysis field
    // (colour) and a manual purchase-meta field (material).
    await screen.findByText('Draft metadata suggestion', {}, WAIT)
    expect(screen.getByRole('button', { name: /^Continue$/ })).toBeDisabled()
    await user.type(screen.getByLabelText(/^Name$/), 'Edited Piece')
    await user.click(screen.getByRole('button', { name: 'Bone Red' }))
    await user.type(screen.getByLabelText(/Material/i), 'Wool')

    await user.click(screen.getByRole('button', { name: /^Continue$/ }))

    // Approve (confirm) → archive.
    await screen.findByText('Attach product context', {}, WAIT)
    await user.click(
      screen.getByRole('button', { name: /Confirm Archive Piece/ }),
    )
    await screen.findByText('Archive Piece created', {}, WAIT)

    // The edit is recorded honestly (userEdited) and the values persist.
    await waitFor(() => {
      const raw = localStorage.getItem(STORAGE_KEYS.garments) ?? ''
      expect(raw).toContain('"userEdited":true')
      expect(raw).toContain('"color":"Bone Red"')
      expect(raw).toContain('"material":"Wool"')
    }, WAIT)
  })
})
