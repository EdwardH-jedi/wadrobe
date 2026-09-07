// The phone navigation's behaviour, not its pixels. Layout is verified in a
// real browser (see `e2e/wardrobe.spec.ts`); jsdom applies no media queries, so
// asserting anything about width here would be asserting a fiction.
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MobileBottomNav } from './MobileBottomNav'

function renderNav(props: Partial<Parameters<typeof MobileBottomNav>[0]> = {}) {
  const onView = vi.fn()
  const onUpload = vi.fn()
  render(
    <MobileBottomNav
      view="closet"
      onView={onView}
      onUpload={onUpload}
      garmentCount={3}
      outfitCount={2}
      {...props}
    />,
  )
  return { onView, onUpload }
}

describe('<MobileBottomNav /> — the core loop within thumb reach', () => {
  it('gives the wardrobe destinations permanent slots', () => {
    renderNav()
    for (const label of [/^Closet/, /^Outfits/, /^Lookbook/]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('carries counts in the accessible name, as the sidebar does', () => {
    renderNav()
    expect(screen.getByRole('button', { name: 'Closet (3)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Outfits (2)' })).toBeInTheDocument()
  })

  it('offers Add as its own always-visible control', async () => {
    const user = userEvent.setup()
    const { onUpload } = renderNav()

    await user.click(screen.getByRole('button', { name: 'Add a piece' }))
    expect(onUpload).toHaveBeenCalledTimes(1)
  })

  it('disables Add before the archive has hydrated', async () => {
    const user = userEvent.setup()
    const { onUpload } = renderNav({ uploadDisabled: true })

    const add = screen.getByRole('button', { name: 'Add a piece' })
    expect(add).toBeDisabled()
    await user.click(add)
    expect(onUpload).not.toHaveBeenCalled()
  })

  it('navigates when a destination is tapped', async () => {
    const user = userEvent.setup()
    const { onView } = renderNav()

    await user.click(screen.getByRole('button', { name: /^Outfits/ }))
    expect(onView).toHaveBeenCalledWith('outfits')
  })

  it('marks the current destination for assistive tech', () => {
    renderNav({ view: 'outfits' })
    expect(screen.getByRole('button', { name: /^Outfits/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('button', { name: /^Closet/ })).not.toHaveAttribute(
      'aria-current',
    )
  })
})

describe('<MobileBottomNav /> — the More sheet', () => {
  it('keeps the secondary destinations closed until asked', () => {
    renderNav()
    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(
      screen.queryByRole('menuitem', { name: /Fit Preview/ }),
    ).not.toBeInTheDocument()
  })

  it('exposes Fit Preview and the Studio behind it', async () => {
    const user = userEvent.setup()
    renderNav()

    await user.click(screen.getByRole('button', { name: 'More' }))

    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(
      screen.getByRole('menuitem', { name: /Fit Preview/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Studio/ })).toBeInTheDocument()
  })

  it('withholds the experimental lab unless the build opted in', async () => {
    const user = userEvent.setup()
    renderNav()
    await user.click(screen.getByRole('button', { name: 'More' }))

    // The core/experimental boundary reaches the phone too: a default build
    // offers no door to the lab anywhere.
    expect(
      screen.queryByRole('menuitem', { name: /Experimental 3D/ }),
    ).not.toBeInTheDocument()
  })

  it('offers the experimental lab when the build opted in', async () => {
    const user = userEvent.setup()
    renderNav({ experimental3dEnabled: true })
    await user.click(screen.getByRole('button', { name: 'More' }))

    expect(
      screen.getByRole('menuitem', { name: /Experimental 3D/ }),
    ).toBeInTheDocument()
  })

  it('navigates and closes when a sheet item is chosen', async () => {
    const user = userEvent.setup()
    const { onView } = renderNav()
    await user.click(screen.getByRole('button', { name: 'More' }))

    await user.click(screen.getByRole('menuitem', { name: /Fit Preview/ }))

    expect(onView).toHaveBeenCalledWith('mirror')
    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    renderNav()
    await user.click(screen.getByRole('button', { name: 'More' }))

    await user.keyboard('{Escape}')

    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('closes when the user taps outside it', async () => {
    const user = userEvent.setup()
    renderNav()
    await user.click(screen.getByRole('button', { name: 'More' }))

    await user.click(document.body)

    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('shows More as active while one of its destinations is open', () => {
    // Otherwise the bar looks like nothing at all is selected whenever the user
    // is on a secondary view.
    renderNav({ view: 'studio' })
    expect(screen.getByRole('button', { name: 'More' }).className).toContain(
      'mobilenav__tab--active',
    )
  })
})
