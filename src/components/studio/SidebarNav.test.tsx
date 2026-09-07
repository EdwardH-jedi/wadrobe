// The navigation half of the core-vs-experimental boundary: the sidebar lists
// exactly the views it is handed, so withholding the lab hides its only door.
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SidebarNav } from './SidebarNav'
import { visibleViewOrder } from './views'

function renderNav(views: ReturnType<typeof visibleViewOrder>) {
  render(
    <SidebarNav
      view="closet"
      views={views}
      onView={vi.fn()}
      onUpload={vi.fn()}
      garmentCount={0}
      outfitCount={0}
      storageBackend="localstorage"
    />,
  )
}

describe('<SidebarNav /> — experimental 3D navigation', () => {
  it('offers no experimental 3D entry when the lab is withheld (default build)', () => {
    renderNav(visibleViewOrder(false))

    expect(
      screen.queryByRole('button', { name: /Experimental 3D/ }),
    ).not.toBeInTheDocument()
    // The wardrobe navigation is untouched.
    // Counted views ("Closet 0") carry their badge in the accessible name.
    for (const label of [
      'Closet',
      'Outfits',
      'Lookbook',
      'Fit Preview',
      'Studio',
    ]) {
      expect(
        screen.getByRole('button', { name: new RegExp(`^${label}`) }),
      ).toBeInTheDocument()
    }
  })

  it('offers the experimental 3D entry when the build opted in', () => {
    renderNav(visibleViewOrder(true))
    expect(
      screen.getByRole('button', { name: /Experimental 3D/ }),
    ).toBeInTheDocument()
  })
})
