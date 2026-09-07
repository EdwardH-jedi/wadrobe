import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VIEW,
  MOBILE_PRIMARY_VIEWS,
  VIEW_META,
  VIEW_ORDER,
  mobileMoreViews,
  visibleViewOrder,
} from './views'

describe('visibleViewOrder — core vs experimental 3D boundary', () => {
  it('withholds the experimental lab by default', () => {
    const views = visibleViewOrder(false)
    expect(views).not.toContain('lab')
    expect(views).toEqual(['closet', 'outfits', 'lookbook', 'mirror', 'studio'])
  })

  it('exposes the lab when the build opted in', () => {
    expect(visibleViewOrder(true)).toEqual(VIEW_ORDER)
    expect(visibleViewOrder(true)).toContain('lab')
  })

  it('keeps every wardrobe view in both states', () => {
    const wardrobeViews = VIEW_ORDER.filter((id) => id !== 'lab')
    for (const enabled of [false, true]) {
      for (const id of wardrobeViews) {
        expect(visibleViewOrder(enabled)).toContain(id)
      }
    }
  })

  it('only lists views that have metadata to render', () => {
    for (const id of visibleViewOrder(true)) {
      expect(VIEW_META[id]).toBeDefined()
    }
  })
})

describe('navigation hierarchy — the wardrobe leads', () => {
  it('lands on the closet, not the showroom', () => {
    expect(DEFAULT_VIEW).toBe('closet')
  })

  it('orders the wardrobe views ahead of the secondary and experimental ones', () => {
    // Studio keeps its portfolio value but stops defining the product, and the
    // lab is last. Anything that reorders these has changed the product's
    // shape, which should be a deliberate edit here rather than a silent one.
    expect(VIEW_ORDER.indexOf('closet')).toBe(0)
    expect(VIEW_ORDER.indexOf('studio')).toBeGreaterThan(
      VIEW_ORDER.indexOf('mirror'),
    )
    expect(VIEW_ORDER.indexOf('lab')).toBe(VIEW_ORDER.length - 1)
  })

  it('names the experimental lab honestly in the navigation', () => {
    expect(VIEW_META.lab.label).toBe('Experimental 3D')
    // The mirror is named for what it does, not the furniture.
    expect(VIEW_META.mirror.label).toBe('Fit Preview')
  })

  it('never lands a visitor on a view a default build withholds', () => {
    expect(visibleViewOrder(false)).toContain(DEFAULT_VIEW)
  })
})

describe('mobileMoreViews — nothing becomes unreachable on a phone', () => {
  it('holds every visible view that has no permanent bottom-bar slot', () => {
    expect(mobileMoreViews(false)).toEqual(['mirror', 'studio'])
  })

  it('adds the experimental lab only when the build opted in', () => {
    expect(mobileMoreViews(false)).not.toContain('lab')
    expect(mobileMoreViews(true)).toContain('lab')
  })

  it('partitions the visible views exactly — no gaps, no duplicates', () => {
    // The property that actually matters: a view added to VIEW_ORDER and
    // forgotten here would be unreachable on a phone. Derivation makes that
    // impossible, and this proves the derivation.
    for (const enabled of [false, true]) {
      const visible = visibleViewOrder(enabled)
      const primary = MOBILE_PRIMARY_VIEWS.filter((id) => visible.includes(id))
      const reachable = [...primary, ...mobileMoreViews(enabled)]
      expect([...reachable].sort()).toEqual([...visible].sort())
      expect(new Set(reachable).size).toBe(reachable.length)
    }
  })

  it('gives the closet and the outfit board permanent slots', () => {
    // The two destinations the core loop runs through.
    expect(MOBILE_PRIMARY_VIEWS).toContain('closet')
    expect(MOBILE_PRIMARY_VIEWS).toContain('outfits')
    // The experimental lab must never take one.
    expect(MOBILE_PRIMARY_VIEWS).not.toContain('lab')
  })
})
