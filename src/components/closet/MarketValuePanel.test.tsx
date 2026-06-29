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
