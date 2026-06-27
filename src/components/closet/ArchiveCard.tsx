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
import { formatDate } from '../../lib/format'
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
