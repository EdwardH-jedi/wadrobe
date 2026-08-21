// role="tablist" is a promise about keyboard behaviour. These tests hold the
// component to it — declaring the role without arrow-key navigation and a
// roving tabindex is worse than using plain buttons.
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { CategoryTabs, type CategoryFilter } from './CategoryTabs'

const COUNTS: Record<CategoryFilter, number> = {
  all: 9,
  outerwear: 2,
  top: 3,
  pants: 2,
  shoes: 1,
  accessory: 1,
}

function Harness({ onChange }: { onChange?: (v: CategoryFilter) => void }) {
  const [active, setActive] = useState<CategoryFilter>('all')
  return (
    <CategoryTabs
      active={active}
      counts={COUNTS}
      onChange={(v) => {
        setActive(v)
        onChange?.(v)
      }}
      panelId="grid"
    />
  )
}

describe('<CategoryTabs /> — complete tablist semantics', () => {
  it('exposes a labelled tablist with one tab per category', () => {
    render(<Harness />)
    expect(
      screen.getByRole('tablist', { name: /filter by category/i }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(6)
  })

  it('keeps exactly one tab in the page tab order (roving tabindex)', () => {
    render(<Harness />)
    const tabs = screen.getAllByRole('tab')
    const inOrder = tabs.filter((t) => t.getAttribute('tabindex') === '0')
    expect(inOrder).toHaveLength(1)
    expect(inOrder[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('moves selection with ArrowRight and follows focus', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    await user.tab() // enters the group at the selected tab
    await user.keyboard('{ArrowRight}')

    expect(onChange).toHaveBeenCalledWith('outerwear')
    expect(document.activeElement).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toHaveTextContent(/Outerwear/i)
  })

  it('wraps around at both ends', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.tab()

    // Left from the first tab lands on the last.
    await user.keyboard('{ArrowLeft}')
    expect(document.activeElement).toHaveTextContent(/Accessor/i)

    // Right from the last wraps back to the first.
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toHaveTextContent(/All/i)
  })

  it('jumps to first and last with Home and End', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.tab()

    await user.keyboard('{End}')
    expect(document.activeElement).toHaveTextContent(/Accessor/i)

    await user.keyboard('{Home}')
    expect(document.activeElement).toHaveTextContent(/All/i)
  })

  it('associates the tabs with the panel they control', () => {
    render(<Harness />)
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toHaveAttribute('aria-controls', 'grid')
    }
  })

  it('still selects on click', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await user.click(screen.getByRole('tab', { name: /Shoes/i }))
    expect(onChange).toHaveBeenCalledWith('shoes')
  })
})
