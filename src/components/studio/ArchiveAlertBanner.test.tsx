// The banner is the only surface that admits the archive is in trouble, so what
// it renders — and, just as importantly, when it renders nothing — is behaviour.
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  initialPersistenceState,
  persistenceReducer,
  type PersistenceState,
} from '../../app/providers/persistenceStatus'
import { ArchiveAlertBanner } from './ArchiveAlertBanner'

const healthy = initialPersistenceState

const inMemory: PersistenceState = persistenceReducer(initialPersistenceState, {
  type: 'BACKEND_RESOLVED',
  backend: 'memory',
})

describe('ArchiveAlertBanner', () => {
  it('renders nothing when there is nothing to say', () => {
    const { container } = render(
      <ArchiveAlertBanner persistence={healthy} conflict={false} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('announces politely rather than seizing the screen', () => {
    render(<ArchiveAlertBanner persistence={inMemory} conflict={false} />)
    const alert = screen.getByRole('status')
    // `status`/polite, NOT `alert`/assertive: this must not interrupt someone
    // mid-sentence, and it must never be a modal.
    expect(alert).toHaveAttribute('aria-live', 'polite')
    expect(alert).toHaveTextContent(/survive a reload/i)
  })

  it('offers a reload only for the conflict it actually fixes', async () => {
    const onReload = vi.fn()
    const { rerender } = render(
      <ArchiveAlertBanner
        persistence={healthy}
        conflict
        onReload={onReload}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /reload/i }))
    expect(onReload).toHaveBeenCalledTimes(1)

    // A degraded store is not fixed by reloading — reloading is what LOSES it.
    rerender(
      <ArchiveAlertBanner
        persistence={inMemory}
        conflict={false}
        onReload={onReload}
      />,
    )
    expect(screen.queryByRole('button', { name: /reload/i })).toBeNull()
  })

  it('shows the conflict, not the write failure it also caused', () => {
    const both = persistenceReducer(
      persistenceReducer(initialPersistenceState, {
        type: 'SAVE_STARTED',
        slice: 'garments',
      }),
      {
        type: 'SAVE_FAILED',
        slice: 'garments',
        at: 1,
        error: 'Another tab updated this archive — reload before saving again.',
        kind: 'conflict',
      },
    )
    render(<ArchiveAlertBanner persistence={both} conflict />)
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent(/another tab/i)
  })
})
