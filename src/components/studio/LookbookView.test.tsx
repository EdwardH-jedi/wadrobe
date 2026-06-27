import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeGarment } from '../../test/factories'
import { LookbookView } from './LookbookView'

describe('LookbookView (B1)', () => {
  it('shows an empty state when there are no pieces', () => {
    render(<LookbookView garments={[]} />)
    expect(screen.getByText('Your lookbook is empty')).toBeInTheDocument()
  })

  it('renders an archive card per piece and filters by category', async () => {
    const user = userEvent.setup()
    const tee = makeGarment({ name: 'Wool Tee', category: 'top' })
    const boot = makeGarment({ name: 'Chelsea Boot', category: 'shoes' })
    render(<LookbookView garments={[tee, boot]} />)

    // Both pieces show in the collection.
    expect(screen.getByText('Wool Tee')).toBeInTheDocument()
    expect(screen.getByText('Chelsea Boot')).toBeInTheDocument()

    // Filtering to a category narrows the grid (read-only view).
    await user.click(screen.getByRole('tab', { name: /Shoes/i }))
    expect(screen.queryByText('Wool Tee')).not.toBeInTheDocument()
    expect(screen.getByText('Chelsea Boot')).toBeInTheDocument()
  })
})
