// The archive context shape. Kept separate from the provider component so the
// provider file only exports a component (satisfies react-refresh rules).
import { createContext } from 'react'
import type {
  ClothingCategory,
  GarmentDraft,
  GarmentItem,
  GarmentProxy3dPreview,
} from '../../domain/garmentTypes'
import type { ArchiveEvent } from '../../domain/archiveTypes'
import type { GarmentAnalysisProvenance } from '../../lib/ai/garmentAnalysisTypes'
import type {
  OutfitSelection,
  OutfitSlot,
  SavedOutfit,
} from '../../domain/outfitTypes'
import type { StorageBackend } from '../../lib/storage/storageTypes'
import type { PersistenceState } from './persistenceStatus'
import type {
  ArchiveImportMode,
  ArchiveImportReview,
  ArchiveImportSummary,
} from '../../lib/storage/archiveImport'

export interface ArchiveContextValue {
  // --- State ---
  garments: GarmentItem[]
  currentOutfit: OutfitSelection
  savedOutfits: SavedOutfit[]
  hydrated: boolean
  storageBackend: StorageBackend | 'pending'
  /** Durability of the local archive: whether the last write was acknowledged.
   *  Writes are optimistic, so this is how the UI reports a rejected save
   *  rather than silently implying everything landed. */
  persistence: PersistenceState
  /** True when another tab has written the archive since this one loaded it.
   *  This tab's writes are refused while set, so its view cannot clobber the
   *  newer archive; reloading clears it. */
  archiveConflict: boolean
  lastEvent: ArchiveEvent | null

  // --- Derived ---
  getGarment: (id: string) => GarmentItem | undefined
  garmentsByCategory: (category: ClothingCategory) => GarmentItem[]
  /** The current outfit resolved to garments, in slot order. */
  selectedGarments: GarmentItem[]

  // --- Actions ---
  /** Archive a new piece. `provenance` records the demo analyzer's
   *  confidence/source + whether the user edited the guess (Phase 1); omit it
   *  for hand-built garments (e.g. the sample archive). */
  addGarment: (
    draft: GarmentDraft,
    provenance?: GarmentAnalysisProvenance,
  ) => GarmentItem
  updateGarment: (id: string, draft: GarmentDraft) => void
  /** Append a manual market-value estimate the user typed (NOT live market
   *  data). The entry always inherits the garment's `currency` (single-currency
   *  by design, so the card's delta vs `price` is always comparable); ignores a
   *  non-finite `value`. Persists via the existing UPDATE_GARMENT path, so it
   *  never disturbs the draft fields. */
  recordMarketValue: (id: string, value: number) => void
  /** Attach (or, with null, remove) a proxy 3D preview link (Track B bridge,
   *  B3.9). Metadata only — the GLB stays in the local backend's storage. */
  setGarmentProxy3dPreview: (
    id: string,
    preview: GarmentProxy3dPreview | null,
  ) => void
  removeGarment: (id: string) => void
  /** Apply a validated backup. `merge` keeps existing pieces; `replace` swaps
   *  the archive wholesale. Returns a summary of what changed. */
  importArchive: (
    review: ArchiveImportReview,
    mode: ArchiveImportMode,
  ) => ArchiveImportSummary
  /** Select a garment into its category slot (replaces any current pick). */
  selectGarment: (garmentId: string) => void
  clearSlot: (slot: OutfitSlot) => void
  clearOutfit: () => void
  /** Save the current outfit as a look. Returns null if the outfit is empty. */
  saveOutfit: (name: string) => SavedOutfit | null
  removeOutfit: (id: string) => void
  restoreOutfit: (id: string) => void
  loadSampleArchive: () => void
  resetArchive: () => void
}

export const ArchiveContext = createContext<ArchiveContextValue | null>(null)
