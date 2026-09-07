// The enabled half of the core-vs-experimental boundary. The other half — the
// default build, where the lab is unreachable — is covered by
// `components/studio/SidebarNav.test.tsx` and `views.test.ts`; this one drives
// the real env variable through <App/> so the wiring itself is exercised.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'

describe('<App /> — experimental 3D enabled', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubEnv('VITE_ENABLE_EXPERIMENTAL_3D', 'true')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('exposes the experimental 3D lab and opens it', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Your archive is empty')

    // Labelled for what it is. "Proxy 3D" read like a shipped feature; a
    // visitor now knows it is research before clicking it.
    const navButton = screen.getAllByRole('button', {
      name: /Experimental 3D/,
    })[0]
    await user.click(navButton)

    // The lab's own panel, not just the topbar heading.
    expect(await screen.findByText('Image-to-3D proxy')).toBeInTheDocument()
  })

  it('leaves the wardrobe views reachable alongside it', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Your archive is empty')

    await user.click(screen.getAllByRole('button', { name: /^Studio/ })[0])
    expect(await screen.findByText('Clothing Rack')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: /^Closet/ })[0])
    expect(await screen.findByText('Your archive is empty')).toBeInTheDocument()
  })
})
