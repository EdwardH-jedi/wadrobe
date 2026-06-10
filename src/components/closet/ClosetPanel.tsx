// The closet: a curated archive grid with category tabs and tag filtering.
import { useMemo, useState } from 'react'
import type { GarmentItem } from '../../domain/garmentTypes'
import { CATEGORY_ORDER } from '../../domain/garmentTaxonomy'
import { useArchive } from '../../app/providers/useArchive'
import { cx } from '../../lib/cx'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { EmptyState } from '../ui/EmptyState'
import { GarmentCard } from './GarmentCard'
import { CategoryTabs, type CategoryFilter } from './CategoryTabs'

export interface ClosetPanelProps {
  onUpload: () => void
  onEdit: (garment: GarmentItem) => void
}

export function ClosetPanel({ onUpload, onEdit }: ClosetPanelProps) {
  const { garments, currentOutfit, selectGarment, removeGarment, loadSampleArchive } =
    useArchive()
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [tag, setTag] = useState<string | null>(null)

  const counts = useMemo(() => {
    const result = { all: garments.length } as Record<CategoryFilter, number>
    for (const c of CATEGORY_ORDER) {
      result[c] = garments.filter((g) => g.category === c).length
    }
    return result
  }, [garments])

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const g of garments) g.styleTags.forEach((t) => set.add(t))
    return [...set].sort()
  }, [garments])

  const filtered = useMemo(() => {
    return garments.filter((g) => {
      if (category !== 'all' && g.category !== category) return false
      if (tag && !g.styleTags.includes(tag)) return false
      return true
    })
  }, [garments, category, tag])

  const handleRemove = (id: string) => {
    const garment = garments.find((g) => g.id === id)
    if (
      garment &&
      window.confirm(`Remove "${garment.name}" from the archive?`)
    ) {
      removeGarment(id)
    }
  }

  if (garments.length === 0) {
    return (
      <EmptyState
        icon="hanger"
        title="Your archive is empty"
        text="Upload a photo of a piece you own to begin building your archive — or load a sample set to explore the studio."
        actions={
          <>
            <Button variant="primary" onClick={onUpload}>
              <Icon name="upload" size={16} />
              Upload a piece
            </Button>
            <Button variant="ghost" onClick={loadSampleArchive}>
              Load sample archive
            </Button>
          </>
        }
      />
    )
  }

  return (
    <div className="closet">
      <div className="closet__bar">
        <CategoryTabs active={category} counts={counts} onChange={setCategory} />
        <Button variant="ghost" size="sm" onClick={onUpload}>
          <Icon name="plus" size={15} />
          Add piece
        </Button>
      </div>

      {allTags.length > 0 && (
        <div className="filters">
          <span className="eyebrow" style={{ marginRight: 4 }}>
            Tags
          </span>
          <button
            className={cx('chip', tag === null && 'chip--active')}
            onClick={() => setTag(null)}
          >
            All
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              className={cx('chip', tag === t && 'chip--active')}
              onClick={() => setTag(tag === t ? null : t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon="closet"
          title="Nothing in this filter"
          text="No pieces match the current category and tag combination."
          actions={
            <Button
              variant="ghost"
              onClick={() => {
                setCategory('all')
                setTag(null)
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="garment-grid">
          {filtered.map((garment, index) => (
            <GarmentCard
              key={garment.id}
              garment={garment}
              index={index}
              selected={currentOutfit[garment.category] === garment.id}
              onSelect={selectGarment}
              onEdit={onEdit}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}
    </div>
  )
}
