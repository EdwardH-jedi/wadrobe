// End-to-end journey test for the manual archive flow (Wardrobe Flow Phase A1).
// It locks the whole user journey as ONE flow — upload → (mock) analyze → reach
// the reference step → paste a product URL → read details (prefill) → archive →
// the reference meta is persisted on the saved piece. The individual pieces are
// covered elsewhere; this guards that they stay wired together.
//
// Canvas-bound seams (jsdom has no canvas) and the product-meta network call are
// mocked, but productMetaToPrefill and the archive/persist path stay REAL.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ArchiveProvider } from '../../app/providers/ArchiveProvider'
import { UploadGarmentModal } from './UploadGarmentModal'
import { STORAGE_KEYS } from '../../lib/storage/storageTypes'
import type { ProductMeta } from '../../lib/productMatch/productMetaParse'

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

// Deterministic product-meta success so the journey covers the URL-prefill
// branch without a real network call. productMetaToPrefill is left REAL.
const META: ProductMeta = {
  name: 'Racing Jacket',
  brand: 'Acme Atelier',
  price: 129,
  currency: 'USD',
  sourceUrl: 'https://shop.example/p/racing-jacket',
}
vi.mock('../../lib/productMatch/fetchProductMeta', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/productMatch/fetchProductMeta')>()
  return {
    ...actual,
    fetchProductMeta: vi.fn(async () => ({
      status: 'success' as const,
      meta: META,
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

describe('wardrobe archive flow — upload → analyze → manual URL → save (A1)', () => {
  beforeEach(() => {
    localStorage.clear()
    // Configure the optional backend so the reference "Read details from page"
    // action is offered. The analyzer still stays MOCK — turning on vision needs
    // VITE_ANALYZER=vision as well, which we intentionally do not set.
    vi.stubEnv('VITE_API_BASE', 'https://meta.test')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('carries manual-URL reference meta through to the saved piece', async () => {
    const user = userEvent.setup()
    renderModal()

    // 1) Upload a photo.
    await screen.findByText('Drop a clothing photo')
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    fireEvent.change(input, {
      target: {
        files: [
          new File(['bytes'], 'racing-jacket.png', { type: 'image/png' }),
        ],
      },
    })

    // 2) Crop step → Continue (identity crop).
    await screen.findByText('Crop the garment area', {}, WAIT)
    await user.click(screen.getByRole('button', { name: /^Continue$/ }))

    // 3) Cutout step → skip (no canvas in jsdom; cutout is optional).
    await screen.findByText('Local background removal', {}, WAIT)
    await user.click(
      screen.getByRole('button', { name: /Continue without cutout/ }),
    )

    // 4) Draft suggestion (the mock analyzer ran). Name is required to proceed.
    await screen.findByText('Draft metadata suggestion', {}, WAIT)
    expect(screen.getByRole('button', { name: /^Continue$/ })).toBeDisabled()
    await user.type(screen.getByLabelText(/^Name$/), 'Racing Jacket')
    await user.click(screen.getByRole('button', { name: /^Continue$/ }))

    // 5) Reference step → paste a product URL → read details (prefill).
    await screen.findByText('Attach product context', {}, WAIT)
    await user.type(screen.getByLabelText(/Source URL/i), META.sourceUrl)
    await user.click(
      screen.getByRole('button', { name: /Read details from page/ }),
    )
    await screen.findByText(/Filled from the product page/i, {}, WAIT)

    // 6) Confirm → archived.
    await user.click(
      screen.getByRole('button', { name: /Confirm Archive Piece/ }),
    )
    await screen.findByText('Archive Piece created', {}, WAIT)

    // 7) The reference meta is persisted on the saved piece (real mapping +
    //    real archive path — proves the journey stays wired together).
    await waitFor(() => {
      const raw = localStorage.getItem(STORAGE_KEYS.garments) ?? ''
      expect(raw).toContain('"brand":"Acme Atelier"')
      expect(raw).toContain('"price":129')
      expect(raw).toContain('shop.example/p/racing-jacket')
    }, WAIT)
  })
})
