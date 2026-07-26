// Pure archive reducer. No side effects, no I/O, no Date.now/crypto — every
// non-deterministic value (ids, timestamps, events) is supplied by the caller
// via the action payload. This keeps the reducer fully unit-testable.
import type { GarmentItem } from '../../domain/garmentTypes'
import type { ArchiveEvent } from '../../domain/archiveTypes'
import type { ArchiveImportMode } from '../../lib/storage/archiveImport'
import {
  OUTFIT_SLOT_ORDER,
  createEmptyOutfit,
  type OutfitSelection,
  type OutfitSlot,
  type SavedOutfit,
} from '../../domain/outfitTypes'

export interface ArchiveState {
  garments: GarmentItem[]
  currentOutfit: OutfitSelection
  savedOutfits: SavedOutfit[]
  /** Recent activity, newest first, capped. */
  events: ArchiveEvent[]
  /** The most recent event — drives the "entering the archive" animation. */
  lastEvent: ArchiveEvent | null
  /** False until persisted data has loaded; gates persistence writes. */
  hydrated: boolean
}

export type ArchiveAction =
  | {
      type: 'HYDRATE'
      garments: GarmentItem[]
      savedOutfits: SavedOutfit[]
      currentOutfit: OutfitSelection | null
    }
  | { type: 'ADD_GARMENT'; garment: GarmentItem; event?: ArchiveEvent }
  | { type: 'ADD_GARMENTS'; garments: GarmentItem[]; event?: ArchiveEvent }
  | { type: 'UPDATE_GARMENT'; garment: GarmentItem; event?: ArchiveEvent }
  | { type: 'REMOVE_GARMENT'; id: string; event?: ArchiveEvent }
  | { type: 'SELECT_GARMENT'; slot: OutfitSlot; garmentId: string }
  | { type: 'CLEAR_SLOT'; slot: OutfitSlot }
  | { type: 'CLEAR_OUTFIT'; event?: ArchiveEvent }
  | { type: 'SAVE_OUTFIT'; outfit: SavedOutfit; event?: ArchiveEvent }
  | { type: 'REMOVE_OUTFIT'; id: string; event?: ArchiveEvent }
  | { type: 'RESTORE_OUTFIT'; selection: OutfitSelection; event?: ArchiveEvent }
  | {
      /** Apply a validated JSON export (see `lib/storage/archiveImport.ts`). */
      type: 'IMPORT_ARCHIVE'
      mode: ArchiveImportMode
      garments: GarmentItem[]
      savedOutfits: SavedOutfit[]
      currentOutfit: OutfitSelection
      event?: ArchiveEvent
    }
  | { type: 'RESET' }

export const initialArchiveState: ArchiveState = {
  garments: [],
  currentOutfit: createEmptyOutfit(),
  savedOutfits: [],
  events: [],
  lastEvent: null,
  hydrated: false,
}

const MAX_EVENTS = 24

/**
 * Enforce the invariant that `currentOutfit[slot]` always references an
 * existing garment whose category equals that slot. Used wherever garments or
 * the selection change underneath each other.
 */
export function sanitizeOutfit(
  selection: OutfitSelection,
  garments: GarmentItem[],
): OutfitSelection {
  const byId = new Map(garments.map((g) => [g.id, g]))
  const result = createEmptyOutfit()
  for (const slot of OUTFIT_SLOT_ORDER) {
    const id = selection[slot]
    if (id && byId.get(id)?.category === slot) {
      result[slot] = id
    }
  }
  return result
}

function applyEvent(
  state: ArchiveState,
  event: ArchiveEvent | undefined,
): Pick<ArchiveState, 'events' | 'lastEvent'> {
  if (!event) return { events: state.events, lastEvent: state.lastEvent }
  return {
    events: [event, ...state.events].slice(0, MAX_EVENTS),
    lastEvent: event,
  }
}

