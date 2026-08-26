import { useId, useRef, type KeyboardEvent } from 'react'
import type { ClothingCategory } from '../../domain/garmentTypes'
import { CATEGORY_META, CATEGORY_ORDER } from '../../domain/garmentTaxonomy'
import { cx } from '../../lib/cx'

export type CategoryFilter = ClothingCategory | 'all'

export interface CategoryTabsProps {
  active: CategoryFilter
  counts: Record<CategoryFilter, number>
  onChange: (value: CategoryFilter) => void
  /** id of the element these tabs control, so the pattern is complete. */
  panelId?: string
}

/**
 * A complete tablist, rather than the half-implemented one this used to be.
 *
 * `role="tablist"` promises keyboard behaviour that plain buttons do not: a
 * single tab stop for the whole group, arrow keys to move between tabs, and
 * Home/End to jump. Declaring the role without implementing that is worse than
 * using buttons, because it tells assistive technology to expect something the
 * component does not do. Roving tabindex is what delivers the single tab stop.
 */
export function CategoryTabs({
  active,
  counts,
  onChange,
  panelId,
}: CategoryTabsProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const reactId = useId()
  const tabId = (id: CategoryFilter) => `tab-${reactId}-${id}`

  const tabs: Array<{ id: CategoryFilter; label: string }> = [
    { id: 'all', label: 'All' },
    ...CATEGORY_ORDER.map((id) => ({ id, label: CATEGORY_META[id].plural })),
  ]

  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(event.key)) return
    event.preventDefault()

    const index = tabs.findIndex((t) => t.id === active)
    const last = tabs.length - 1
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? last
          : event.key === 'ArrowLeft'
            ? (index - 1 + tabs.length) % tabs.length
            : (index + 1) % tabs.length

    onChange(tabs[next].id)
    // Follow focus, which is what makes arrow navigation feel like tabs.
    listRef.current
      ?.querySelector<HTMLButtonElement>(`#${CSS.escape(tabId(tabs[next].id))}`)
      ?.focus()
  }

  return (
    <div
      ref={listRef}
      className="tabs"
      role="tablist"
      aria-label="Filter by category"
      onKeyDown={move}
    >
      {tabs.map((tab) => {
        const selected = active === tab.id
        return (
          <button
            key={tab.id}
            id={tabId(tab.id)}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={panelId}
            // Roving tabindex: exactly one tab is in the page tab order, so Tab
            // enters and leaves the group instead of walking every filter.
            tabIndex={selected ? 0 : -1}
            className={cx('tab', selected && 'tab--active')}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
            <span className="tab__count">{counts[tab.id] ?? 0}</span>
          </button>
        )
      })}
    </div>
  )
}
