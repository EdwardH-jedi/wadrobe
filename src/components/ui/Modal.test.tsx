// The dialog pattern, not just the markup: a modal that renders correctly but
// leaks focus to the page behind is not accessible.
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Modal } from './Modal'

function Harness({ title }: { title?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open</button>
      <button>Background button</button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        ariaLabel={title ? undefined : 'Untitled dialog'}
      >
        <button>First</button>
        <button>Last</button>
      </Modal>
    </div>
  )
}

describe('<Modal /> accessibility', () => {
  it('names the dialog from its visible title', async () => {
    const user = userEvent.setup()
    render(<Harness title="Archive piece" />)
    await user.click(screen.getByRole('button', { name: 'Open' }))

    // Queried BY its accessible name — this fails if aria-labelledby is missing.
    expect(
      screen.getByRole('dialog', { name: 'Archive piece' }),
    ).toBeInTheDocument()
  })

  it('falls back to an explicit label when there is no text title', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Open' }))
    expect(
      screen.getByRole('dialog', { name: 'Untitled dialog' }),
    ).toBeInTheDocument()
  })

  it('moves focus into the dialog when it opens', async () => {
    const user = userEvent.setup()
    render(<Harness title="Archive piece" />)
    await user.click(screen.getByRole('button', { name: 'Open' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('traps Tab inside the dialog instead of reaching the page behind', async () => {
    const user = userEvent.setup()
    render(<Harness title="Archive piece" />)
    await user.click(screen.getByRole('button', { name: 'Open' }))

    const dialog = screen.getByRole('dialog')
    // Walk forward past the last control; focus must wrap, not escape.
    for (let i = 0; i < 6; i += 1) {
      await user.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
  })

  it('wraps backwards too', async () => {
    const user = userEvent.setup()
    render(<Harness title="Archive piece" />)
    await user.click(screen.getByRole('button', { name: 'Open' }))

    const dialog = screen.getByRole('dialog')
    for (let i = 0; i < 4; i += 1) {
      await user.tab({ shift: true })
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
  })

  it('hides the rest of the page from assistive technology while open', async () => {
    const user = userEvent.setup()
    // RTL renders into a div appended to <body>; that div is the "rest of the
    // page" the dialog has to hide.
    const { container } = render(<Harness title="Archive piece" />)
    const appRoot = container

    await user.click(screen.getByRole('button', { name: 'Open' }))
    expect(appRoot.getAttribute('aria-hidden')).toBe('true')
    expect(appRoot.hasAttribute('inert')).toBe(true)

    await user.keyboard('{Escape}')
    expect(appRoot.hasAttribute('aria-hidden')).toBe(false)
    expect(appRoot.hasAttribute('inert')).toBe(false)
  })

  it('restores focus to the trigger on close', async () => {
    const user = userEvent.setup()
    render(<Harness title="Archive piece" />)
    const trigger = screen.getByRole('button', { name: 'Open' })

    await user.click(trigger)
    await user.keyboard('{Escape}')

    // Keyboard users must not be dropped at the top of the document.
    expect(document.activeElement).toBe(trigger)
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="T">
        <button>Only</button>
      </Modal>,
    )
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
