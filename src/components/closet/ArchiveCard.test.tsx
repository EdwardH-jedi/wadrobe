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

  it('shows no market-value block when there is no history', () => {
    render(<ArchiveCard garment={makeGarment({ name: 'Plain Tee' })} />)
    expect(screen.queryByText(/Market value/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('img', { name: /value trend/i }),
    ).not.toBeInTheDocument()
  })

  it('shows the latest manual value, the delta vs purchase, and an update count', () => {
    const garment = makeGarment({
      name: 'Resale Jacket',
      price: 100,
      currency: 'USD',
      marketValueHistory: [
        { id: 'mkt-1', at: 1_700_000_000_000, value: 110, currency: 'USD' },
        { id: 'mkt-2', at: 1_700_000_100_000, value: 140, currency: 'USD' },
      ],
    })
    render(<ArchiveCard garment={garment} />)

    expect(screen.getByText(/Market value · manual estimate/)).toBeInTheDocument()
    expect(screen.getByText('140 USD')).toBeInTheDocument() // latest, not 110
    expect(screen.getByText(/\+40 USD/)).toBeInTheDocument() // delta vs price 100
    expect(screen.getByText(/\+40\.0%/)).toBeInTheDocument()
    expect(screen.getByText('2 updates')).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: /value trend/i }),
    ).toBeInTheDocument()
  })

  it('shows the value but no percent when there is no purchase price', () => {
    const garment = makeGarment({
      name: 'No-Price Piece',
      price: undefined,
      marketValueHistory: [
        { id: 'mkt-1', at: 1_700_000_000_000, value: 75, currency: 'USD' },
      ],
    })
    render(<ArchiveCard garment={garment} />)

    expect(screen.getByText('75 USD')).toBeInTheDocument()
    expect(screen.getByText(/No purchase price to compare/)).toBeInTheDocument()
    expect(screen.getByText('1 update')).toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })
})
