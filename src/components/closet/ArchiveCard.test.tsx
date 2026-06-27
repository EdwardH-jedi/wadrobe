import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { makeGarment } from '../../test/factories'
import { ArchiveCard } from './ArchiveCard'

describe('ArchiveCard (A2)', () => {
  it('merges photo + reference meta and shows honest provenance', () => {
    const garment = makeGarment({
      name: 'Racing Jacket',
      brand: 'Acme Atelier',
      price: 129,
      currency: 'USD',
      retailer: 'Acme Shop',
      material: 'Wool',
      analysisSource: 'mock',
      analysisConfidence: 0.85,
      userEdited: true,
      asset: {
        originalImageUrl: 'data:,',
        displayImageUrl: 'data:,',
        assetMode: 'uploaded',
        sourceUrl: 'https://shop.example/p/racing-jacket',
        sourceLabel: 'Racing Jacket — Acme',
      },
    })
    render(<ArchiveCard garment={garment} />)

    expect(screen.getByText('Acme Atelier')).toBeInTheDocument()
    expect(screen.getByText('129 USD')).toBeInTheDocument()
    expect(screen.getByText('Acme Shop')).toBeInTheDocument()
    expect(screen.getByText('Wool')).toBeInTheDocument()

    // Honest provenance: a draft-source chip with confidence + edited, and a
    // link to the user-provided product page.
    expect(screen.getByText(/Demo guess · 85% · edited/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Racing Jacket — Acme/ })
    expect(link).toHaveAttribute('href', 'https://shop.example/p/racing-jacket')
  })

  it('omits empty fields and shows no reference/analysis when none exist', () => {
    const garment = makeGarment({ name: 'Plain Tee', styleTags: [] })
    render(<ArchiveCard garment={garment} />)

    expect(screen.getByText('Plain Tee')).toBeInTheDocument()
    // No fabricated meta rows.
    expect(screen.queryByText('Price')).not.toBeInTheDocument()
    expect(screen.queryByText('Material')).not.toBeInTheDocument()
    // No reference link and no analysis chip for a bare piece.
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByText(/Demo guess/)).not.toBeInTheDocument()
  })
})
