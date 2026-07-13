import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'

// Integration smoke test: mounts the entire app in jsdom (no canvas/IndexedDB,
// so it exercises the localStorage fallback path) and verifies the redesigned
// Wardrobe workspace (1a) — the default landing — renders, hydrates, and works.
describe('<App />', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('lands on the Wardrobe workspace and hydrates', async () => {
    render(<App />)

    // The workspace only renders once the store has hydrated.
    expect(await screen.findByRole('heading', { name: 'Wardrobe' })).toBeInTheDocument()
    // The live fit panel is always present alongside the grid.
    expect(screen.getByText("Today's fit")).toBeInTheDocument()
    expect(screen.getByText(/Select pieces from the grid/)).toBeInTheDocument()
  })

  it('shows the empty-archive state in the grid', async () => {
    render(<App />)
    expect(await screen.findByText('Your archive is empty')).toBeInTheDocument()
  })

  it('loads the sample archive from the empty state and fills the grid', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Your archive is empty')

    await user.click(
      screen.getByRole('button', { name: /Load sample archive/ }),
    )

    await waitFor(() =>
      expect(screen.queryByText('Your archive is empty')).not.toBeInTheDocument(),
    )
    // Category filter pills only appear once the archive has pieces.
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()
  })

  it('styles a piece into the fit from the grid', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Your archive is empty')
    await user.click(
      screen.getByRole('button', { name: /Load sample archive/ }),
    )
    await waitFor(() =>
      expect(screen.queryByText('Your archive is empty')).not.toBeInTheDocument(),
    )

    // Clicking a piece's media button adds it to Today's fit (fit count rises).
    const style = await screen.findAllByRole('button', { name: /^Style / })
    await user.click(style[0])
    await waitFor(() =>
      expect(screen.queryByText(/Select pieces from the grid/)).not.toBeInTheDocument(),
    )
  })

  it('navigates to a legacy view (Mirror) from the rail', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'Wardrobe' })

    await user.click(screen.getByRole('button', { name: 'Mirror' }))

    expect(
      await screen.findByText('2.5D layered styling preview'),
    ).toBeInTheDocument()
  })

  it('opens the upload modal from the Add piece action', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'Wardrobe' })

    // "Add piece" is in the header and on the rail — either opens the modal.
    await user.click(screen.getAllByRole('button', { name: /Add piece/ })[0])

    expect(await screen.findByText('Drop a clothing photo')).toBeInTheDocument()
  })

  it('rejects a non-image file and keeps the user on the dropzone', async () => {
    // The only upload-flow path that does not need canvas (REJECT fires before
    // image processing), so it can be exercised in jsdom.
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'Wardrobe' })
    await user.click(screen.getAllByRole('button', { name: /Add piece/ })[0])
    await screen.findByText('Drop a clothing photo')

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    const file = new File(['nope'], 'note.txt', { type: 'text/plain' })
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByText(/not an image/i)).toBeInTheDocument()
    expect(screen.getByText('Drop a clothing photo')).toBeInTheDocument()
  })
})
