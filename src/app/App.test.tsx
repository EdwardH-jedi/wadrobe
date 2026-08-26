import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'

// Integration smoke test: mounts the entire app in jsdom (no canvas/IndexedDB,
// so it exercises the localStorage fallback path) and verifies the shell
// renders, hydrates, and navigates.
describe('<App />', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders the studio shell and hydrates the room', async () => {
    render(<App />)

    expect(screen.getByText('Wardrobe')).toBeInTheDocument()
    expect(screen.getByText('Archive Studio')).toBeInTheDocument()

    // The scene only renders once the store has hydrated.
    expect(await screen.findByText('Clothing Rack')).toBeInTheDocument()
    expect(screen.getByText('Rail is empty')).toBeInTheDocument()

    // A compact "Current Fit" rail is persistently visible on the Studio view
    // (distinct from the Mirror view's full "Current fit" inspector).
    expect(screen.getByText('Current Fit')).toBeInTheDocument()

    // The default build is the wardrobe archive only: the experimental Proxy 3D
    // Lab is not reachable (see App.experimental3d.test.tsx for the other half).
    expect(
      screen.queryByRole('button', { name: /Proxy 3D/ }),
    ).not.toBeInTheDocument()
  })

  it('shows an in-scene prompt when the studio archive is empty', async () => {
    render(<App />)
    // The empty studio overlays an invitation to upload or load the sample set,
    // while keeping the room (and its zones) mounted underneath.
    expect(await screen.findByText('Your studio is empty')).toBeInTheDocument()
    expect(screen.getByText('Clothing Rack')).toBeInTheDocument()
  })

  it('loads the sample archive from the in-scene prompt and dismisses it', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Your studio is empty')

    // On the studio view the overlay owns the only "Load sample" CTA (the topbar
    // one is suppressed there to avoid a duplicate).
    await user.click(screen.getByRole('button', { name: /Load sample/ }))

    await waitFor(() =>
      expect(screen.queryByText('Your studio is empty')).not.toBeInTheDocument(),
    )
    // The rail now reports archived pieces instead of being empty.
    expect(screen.queryByText('Rail is empty')).not.toBeInTheDocument()
  })

  it('navigates to the closet and shows the empty state', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Clothing Rack')

    await user.click(screen.getByRole('button', { name: /Closet/ }))

    expect(
      await screen.findByText('Your archive is empty'),
    ).toBeInTheDocument()
  })

  it('opens the upload modal from the sidebar', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Clothing Rack')

    // "Upload" appears on the sidebar, topbar and rail — any of them opens it.
    await user.click(screen.getAllByRole('button', { name: /Upload/ })[0])

    expect(await screen.findByText('Drop a clothing photo')).toBeInTheDocument()
  })

  it('rejects a non-image file and keeps the user on the dropzone', async () => {
    // The only upload-flow path that does not need canvas (REJECT fires before
    // image processing), so it can be exercised in jsdom — locks the
    // handleFile → dispatch → render wiring.
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Clothing Rack')
    await user.click(screen.getAllByRole('button', { name: /Upload/ })[0])
    await screen.findByText('Drop a clothing photo')

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    const file = new File(['nope'], 'note.txt', { type: 'text/plain' })
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByText(/not an image/i)).toBeInTheDocument()
    // Still on the dropzone — no scan started.
    expect(screen.getByText('Drop a clothing photo')).toBeInTheDocument()
  })
})
