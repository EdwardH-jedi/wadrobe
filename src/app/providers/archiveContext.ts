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

export interface ArchiveContextValue {
  // --- State ---
  garments: GarmentItem[]
  currentOutfit: OutfitSelection
  savedOutfits: SavedOutfit[]
  hydrated: boolean
  storageBackend: StorageBackend | 'pending'
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
