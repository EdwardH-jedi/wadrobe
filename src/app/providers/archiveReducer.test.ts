import { describe, expect, it } from 'vitest'
import { makeGarment } from '../../test/factories'
import {
  archiveReducer,
  initialArchiveState,
  sanitizeOutfit,
  type ArchiveState,
} from './archiveReducer'
import {
  createEmptyOutfit,
  isOutfitEmpty,
  type SavedOutfit,
} from '../../domain/outfitTypes'

describe('archiveReducer — outfit selection', () => {
  it('replaces the garment in a slot when a new one is selected (replace by category)', () => {
    let state = initialArchiveState
    state = archiveReducer(state, {
      type: 'SELECT_GARMENT',
      slot: 'top',
      garmentId: 'top-a',
    })
    expect(state.currentOutfit.top).toBe('top-a')

    state = archiveReducer(state, {
      type: 'SELECT_GARMENT',
      slot: 'top',
      garmentId: 'top-b',
    })
    // The new pick replaces the old one in the same slot.
    expect(state.currentOutfit.top).toBe('top-b')
  })

  it('keeps selections in other slots independent', () => {
    let state = initialArchiveState
    state = archiveReducer(state, {
      type: 'SELECT_GARMENT',
      slot: 'top',
      garmentId: 'top-b',
    })
    state = archiveReducer(state, {
      type: 'SELECT_GARMENT',
      slot: 'pants',
      garmentId: 'pants-c',
    })
    expect(state.currentOutfit.top).toBe('top-b')
    expect(state.currentOutfit.pants).toBe('pants-c')
  })

  it('clears a single slot', () => {
    let state = archiveReducer(initialArchiveState, {
      type: 'SELECT_GARMENT',
      slot: 'shoes',
      garmentId: 'shoes-x',
    })
    state = archiveReducer(state, { type: 'CLEAR_SLOT', slot: 'shoes' })
    expect(state.currentOutfit.shoes).toBeNull()
  })
})

describe('archiveReducer — garment lifecycle', () => {
  it('removes a garment and deselects it from the current outfit', () => {
    const garment = makeGarment({ id: 'a', category: 'top' })
    let state = archiveReducer(initialArchiveState, {
      type: 'ADD_GARMENT',
      garment,
    })
    state = archiveReducer(state, {
      type: 'SELECT_GARMENT',
      slot: 'top',
      garmentId: 'a',
    })
    expect(state.currentOutfit.top).toBe('a')

    state = archiveReducer(state, { type: 'REMOVE_GARMENT', id: 'a' })
    expect(state.garments).toHaveLength(0)
    expect(state.currentOutfit.top).toBeNull()
  })

  it('deduplicates bulk-added garments by id', () => {
    const a = makeGarment({ id: 'dup' })
    let state = archiveReducer(initialArchiveState, {
      type: 'ADD_GARMENT',
      garment: a,
    })
    state = archiveReducer(state, {
      type: 'ADD_GARMENTS',
      garments: [makeGarment({ id: 'dup' }), makeGarment({ id: 'new' })],
    })
    expect(state.garments.map((g) => g.id).sort()).toEqual(['dup', 'new'])
  })
})

describe('sanitizeOutfit', () => {
  it('drops ids that no longer exist or whose category no longer matches the slot', () => {
    const garments = [
      makeGarment({ id: 'top-1', category: 'top' }),
      makeGarment({ id: 'now-pants', category: 'pants' }),
    ]
    const dirty = {
      ...createEmptyOutfit(),
      top: 'now-pants', // wrong category for this slot
      pants: 'missing', // does not exist
      shoes: 'top-1', // wrong category
    }
    const clean = sanitizeOutfit(dirty, garments)
    expect(clean.top).toBeNull()
    expect(clean.pants).toBeNull()
    expect(clean.shoes).toBeNull()
  })

  it('hydration restores a valid selection and marks the store hydrated', () => {
    const garments = [makeGarment({ id: 'top-1', category: 'top' })]
    const state: ArchiveState = archiveReducer(initialArchiveState, {
      type: 'HYDRATE',
      garments,
      savedOutfits: [],
      currentOutfit: { ...createEmptyOutfit(), top: 'top-1' },
    })
    expect(state.hydrated).toBe(true)
    expect(state.currentOutfit.top).toBe('top-1')
  })
})

