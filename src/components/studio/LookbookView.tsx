// Lookbook (Wardrobe Flow B1): a read-only collection of archived pieces, each
// shown via the A2 ArchiveCard (my photo + reference meta + honest provenance).
// No new data model — a read view over existing garments, with a simple category
// filter. Presentational (takes `garments`) so it is trivially testable.
import { useMemo, useState } from 'react'
import type { GarmentItem } from '../../domain/garmentTypes'
import { CATEGORY_ORDER } from '../../domain/garmentTaxonomy'
import { ArchiveCard } from '../closet/ArchiveCard'
import { CategoryTabs, type CategoryFilter } from '../closet/CategoryTabs'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'

export interface LookbookViewProps {
  garments: GarmentItem[]
  onUpload?: () => void
}

export function LookbookView({ garments, onUpload }: LookbookViewProps) {
  const [category, setCategory] = useState<CategoryFilter>('all')

  const counts = useMemo(() => {
    const result = { all: garments.length } as Record<CategoryFilter, number>
    for (const c of CATEGORY_ORDER) {
      result[c] = garments.filter((g) => g.category === c).length
    }
    return result
  }, [garments])

  const filtered = useMemo(
    () =>
      category === 'all'
        ? garments
        : garments.filter((g) => g.category === category),
    [garments, category],
  )

  if (garments.length === 0) {
    return (
      <EmptyState
        icon="layers"
        title="Your lookbook is empty"
        text="Archive a piece to see it here — your photo paired with its reference details."
        actions={
          onUpload ? (
            <Button variant="primary" onClick={onUpload}>
              Upload a piece
            </Button>
          ) : undefined
        }
      />
    )
  }

  return (
    <div className="lookbook">
      <div className="closet__bar">
        <CategoryTabs active={category} counts={counts} onChange={setCategory} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="closet"
          title="Nothing in this category"
          text="No archived pieces match the selected category."
          actions={
            <Button variant="ghost" onClick={() => setCategory('all')}>
              Clear filter
            </Button>
          }
        />
      ) : (
        <div className="lookbook__grid">
          {filtered.map((garment) => (
            <ArchiveCard key={garment.id} garment={garment} />
          ))}
        </div>
      )}
    </div>
  )
}
