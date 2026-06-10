import type { GarmentItem } from '../../domain/garmentTypes'
import { CATEGORY_META } from '../../domain/garmentTaxonomy'
import { getGarmentDisplayImage } from '../../domain/garmentAsset'
import { formatDate } from '../../lib/format'
import { cx } from '../../lib/cx'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'

export interface GarmentCardProps {
  garment: GarmentItem
  selected?: boolean
  index?: number
  onSelect?: (id: string) => void
  onEdit?: (garment: GarmentItem) => void
  onRemove?: (id: string) => void
  /** Track B bridge (B3.9): open the Proxy 3D Lab for this piece. */
  onProxy3d?: (garment: GarmentItem) => void
}

export function GarmentCard({
  garment,
  selected = false,
  index = 0,
  onSelect,
  onEdit,
  onRemove,
  onProxy3d,
}: GarmentCardProps) {
  const meta = CATEGORY_META[garment.category]
  const hasPreview = Boolean(garment.proxy3dPreview)

  return (
    <article
      className={cx('garment-card', selected && 'garment-card--selected')}
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
    >
      <button
        type="button"
        className="garment-card__media"
        onClick={() => onSelect?.(garment.id)}
        aria-label={`Style ${garment.name}`}
      >
        <span className="garment-card__cat">
          <Badge variant="outline">{meta.label}</Badge>
        </span>
        {hasPreview && (
          <span
            className="garment-card__3d"
            title="Proxy 3D preview saved"
            aria-label="Proxy 3D preview saved"
          >
            <Icon name="cube" size={12} />
            3D
          </span>
        )}
        {selected && (
          <span className="garment-card__check" aria-hidden="true">
            <Icon name="check" size={15} />
          </span>
        )}
        <img
          className="garment-card__img"
          src={getGarmentDisplayImage(garment)}
          alt={garment.name}
          loading="lazy"
        />
      </button>

      <div className="garment-card__body">
        <h3 className="garment-card__name">{garment.name}</h3>
        {garment.brand && (
          <div className="garment-card__brand eyebrow">{garment.brand}</div>
        )}
        <div className="garment-card__meta">
          <span
            className="garment-card__dot"
            style={{ background: garment.colorHex }}
          />
          <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {garment.color}
          </span>
          <span className="muted">{formatDate(garment.createdAt)}</span>
        </div>

        {garment.styleTags.length > 0 && (
          <div className="garment-card__tags">
            {garment.styleTags.slice(0, 3).map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="garment-card__actions">
          {onSelect && (
            <Button
              size="sm"
              variant={selected ? 'default' : 'primary'}
              onClick={() => onSelect(garment.id)}
            >
              {selected ? 'Styled' : 'Style'}
            </Button>
          )}
          {onProxy3d && (
            <Button
              size="sm"
              variant="quiet"
              onClick={() => onProxy3d(garment)}
              aria-label={
                hasPreview ? 'View 3D preview' : 'Create 3D preview'
              }
              title={hasPreview ? 'View 3D preview' : 'Create 3D preview'}
            >
              <Icon name="cube" size={15} />
            </Button>
          )}
          {onEdit && (
            <Button
              size="sm"
              variant="quiet"
              onClick={() => onEdit(garment)}
              aria-label="Edit"
            >
              <Icon name="edit" size={15} />
            </Button>
          )}
          {onRemove && (
            <Button
              size="sm"
              variant="quiet"
              onClick={() => onRemove(garment.id)}
              aria-label="Remove"
            >
              <Icon name="trash" size={15} />
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}