describe('archiveReducer — UPDATE_GARMENT re-sanitizes the selection', () => {
  it('clears a dangling slot when a selected garment changes category (no auto re-slot)', () => {
    let state = archiveReducer(initialArchiveState, {
      type: 'ADD_GARMENT',
      garment: makeGarment({ id: 'a', category: 'top' }),
    })
    state = archiveReducer(state, {
      type: 'SELECT_GARMENT',
      slot: 'top',
      garmentId: 'a',
    })
    expect(state.currentOutfit.top).toBe('a')

    // Re-categorize the selected garment to 'pants'.
    state = archiveReducer(state, {
      type: 'UPDATE_GARMENT',
      garment: makeGarment({ id: 'a', category: 'pants' }),
    })
    expect(state.garments.find((g) => g.id === 'a')?.category).toBe('pants')
    expect(state.currentOutfit.top).toBeNull() // dangling slot cleared
    expect(state.currentOutfit.pants).toBeNull() // not silently re-slotted
  })
})

describe('archiveReducer — saved outfit lifecycle', () => {
  const look = (id: string): SavedOutfit => ({
    id,
    name: `Look ${id}`,
    selection: createEmptyOutfit(),
    createdAt: 1,
    coverHex: '#000000',
  })

  it('prepends saved outfits newest-first and removes by id', () => {
    let state = archiveReducer(initialArchiveState, {
      type: 'SAVE_OUTFIT',
      outfit: look('o1'),
    })
    expect(state.savedOutfits.map((o) => o.id)).toEqual(['o1'])

    state = archiveReducer(state, { type: 'SAVE_OUTFIT', outfit: look('o2') })
    expect(state.savedOutfits.map((o) => o.id)).toEqual(['o2', 'o1'])

    state = archiveReducer(state, { type: 'REMOVE_OUTFIT', id: 'o1' })
    expect(state.savedOutfits.map((o) => o.id)).toEqual(['o2'])
  })

  it('REMOVE_OUTFIT with an unknown id leaves the list unchanged', () => {
    const state = archiveReducer(initialArchiveState, {
      type: 'SAVE_OUTFIT',
      outfit: look('o1'),
    })
    const after = archiveReducer(state, { type: 'REMOVE_OUTFIT', id: 'nope' })
    expect(after.savedOutfits.map((o) => o.id)).toEqual(['o1'])
  })

  it('REMOVE_OUTFIT leaves garments untouched', () => {
    let state = archiveReducer(initialArchiveState, {
      type: 'ADD_GARMENT',
      garment: makeGarment({ id: 'g1' }),
    })
    state = archiveReducer(state, { type: 'SAVE_OUTFIT', outfit: look('o1') })
    state = archiveReducer(state, { type: 'REMOVE_OUTFIT', id: 'o1' })
    expect(state.savedOutfits).toHaveLength(0)
    expect(state.garments.map((g) => g.id)).toEqual(['g1'])
  })
})

describe('archiveReducer — current outfit lifecycle', () => {
  it('CLEAR_OUTFIT resets every slot to null', () => {
    let state = archiveReducer(initialArchiveState, {
      type: 'SELECT_GARMENT',
      slot: 'top',
      garmentId: 'top-b',
    })
    state = archiveReducer(state, {
      type: 'SELECT_GARMENT',
      slot: 'pants',
      garmentId: 'pants-c',
    })
    state = archiveReducer(state, { type: 'CLEAR_OUTFIT' })
    expect(isOutfitEmpty(state.currentOutfit)).toBe(true)
  })

  it('RESTORE_OUTFIT keeps valid ids and drops missing / wrong-category ones', () => {
    const seeded = archiveReducer(initialArchiveState, {
      type: 'ADD_GARMENTS',
      garments: [makeGarment({ id: 'top-1', category: 'top' })],
    })
    const restored = archiveReducer(seeded, {
      type: 'RESTORE_OUTFIT',
      selection: {
        ...createEmptyOutfit(),
        top: 'top-1', // valid id + category -> kept
        pants: 'missing', // not in store -> dropped
        shoes: 'top-1', // exists but wrong category -> dropped
      },
    })
    expect(restored.currentOutfit.top).toBe('top-1')
    expect(restored.currentOutfit.pants).toBeNull()
    expect(restored.currentOutfit.shoes).toBeNull()
  })
})

