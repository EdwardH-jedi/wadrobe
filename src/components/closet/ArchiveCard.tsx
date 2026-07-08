// Archive card (Wardrobe Flow A2): one piece shown as "my photo + the reference
// meta", with HONEST provenance. The data already exists on GarmentItem; this is
// the merged representation. Empty fields are omitted (nothing is invented), and
// provenance is shown at the granularity the data supports — an analyzer draft
// for category/colour/tags, and a user-provided product page for the reference
// meta. The lookbook (B1) reuses this card in a grid.
import type { GarmentItem } from '../../domain/garmentTypes'
import { CATEGORY_META } from '../../domain/garmentTaxonomy'
import {
  ANALYSIS_SOURCE_LABEL,
  describeArchiveProvenance,
  formatConfidence,
} from '../../domain/archiveProvenance'
import { getGarmentDisplayImage } from '../../domain/garmentAsset'
import {
  formatMarketValue,
  latestMarketValue,
  marketValueDelta,
  sortedMarketValues,
} from '../../domain/marketValue'
import { formatDate } from '../../lib/format'
import { cx } from '../../lib/cx'
import { MARKET_VALUE_COPY } from './marketValueCopy'
import { Badge } from '../ui/Badge'
import { Icon } from '../ui/Icon'

export interface ArchiveCardProps {
  garment: GarmentItem
}

interface MetaRow {
  label: string
  value: string
}

function priceLabel(garment: GarmentItem): string | null {
  if (typeof garment.price !== 'number' || !Number.isFinite(garment.price)) {
    return null
  }
  return garment.currency
    ? `${garment.price} ${garment.currency}`
    : String(garment.price)
}

function referenceHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** Round to at most two decimals and drop a trailing ".00"-style fraction. */
function trim(value: number): string {
  return String(Math.round(value * 100) / 100)
}

const DIRECTION_ARROW = { up: '▲', down: '▼', flat: '—' } as const

/** A tiny inline sparkline of the recorded values (no deps). Degrades to a
 *  single dot for one observation; guards against a flat (min==max) series. */
function ValueSparkline({ values }: { values: number[] }) {
  const w = 96
  const h = 24
  const pad = 3
  if (values.length === 0) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const stepX = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0
  const x = (i: number) => pad + i * stepX
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2)

  return (
    <svg
      className="archive-card__spark"
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      role="img"
      aria-label="Recorded value trend"
      preserveAspectRatio="none"
    >
      {values.length > 1 ? (
        <polyline
          points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : (
        <circle cx={w / 2} cy={h / 2} r={2} fill="currentColor" />
      )}
    </svg>
  )
}

export function ArchiveCard({ garment }: ArchiveCardProps) {
  const provenance = describeArchiveProvenance(garment)

  // Reference-derived purchase meta first, then the rest — present fields only.
  const rows: MetaRow[] = []
  const price = priceLabel(garment)
  if (price) rows.push({ label: 'Price', value: price })
  if (garment.retailer) rows.push({ label: 'Retailer', value: garment.retailer })
  if (garment.material) rows.push({ label: 'Material', value: garment.material })
  if (garment.size) rows.push({ label: 'Size', value: garment.size })
  if (garment.subtype) rows.push({ label: 'Type', value: garment.subtype })
  if (typeof garment.purchasedAt === 'number') {
    rows.push({ label: 'Purchased', value: formatDate(garment.purchasedAt) })
  }

  const analysisLabel = provenance.analysis
    ? ANALYSIS_SOURCE_LABEL[provenance.analysis.source]
    : null
  const confidence = provenance.analysis
    ? formatConfidence(provenance.analysis.confidence)
    : null

  // Manual market-value trend (only when the user has recorded at least one
  // estimate). The latest entry drives the headline value + currency; the delta
  // is vs the original purchase price, shown only when there is one to compare.
  const valueEntry = latestMarketValue(garment)
  const delta = marketValueDelta(garment)
  const valueSeries = sortedMarketValues(garment).map((e) => e.value)

  return (
    <article className="archive-card">
      <div className="archive-card__photo">
        <img
          src={getGarmentDisplayImage(garment)}
          alt={garment.name}
          loading="lazy"
        />
      </div>

      <div className="archive-card__body">
        <header className="archive-card__head">
          <Badge variant="outline">{CATEGORY_META[garment.category].label}</Badge>
          <h3 className="archive-card__name">{garment.name}</h3>
          {garment.brand && (
            <div className="archive-card__brand eyebrow">{garment.brand}</div>
          )}
        </header>

        <div className="archive-card__color">
          <span
            className="archive-card__swatch"
            style={{ background: garment.colorHex }}
            aria-hidden="true"
          />
          <span>{garment.color}</span>
        </div>

        {rows.length > 0 && (
          <dl className="archive-card__meta">
            {rows.map((row) => (
              <div key={row.label} className="archive-card__row">
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {valueEntry && (
          <section
            className="archive-card__value"
            aria-label="Market value (manual estimate)"
          >
            <div className="archive-card__value-head">
              <span className="archive-card__value-label eyebrow">
                {MARKET_VALUE_COPY.cardLabel}
              </span>
              <span className="archive-card__value-now">
                {formatMarketValue(valueEntry.value, valueEntry.currency)}
              </span>
            </div>

            <div className="archive-card__value-meta">
              <ValueSparkline values={valueSeries} />
              {delta && delta.absolute !== null ? (
                <span
                  className={cx(
                    'archive-card__delta',
                    `archive-card__delta--${delta.direction}`,
                  )}
                  title="Change versus the purchase price you entered"
                >
                  {DIRECTION_ARROW[delta.direction]}{' '}
                  {delta.absolute > 0 ? '+' : ''}
                  {trim(delta.absolute)}
                  {valueEntry.currency ? ` ${valueEntry.currency}` : ''}
                  {delta.percent !== null
                    ? ` (${delta.percent > 0 ? '+' : ''}${delta.percent.toFixed(1)}%)`
                    : ''}
                </span>
              ) : (
                <span className="archive-card__delta archive-card__delta--flat muted">
                  No purchase price to compare
                </span>
              )}
              <span className="archive-card__value-count muted">
                {valueSeries.length} update{valueSeries.length === 1 ? '' : 's'}
              </span>
            </div>
          </section>
        )}

        {/* Empty-state guidance: surface the manual tracker for pieces with no
            recorded value yet, so the feature is discoverable from the archive. */}
        {!valueEntry && (
          <p className="archive-card__value-empty muted">
            {MARKET_VALUE_COPY.emptyHint}
          </p>
        )}

        {garment.styleTags.length > 0 && (
          <div className="archive-card__tags">
            {garment.styleTags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Honest provenance — never claims per-field certainty we do not store. */}
        <footer className="archive-card__prov">
          {provenance.reference ? (
            <a
              className="archive-card__ref"
              href={provenance.reference.url}
              target="_blank"
              rel="noreferrer noopener"
            >
              <Icon name="info" size={13} />
              {provenance.reference.label ??
                referenceHost(provenance.reference.url)}
            </a>
          ) : null}

          {analysisLabel && (
            <span className="archive-card__chip" title="Draft analysis behind category, colour and tags">
              {analysisLabel}
              {confidence ? ` · ${confidence}` : ''}
              {provenance.analysis?.edited ? ' · edited' : ''}
            </span>
          )}

          <p className="archive-card__note muted">
            {analysisLabel
              ? 'Category, colour and tags are a draft you can edit.'
              : ''}
            {provenance.reference
              ? ' Price, brand and the link come from the product page you provided.'
              : ''}
          </p>
        </footer>
      </div>
    </article>
  )
}