export function archiveReducer(
  state: ArchiveState,
  action: ArchiveAction,
): ArchiveState {
  switch (action.type) {
    case 'HYDRATE': {
      const garments = action.garments
      return {
        ...state,
        garments,
        savedOutfits: action.savedOutfits,
        currentOutfit: sanitizeOutfit(
          action.currentOutfit ?? createEmptyOutfit(),
          garments,
        ),
        hydrated: true,
      }
    }

    case 'ADD_GARMENT': {
      const garments = [action.garment, ...state.garments]
      return { ...state, garments, ...applyEvent(state, action.event) }
    }

    case 'ADD_GARMENTS': {
      const existing = new Set(state.garments.map((g) => g.id))
      const fresh = action.garments.filter((g) => !existing.has(g.id))
      const garments = [...fresh, ...state.garments]
      return { ...state, garments, ...applyEvent(state, action.event) }
    }

    case 'UPDATE_GARMENT': {
      const garments = state.garments.map((g) =>
        g.id === action.garment.id ? action.garment : g,
      )
      return {
        ...state,
        garments,
        currentOutfit: sanitizeOutfit(state.currentOutfit, garments),
        ...applyEvent(state, action.event),
      }
    }

    case 'REMOVE_GARMENT': {
      const garments = state.garments.filter((g) => g.id !== action.id)
      return {
        ...state,
        garments,
        currentOutfit: sanitizeOutfit(state.currentOutfit, garments),
        ...applyEvent(state, action.event),
      }
    }

    case 'SELECT_GARMENT': {
      return {
        ...state,
        currentOutfit: {
          ...state.currentOutfit,
          [action.slot]: action.garmentId,
        },
      }
    }

    case 'CLEAR_SLOT': {
      return {
        ...state,
        currentOutfit: { ...state.currentOutfit, [action.slot]: null },
      }
    }

    case 'CLEAR_OUTFIT': {
      return {
        ...state,
        currentOutfit: createEmptyOutfit(),
        ...applyEvent(state, action.event),
      }
    }

    case 'SAVE_OUTFIT': {
      return {
        ...state,
        savedOutfits: [action.outfit, ...state.savedOutfits],
        ...applyEvent(state, action.event),
      }
    }

    case 'REMOVE_OUTFIT': {
      return {
        ...state,
        savedOutfits: state.savedOutfits.filter((o) => o.id !== action.id),
        ...applyEvent(state, action.event),
      }
    }

    case 'RESTORE_OUTFIT': {
      return {
        ...state,
        currentOutfit: sanitizeOutfit(action.selection, state.garments),
        ...applyEvent(state, action.event),
      }
    }

    case 'IMPORT_ARCHIVE': {
      if (action.mode === 'replace') {
        // The file becomes the archive — only ever reached on an explicit,
        // confirmed user choice in the transfer panel.
        const garments = action.garments
        return {
          ...state,
          garments,
          savedOutfits: action.savedOutfits,
          currentOutfit: sanitizeOutfit(action.currentOutfit, garments),
          ...applyEvent(state, action.event),
        }
      }
      // Merge: additive and non-destructive. An id already in the archive keeps
      // its EXISTING record, so re-importing an older backup can never overwrite
      // edits made since. The current outfit is left exactly as the user has it.
      const existingGarmentIds = new Set(state.garments.map((g) => g.id))
      const garments = [
        ...action.garments.filter((g) => !existingGarmentIds.has(g.id)),
        ...state.garments,
      ]
      const existingOutfitIds = new Set(state.savedOutfits.map((o) => o.id))
      const savedOutfits = [
        ...action.savedOutfits.filter((o) => !existingOutfitIds.has(o.id)),
        ...state.savedOutfits,
      ]
      return {
        ...state,
        garments,
        savedOutfits,
        currentOutfit: sanitizeOutfit(state.currentOutfit, garments),
        ...applyEvent(state, action.event),
      }
    }

    case 'RESET': {
      return {
        ...initialArchiveState,
        hydrated: true,
      }
    }

    default:
      return state
  }
}