describe('archiveReducer — purity', () => {
  it('does not mutate the input state', () => {
    const base = archiveReducer(initialArchiveState, {
      type: 'ADD_GARMENT',
      garment: makeGarment({ id: 'a', category: 'top' }),
    })
    Object.freeze(base)
    Object.freeze(base.currentOutfit)
    Object.freeze(base.garments)
    const snapshot = JSON.stringify(base)

    const next = archiveReducer(base, {
      type: 'SELECT_GARMENT',
      slot: 'top',
      garmentId: 'a',
    })

    expect(next).not.toBe(base)
    expect(JSON.stringify(base)).toBe(snapshot) // original untouched
    expect(next.currentOutfit.top).toBe('a')
  })
})

describe('archiveReducer — IMPORT_ARCHIVE', () => {
  const look = (id: string, name: string): SavedOutfit => ({
    id,
    name,
    selection: createEmptyOutfit(),
    createdAt: 1_699_000_000_000,
    coverHex: '#2b2b30',
  })

  const seeded = (): ArchiveState => ({
    ...initialArchiveState,
    hydrated: true,
    garments: [
      makeGarment({ id: 'local-1', category: 'top', name: 'Local Tee' }),
      makeGarment({ id: 'shared', category: 'pants', name: 'Local Copy' }),
    ],
    savedOutfits: [look('look-local', 'Local Look')],
    currentOutfit: { ...createEmptyOutfit(), top: 'local-1' },
  })

  it('merge adds what is new and keeps the existing record on an id clash', () => {
    const next = archiveReducer(seeded(), {
      type: 'IMPORT_ARCHIVE',
      mode: 'merge',
      garments: [
        makeGarment({ id: 'shared', category: 'pants', name: 'File Copy' }),
        makeGarment({ id: 'file-1', category: 'shoes', name: 'File Runner' }),
      ],
      savedOutfits: [look('look-local', 'File Look'), look('look-file', 'New')],
      currentOutfit: { ...createEmptyOutfit(), shoes: 'file-1' },
    })

    expect(next.garments.map((g) => g.id)).toEqual([
      'file-1',
      'local-1',
      'shared',
    ])
    // The clashing id kept the archive's own version — a merge never overwrites.
    expect(next.garments.find((g) => g.id === 'shared')?.name).toBe('Local Copy')
    expect(next.savedOutfits.map((o) => o.id)).toEqual([
      'look-file',
      'look-local',
    ])
    expect(next.savedOutfits.find((o) => o.id === 'look-local')?.name).toBe(
      'Local Look',
    )
    // Merge never disturbs what the user is currently styling.
    expect(next.currentOutfit).toEqual({ ...createEmptyOutfit(), top: 'local-1' })
  })

  it('replace swaps the archive for the file and adopts its current outfit', () => {
    const next = archiveReducer(seeded(), {
      type: 'IMPORT_ARCHIVE',
      mode: 'replace',
      garments: [makeGarment({ id: 'file-1', category: 'shoes' })],
      savedOutfits: [look('look-file', 'New')],
      currentOutfit: { ...createEmptyOutfit(), shoes: 'file-1' },
    })

    expect(next.garments.map((g) => g.id)).toEqual(['file-1'])
    expect(next.savedOutfits.map((o) => o.id)).toEqual(['look-file'])
    expect(next.currentOutfit.shoes).toBe('file-1')
    expect(next.currentOutfit.top).toBeNull()
  })

  it('drops imported outfit slots that point at pieces the import did not bring', () => {
    const next = archiveReducer(seeded(), {
      type: 'IMPORT_ARCHIVE',
      mode: 'replace',
      garments: [makeGarment({ id: 'file-1', category: 'shoes' })],
      savedOutfits: [],
      currentOutfit: { ...createEmptyOutfit(), shoes: 'file-1', top: 'gone' },
    })
    expect(next.currentOutfit.shoes).toBe('file-1')
    expect(next.currentOutfit.top).toBeNull()
  })

  it('records the import event and leaves hydration alone', () => {
    const next = archiveReducer(seeded(), {
      type: 'IMPORT_ARCHIVE',
      mode: 'merge',
      garments: [],
      savedOutfits: [],
      currentOutfit: createEmptyOutfit(),
      event: {
        id: 'evt-1',
        type: 'archive_imported',
        at: 1_700_000_000_000,
        label: 'Imported from a file: 0 pieces',
      },
    })
    expect(next.lastEvent?.type).toBe('archive_imported')
    expect(next.hydrated).toBe(true)
  })
})
