import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ArchiveProvider } from '../../app/providers/ArchiveProvider'
import {
  __setAssetBlobStoreForTests,
  createMemoryBlobStore,
} from '../../lib/storage/assetBlobStore'
import {
  ARCHIVE_EXPORT_ASSET_ENCODING,
  ARCHIVE_EXPORT_KIND,
  ARCHIVE_EXPORT_SCHEMA_VERSION,
} from '../../lib/storage/archiveExport'
import { STORAGE_KEYS } from '../../lib/storage/storageTypes'
import { makeGarment } from '../../test/factories'
import { ArchiveTransferModal } from './ArchiveTransferModal'

// Drives the real provider over the localStorage facade. jsdom has neither
// URL.createObjectURL nor Blob.text, so the download is stubbed and the picked
// file is given the text() the browser would provide.

const exportDocument = (garments: unknown[], savedOutfits: unknown[] = []) =>
  JSON.stringify({
    kind: ARCHIVE_EXPORT_KIND,
    schemaVersion: ARCHIVE_EXPORT_SCHEMA_VERSION,
    assetEncoding: ARCHIVE_EXPORT_ASSET_ENCODING,
    exportedAt: 1_700_000_000_000,
    garments,
    savedOutfits,
    currentOutfit: {
      outerwear: null,
      top: null,
      pants: null,
      shoes: null,
      accessory: null,
    },
  })

/** A File whose text() works under jsdom. */
function jsonFile(name: string, contents: string): File {
  const file = new File([contents], name, { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: async () => contents })
  return file
}

function renderModal() {
  return render(
    <ArchiveProvider>
      <ArchiveTransferModal open onClose={() => {}} />
    </ArchiveProvider>,
  )
}

const pickFile = async (user: ReturnType<typeof userEvent.setup>, file: File) => {
  await user.upload(
    screen.getByLabelText('Archive export file') as HTMLInputElement,
    file,
  )
}

let created: string[] = []
let downloaded: string[] = []

beforeEach(() => {
  localStorage.clear()
  __setAssetBlobStoreForTests(createMemoryBlobStore(true))
  created = []
  downloaded = []
  // jsdom cannot follow an anchor navigation; record the download instead.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloaded.push(this.download)
  })
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => {
      const url = `blob:test/${created.length}`
      created.push(url)
      return url
    }),
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  })
})

afterEach(() => {
  __setAssetBlobStoreForTests(null)
  vi.restoreAllMocks()
})

describe('<ArchiveTransferModal /> — export', () => {
  it('builds a downloadable file and reports what it contains', async () => {
    localStorage.setItem(
      STORAGE_KEYS.garments,
      JSON.stringify([makeGarment({ id: 'grm-1', name: 'Wool Overcoat' })]),
    )
    const user = userEvent.setup()
    renderModal()

    await user.click(screen.getByRole('button', { name: /Export JSON/ }))

    // The file name is bolded in its own element; the counts sit beside it.
    expect(await screen.findByText(/the-archive-.*\.json/)).toBeInTheDocument()
    expect(
      screen.getByText(/1 piece.*0 looks.*0 images inlined/),
    ).toBeInTheDocument()
    // The download was actually started, under the suggested file name.
    expect(created).toHaveLength(1)
    expect(downloaded).toEqual([expect.stringMatching(/^the-archive-.*\.json$/)])
  })
})

describe('<ArchiveTransferModal /> — import', () => {
  it('reports every dropped entry before anything is committed', async () => {
    const user = userEvent.setup()
    renderModal()

    await pickFile(
      user,
      jsonFile(
        'backup.json',
        exportDocument([
          makeGarment({ id: 'grm-ok', name: 'Boxy Tee' }),
          { name: 'Half A Piece' },
        ]),
      ),
    )

    expect(await screen.findByText(/This file holds 1 piece/)).toBeInTheDocument()
    expect(
      screen.getByText(/Piece "Half A Piece" is missing or has malformed/),
    ).toBeInTheDocument()
    // Nothing written yet — the archive is untouched until Import is pressed.
    expect(localStorage.getItem(STORAGE_KEYS.garments)).toBe('[]')
  })

  it('refuses an unrelated JSON file with a plain explanation', async () => {
    const user = userEvent.setup()
    renderModal()

    await pickFile(user, jsonFile('notes.json', '{"hello":"world"}'))

    expect(
      await screen.findByText(/This file is not an archive export/),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^Import/ }),
    ).not.toBeInTheDocument()
  })

  it('merges without clobbering an existing piece that shares an id', async () => {
    localStorage.setItem(
      STORAGE_KEYS.garments,
      JSON.stringify([makeGarment({ id: 'shared', name: 'Local Copy' })]),
    )
    const user = userEvent.setup()
    renderModal()

    await pickFile(
      user,
      jsonFile(
        'backup.json',
        exportDocument([
          makeGarment({ id: 'shared', name: 'File Copy' }),
          makeGarment({ id: 'grm-new', name: 'File Runner' }),
        ]),
      ),
    )
    await screen.findByText(/This file holds 2 pieces/)
    expect(
      screen.getByText(/1 piece already archived — the existing record is kept/),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Import 1 piece/ }))

    expect(
      await screen.findByText(/Imported 1 piece and 0 looks, keeping 1 existing/),
    ).toBeInTheDocument()
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.garments)!)
      expect(stored.map((g: { id: string; name: string }) => g.name).sort()).toEqual(
        ['File Runner', 'Local Copy'],
      )
    })
  })

  it('replaces the archive only after the destructive mode is chosen', async () => {
    localStorage.setItem(
      STORAGE_KEYS.garments,
      JSON.stringify([makeGarment({ id: 'local-1', name: 'Local Copy' })]),
    )
    const user = userEvent.setup()
    renderModal()

    await pickFile(
      user,
      jsonFile(
        'backup.json',
        exportDocument([makeGarment({ id: 'grm-new', name: 'File Runner' })]),
      ),
    )
    await screen.findByText(/This file holds 1 piece/)

    await user.click(screen.getByRole('button', { name: 'Replace everything' }))
    expect(
      screen.getByText(/1 piece and 0 looks currently in this archive will be removed/),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: /Replace archive with 1 piece/ }),
    )

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.garments)!)
      expect(stored.map((g: { name: string }) => g.name)).toEqual(['File Runner'])
    })
  })
})
