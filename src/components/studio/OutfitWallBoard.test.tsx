import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ArchiveProvider } from '../../app/providers/ArchiveProvider'
import { OutfitWallBoard } from './OutfitWallBoard'

describe('OutfitWallBoard', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows an intentional empty state with a path back to the Mirror', async () => {
    render(
      <ArchiveProvider>
        <OutfitWallBoard onOpenMirror={vi.fn()} />
      </ArchiveProvider>,
    )
    expect(
      await screen.findByText('Your look board is waiting'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Open the Mirror/ }),
    ).toBeInTheDocument()
  })
})
