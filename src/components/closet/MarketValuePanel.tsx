// Record-panel for the manual market-value tracker. Self-contained: it reaches
// the store via useArchive itself (no prop threading), so it can drop into any
// surface that has a garment — today the EditGarmentModal. The value is a manual
// estimate the user types; honest copy lives in marketValueCopy.ts.
import { useState, type KeyboardEvent } from 'react'
import type { GarmentItem } from '../../domain/garmentTypes'
import { useArchive } from '../../app/providers/useArchive'
import {
  formatMarketValue,
  latestMarketValue,
  sortedMarketValues,
} from '../../domain/marketValue'
import { Button } from '../ui/Button'
import { MARKET_VALUE_COPY } from './marketValueCopy'

export interface MarketValuePanelProps {
  garment: GarmentItem
}

export function MarketValuePanel({ garment }: MarketValuePanelProps) {
  const { recordMarketValue } = useArchive()
  const [text, setText] = useState('')

  // Read-only context: what the user has already recorded, so the panel is not a
  // blind input. All values are the manual estimates they typed.
  const latest = latestMarketValue(garment)
  const updateCount = sortedMarketValues(garment).length

  const value = Number(text)
  const canRecord = text.trim() !== '' && Number.isFinite(value) && value >= 0

  const submit = () => {
    if (!canRecord) return
    // The provider inherits the garment's currency for the entry.
    recordMarketValue(garment.id, value)
    setText('')
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  return (
    <section className="mvpanel" aria-label="Record market value">
      <h4 className="mvpanel__heading">{MARKET_VALUE_COPY.heading}</h4>
      <p className="mvpanel__help muted">{MARKET_VALUE_COPY.help}</p>
      {latest && (
        <p className="mvpanel__current muted">
          {MARKET_VALUE_COPY.latestLabel}:{' '}
          {formatMarketValue(latest.value, latest.currency)} · {updateCount}{' '}
          update{updateCount === 1 ? '' : 's'}
        </p>
      )}
      <div className="mvpanel__row">
        <input
          className="field__input"
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          aria-label={MARKET_VALUE_COPY.inputLabel}
          placeholder={
            garment.currency ? `e.g. 140 ${garment.currency}` : 'e.g. 140'
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
        />
        <Button variant="primary" disabled={!canRecord} onClick={submit}>
          {MARKET_VALUE_COPY.button}
        </Button>
      </div>
    </section>
  )
}
