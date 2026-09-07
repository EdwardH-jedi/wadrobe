import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'

// Integration smoke test: mounts the entire app in jsdom (no canvas/IndexedDB,
// so it exercises the localStorage fallback path) and verifies the shell
// renders, hydrates, and navigates.
//
// NOTE on `getAllByRole` — both navigations are always mounted and CSS decides
// which one is visible at the current width. jsdom applies no media queries, so
// every nav destination matches twice here (sidebar + mobile bar). That is the
// point of the design: no window measuring, no re-mount on resize. Tests take
// the first match; which bar a real user sees is a browser concern, covered by
// the Playwright suite.
const nav = (name: RegExp) => screen.getAllByRole('button', { name })[0]

describe('<App />', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('lands on the closet, not the showroom', async () => {
    render(<App />)

    expect(screen.getByText('Wardrobe')).toBeInTheDocument()
    // The wardrobe is the product: a visitor sees their clothes first, without
    // having to understand the decorative Studio room to get there.
    expect(screen.getByText('Digital Closet')).toBeInTheDocument()
    expect(screen.queryByText('Archive Studio')).not.toBeInTheDocument()

    // The view only renders once the store has hydrated.
    expect(await screen.findByText('Your archive is empty')).toBeInTheDocument()

    // The default build is the wardrobe archive only: the experimental 3D lab
    // is not reachable (see App.experimental3d.test.tsx for the other half).
    expect(
      screen.queryByRole('button', { name: /Experimental 3D/ }),
    ).not.toBeInTheDocument()
  })

  it('keeps the studio reachable as a secondary destination', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Your archive is empty')

    await user.click(nav(/^Studio/))

    expect(await screen.findByText('Clothing Rack')).toBeInTheDocument()
    expect(screen.getByText('Archive Studio')).toBeInTheDocument()
    expect(screen.getByText('Rail is empty')).toBeInTheDocument()

    // A compact "Current Fit" rail is persistently visible on the Studio view
    // (distinct from the Mirror view's full "Current fit" inspector).
    expect(screen.getByText('Current Fit')).toBeInTheDocument()
  })

  it('shows an in-scene prompt when the studio archive is empty', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Your archive is empty')
    await user.click(nav(/^Studio/))

    // The empty studio overlays an invitation to upload or load the sample set,
    // while keeping the room (and its zones) mounted underneath.
    expect(await screen.findByText('Your studio is empty')).toBeInTheDocument()
    expect(screen.getByText('Clothing Rack')).toBeInTheDocument()
  })

  it('loads the sample archive from the in-scene prompt and dismisses it', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Your archive is empty')
    await user.click(nav(/^Studio/))
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

  it('navigates back to the closet and shows the empty state', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Your archive is empty')

    await user.click(nav(/^Studio/))
    await screen.findByText('Clothing Rack')
    await user.click(nav(/^Closet/))

    expect(
      await screen.findByText('Your archive is empty'),
    ).toBeInTheDocument()
  })

  it('opens the upload modal from the navigation', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Your archive is empty')

    // "Upload" appears on the sidebar, topbar and rail — any of them opens it.
    await user.click(screen.getAllByRole('button', { name: /Upload/ })[0])

    expect(await screen.findByText('Drop a clothing photo')).toBeInTheDocument()
  })

  it('opens the upload modal from the mobile Add button', async () => {
    // Add is the one control a wardrobe app must never make anyone hunt for, so
    // its wiring is locked independently of the desktop Upload buttons.
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Your archive is empty')

    await user.click(screen.getByRole('button', { name: 'Add a piece' }))

    expect(await screen.findByText('Drop a clothing photo')).toBeInTheDocument()
  })

  it('rejects a non-image file and keeps the user on the dropzone', async () => {
    // The only upload-flow path that does not need canvas (REJECT fires before
    // image processing), so it can be exercised in jsdom — locks the
    // handleFile → dispatch → render wiring.
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Your archive is empty')
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
