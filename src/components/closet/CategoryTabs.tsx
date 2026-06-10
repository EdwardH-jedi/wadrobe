import type { ClothingCategory } from '../../domain/garmentTypes'
import { CATEGORY_META, CATEGORY_ORDER } from '../../domain/garmentTaxonomy'
import { cx } from '../../lib/cx'

export type CategoryFilter = ClothingCategory | 'all'

export interface CategoryTabsProps {
  active: CategoryFilter
  counts: Record<CategoryFilter, number>
  onChange: (value: CategoryFilter) => void
}

export function CategoryTabs({ active, counts, onChange }: CategoryTabsProps) {
  const tabs: Array<{ id: CategoryFilter; label: string }> = [
    { id: 'all', label: 'All' },
    ...CATEGORY_ORDER.map((id) => ({ id, label: CATEGORY_META[id].plural })),
  ]

  return (
    <div className="tabs" role="tablist" aria-label="Filter by category">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          className={cx('tab', active === tab.id && 'tab--active')}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          <span className="tab__count">{counts[tab.id] ?? 0}</span>
        </button>
      ))}
    </div>
  )
}
