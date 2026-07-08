import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeGarment } from '../../test/factories'
import { FORBIDDEN_CLAIM_TERMS } from '../../test/honesty'
import { MARKET_VALUE_COPY } from './marketValueCopy'
import { MarketValuePanel } from './MarketValuePanel'

const recordMarketValue = vi.fn()
vi.mock('../../app/providers/useArchive', () => ({
  useArchive: () => ({ recordMarketValue }),
}))

describe('MarketValuePanel', () => {
  beforeEach(() => recordMarketValue.mockClear())

  it('records a typed value for the garment', async () => {
    const user = userEvent.setup()
    render(<MarketValuePanel garment={makeGarment({ id: 'g1', currency: 'USD' })} />)

    await user.type(
      screen.getByLabelText(MARKET_VALUE_COPY.inputLabel),
      '140',
    )
    await user.click(screen.getByRole('button', { name: MARKET_VALUE_COPY.button }))

    expect(recordMarketValue).toHaveBeenCalledTimes(1)
    expect(recordMarketValue).toHaveBeenCalledWith('g1', 140)
  })

  it('shows the latest recorded value as read-only context when history exists', () => {
    render(
      <MarketValuePanel
        garment={makeGarment({
          id: 'g1',
          marketValueHistory: [
            { id: 'm1', at: 1_700_000_000_000, value: 90, currency: 'USD' },
            { id: 'm2', at: 1_700_000_100_000, value: 120, currency: 'USD' },
          ],
        })}
      />,
    )
    // Latest entry (120, not 90) and the update count give the user context on
    // what they have already recorded, before typing a new estimate.
    expect(screen.getByText(/120 USD/)).toBeInTheDocument()
    expect(screen.getByText(/2 updates/)).toBeInTheDocument()
  })

  it('shows no latest-value context for a piece with no history', () => {
    render(<MarketValuePanel garment={makeGarment({ id: 'g1' })} />)
    expect(screen.queryByText(/updates?/)).not.toBeInTheDocument()
  })

  it('does not record empty or invalid input', async () => {
    const user = userEvent.setup()
    render(<MarketValuePanel garment={makeGarment({ id: 'g1' })} />)

    // Button is disabled with no input → clicking does nothing.
    await user.click(screen.getByRole('button', { name: MARKET_VALUE_COPY.button }))
    expect(recordMarketValue).not.toHaveBeenCalled()

    // A negative value stays rejected.
    await user.type(screen.getByLabelText(MARKET_VALUE_COPY.inputLabel), '-5')
    await user.click(screen.getByRole('button', { name: MARKET_VALUE_COPY.button }))
    expect(recordMarketValue).not.toHaveBeenCalled()
  })
})

describe('market-value copy honesty', () => {
  // Mirrors the uploadFlow honesty guard: the value is a MANUAL estimate, never
  // live/fetched/AI-derived. Copy must not claim those capabilities, and must
  // own the manual/estimate framing.
  const allCopy = Object.values(MARKET_VALUE_COPY).join(' ')

  it('never claims AI / real-time / automatic / fetched recognition', () => {
    expect(allCopy).not.toMatch(FORBIDDEN_CLAIM_TERMS)
  })

  it('owns the manual-estimate framing', () => {
    const lower = allCopy.toLowerCase()
    expect(lower).toContain('manual')
    expect(lower).toContain('estimate')
  })
})
