import { describe, expect, it } from 'vitest'
import { VIEW_META, VIEW_ORDER, visibleViewOrder } from './views'

describe('visibleViewOrder — core vs experimental 3D boundary', () => {
  it('withholds the experimental lab by default', () => {
    const views = visibleViewOrder(false)
    expect(views).not.toContain('lab')
    expect(views).toEqual(['studio', 'closet', 'lookbook', 'mirror', 'outfits'])
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
