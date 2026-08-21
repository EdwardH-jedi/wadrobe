// The archive store. Wraps the pure reducer with id/timestamp/event creation
// and wires persistence to the storage facade.
//
// Persistence is hydration-safe: writes are gated on `state.hydrated`, which
// only becomes true after the initial load dispatches HYDRATE. This prevents
// the classic bug where the persist effect fires with the initial empty state
// and clobbers stored data before the async load resolves.
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  ClothingCategory,
  GarmentDraft,
  GarmentItem,
  GarmentProxy3dPreview,
} from '../../domain/garmentTypes'
import type { ArchiveEvent, ArchiveEventType } from '../../domain/archiveTypes'
import type { GarmentAnalysisProvenance } from '../../lib/ai/garmentAnalysisTypes'
import {
  OUTFIT_SLOT_ORDER,
  isOutfitEmpty,
  type OutfitSlot,
  type SavedOutfit,
} from '../../domain/outfitTypes'
import { createId } from '../../lib/id'
import {
  decideWrite,
  openArchiveChannel,
  type ArchiveChannel,
} from '../../lib/storage/archiveRevision'
import {
  initialPersistenceState,
  persistenceReducer,
  type PersistenceSlice,
} from './persistenceStatus'
import {
  getArchiveStorage,
  type ArchiveStorageAdapter,
} from '../../lib/storage/archiveStorage'
import {
  getAssetBlobStore,
  type AssetBlobStore,
} from '../../lib/storage/assetBlobStore'
import {
  archiveBlobKeys,
  cleanupOrphanBlobs,
  dehydrateGarmentForStorage,
  garmentBlobKeys,
  hydrateGarmentForRuntime,
} from '../../lib/storage/garmentAssetStorage'
import type { StorageBackend } from '../../lib/storage/storageTypes'
import { buildSeedGarments } from '../../data/seedGarments'
import {
  archiveReducer,
  initialArchiveState,
} from './archiveReducer'
import { ArchiveContext, type ArchiveContextValue } from './archiveContext'

function makeEvent(
  type: ArchiveEventType,
  label: string,
  extra?: { garmentId?: string; outfitId?: string },
): ArchiveEvent {
  return {
    id: createId('evt'),
    type,
    at: Date.now(),
    label,
    ...extra,
  }
}

export function ArchiveProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(archiveReducer, initialArchiveState)
  const adapterRef = useRef<ArchiveStorageAdapter | null>(null)
  const blobStoreRef = useRef<AssetBlobStore | null>(null)
  // Always-current garments, so the orphan sweep also keeps any existing blob
  // that becomes referenced while its frozen candidate snapshot is processed.
  const garmentsRef = useRef<GarmentItem[]>(state.garments)
  garmentsRef.current = state.garments
  // Persistence acknowledgement. Writes are optimistic — the UI updates
  // immediately — but their OUTCOME is tracked, so a rejected write surfaces
  // instead of leaving the user believing an archive is safe.
  const [persistence, dispatchPersistence] = useReducer(
    persistenceReducer,
    initialPersistenceState,
  )

  // Multi-tab write safety. `revisionRef` is the revision this tab loaded or
  // last wrote; a garments write is refused if the store has moved past it.
  const revisionRef = useRef<number>(0)
  // Serialized form of what this tab last persisted (or hydrated). Lets the
  // effect skip a write when nothing actually changed — without it, merely
  // opening a tab consumes a revision and makes every other tab look stale.
  const lastWrittenGarmentsRef = useRef<string | null>(null)
  const channelRef = useRef<ArchiveChannel | null>(null)
  const tabIdRef = useRef<string>(createId())
  const [conflict, setConflict] = useState(false)

  const [storageBackend, setStorageBackend] = useState<
    StorageBackend | 'pending'
  >('pending')

  // Initial load → HYDRATE. Resolves both the metadata adapter and the asset
  // blob store, then resolves any blob-backed garment's display image (Phase 11)
  // back to an object URL before hydrating, so the synchronous display path is
  // unchanged downstream.
  useEffect(() => {
    let active = true
    void Promise.all([getArchiveStorage(), getAssetBlobStore()]).then(
      async ([adapter, blobStore]) => {
        if (!active) return
        adapterRef.current = adapter
        dispatchPersistence({ type: 'BACKEND_RESOLVED', backend: adapter.backend })
        revisionRef.current = await adapter.loadRevision()
        blobStoreRef.current = blobStore
        setStorageBackend(adapter.backend)
        const [garmentsResult, savedOutfits, currentOutfit] = await Promise.all([
          adapter.loadGarmentsResult(),
          adapter.loadSavedOutfits(),
          adapter.loadCurrentOutfit(),
        ])
        if (!active) return
        const garmentsRaw = garmentsResult.garments
        // Freeze sweep candidates before HYDRATE exposes the UI and uploads can
        // write new blobs. Run the sweep only when the metadata read SUCCEEDED
        // ('ok', even if empty) — an 'unavailable' read could otherwise be
        // mistaken for "no garments" and orphan-delete still-referenced blobs.
        // The age gate in cleanupOrphanBlobs additionally protects recent
        // (cross-tab) blobs.
        const sweepCandidatesPromise =
          garmentsResult.status === 'ok'
            ? blobStore.listKeys().catch(() => [])
            : Promise.resolve([])
        const garments = await Promise.all(
          garmentsRaw.map((g) => hydrateGarmentForRuntime(g, blobStore)),
        )
        if (!active) return
        // Baseline for the change-detection guard below: what we just loaded is
        // by definition already persisted, so the first post-hydrate effect run
        // must not write it back (and must not burn a revision doing so).
        lastWrittenGarmentsRef.current = JSON.stringify(
          garments.map(dehydrateGarmentForStorage),
        )
        dispatch({ type: 'HYDRATE', garments, savedOutfits, currentOutfit })

        // Fire-and-forget orphan sweep (Phase 12) — the candidate snapshot began
        // before HYDRATE, but deletion is NEVER awaited before hydrate. This
        // reclaims blobs left by a prior failed metadata save without including
        // blobs from uploads started after the UI became available.
        const hydratedKeys = archiveBlobKeys(garments)
        void sweepCandidatesPromise.then((candidateKeys) =>
          cleanupOrphanBlobs(
            blobStore,
            candidateKeys,
            () =>
              new Set([
                ...hydratedKeys,
                ...archiveBlobKeys(garmentsRef.current),
              ]),
          ),
        )
      },
    )
    return () => {
      active = false
    }
  }, [])

  // Learn about other tabs' writes as they happen, rather than only at our own
  // next save. Purely an optimisation: the revision check above is what
  // actually prevents the overwrite, and it works with no channel at all.
  useEffect(() => {
    const channel = openArchiveChannel(tabIdRef.current, (notice) => {
      if (notice.revision > revisionRef.current) setConflict(true)
    })
    channelRef.current = channel
    return () => {
      channel.close()
      channelRef.current = null
    }
  }, [])

  // Persist — gated on `hydrated` so we never overwrite before loading. Heavy
  // image bytes of blob-backed garments are dropped here (kept in the blob
  // store); legacy/data-URL garments serialize unchanged.
  // Every write reports its outcome. `trackSave` is stable, so the three
  // effects below keep their existing dependency arrays and firing behaviour —
  // the only change is that a rejection is no longer swallowed.
  const trackSave = useCallback(
    (slice: PersistenceSlice, run: () => Promise<void>): void => {
      dispatchPersistence({ type: 'SAVE_STARTED', slice })
      run().then(
        () =>
          dispatchPersistence({ type: 'SAVE_SUCCEEDED', slice, at: Date.now() }),
        (error: unknown) =>
          dispatchPersistence({
            type: 'SAVE_FAILED',
            slice,
            at: Date.now(),
            error: error instanceof Error ? error.message : String(error),
          }),
      )
    },
    [],
  )

  useEffect(() => {
    const adapter = adapterRef.current
    if (!state.hydrated || !adapter) return
    const payload = state.garments.map(dehydrateGarmentForStorage)
    const serialized = JSON.stringify(payload)
    // No change since we last wrote or hydrated: nothing to persist. Skipping
    // keeps the revision counter meaningful — it counts real archive edits, not
    // mounts — so a freshly opened tab does not make its siblings stale.
    if (lastWrittenGarmentsRef.current === serialized) return

    trackSave('garments', async () => {
      // Re-read the stored revision immediately before writing: if another tab
      // has written since this one loaded, our whole-array write would silently
      // destroy their work, so refuse it and tell the user instead.
      const stored = await adapter.loadRevision()
      const decision = decideWrite(revisionRef.current, stored)
      if (!decision.ok) {
        setConflict(true)
        throw new Error(
          'Another tab updated this archive — reload before saving again.',
        )
      }
      await adapter.saveGarments(payload)
      await adapter.saveRevision(decision.revision)
      revisionRef.current = decision.revision
      lastWrittenGarmentsRef.current = serialized
      channelRef.current?.post({
        revision: decision.revision,
        senderId: tabIdRef.current,
      })
    })
  }, [state.garments, state.hydrated, trackSave])

  useEffect(() => {
    const adapter = adapterRef.current
    if (!state.hydrated || !adapter) return
    trackSave('savedOutfits', () => adapter.saveSavedOutfits(state.savedOutfits))
  }, [state.savedOutfits, state.hydrated, trackSave])

  useEffect(() => {
    const adapter = adapterRef.current
    if (!state.hydrated || !adapter) return
    trackSave('currentOutfit', () =>
      adapter.saveCurrentOutfit(state.currentOutfit),
    )
  }, [state.currentOutfit, state.hydrated, trackSave])

  const value = useMemo<ArchiveContextValue>(() => {
    const getGarment = (id: string): GarmentItem | undefined =>
      state.garments.find((g) => g.id === id)

    const selectedGarments: GarmentItem[] = OUTFIT_SLOT_ORDER.map((slot) => {
      const id = state.currentOutfit[slot]
      return id ? getGarment(id) : undefined
    }).filter((g): g is GarmentItem => g !== undefined)

    return {
      garments: state.garments,
      currentOutfit: state.currentOutfit,
      savedOutfits: state.savedOutfits,
      hydrated: state.hydrated,
      storageBackend,
      persistence,
      archiveConflict: conflict,
      lastEvent: state.lastEvent,

      getGarment,
      garmentsByCategory: (category: ClothingCategory) =>
        state.garments.filter((g) => g.category === category),
      selectedGarments,

      addGarment: (
        draft: GarmentDraft,
        provenance?: GarmentAnalysisProvenance,
      ): GarmentItem => {
        const now = Date.now()
        const garment: GarmentItem = {
          ...draft,
          ...provenance,
          id: createId('grm'),
          createdAt: now,
          updatedAt: now,
        }
        dispatch({
          type: 'ADD_GARMENT',
          garment,
          event: makeEvent('garment_added', `Archived: ${garment.name}`, {
            garmentId: garment.id,
          }),
        })
        return garment
      },

      updateGarment: (id: string, draft: GarmentDraft): void => {
        const existing = state.garments.find((g) => g.id === id)
        if (!existing) return
        const garment: GarmentItem = {
          ...existing,
          ...draft,
          // An explicit manual edit always marks the piece as user-curated.
          userEdited: true,
          updatedAt: Date.now(),
        }
        dispatch({
          type: 'UPDATE_GARMENT',
          garment,
          event: makeEvent('garment_updated', `Updated: ${garment.name}`, {
            garmentId: garment.id,
          }),
        })
      },

      recordMarketValue: (id: string, value: number): void => {
        if (!Number.isFinite(value)) return
        const existing = state.garments.find((g) => g.id === id)
        if (!existing) return
        // Single-currency by design: the entry inherits the garment's currency
        // so the card's delta vs `price` stays comparable.
        const entry = {
          id: createId('mkt'),
          at: Date.now(),
          value,
          currency: existing.currency,
        }
        const garment: GarmentItem = {
          ...existing,
          marketValueHistory: [...(existing.marketValueHistory ?? []), entry],
          updatedAt: Date.now(),
        }
        dispatch({
          type: 'UPDATE_GARMENT',
          garment,
          event: makeEvent(
            'garment_updated',
            `Recorded market value: ${garment.name}`,
            { garmentId: garment.id },
          ),
        })
      },

      setGarmentProxy3dPreview: (
        id: string,
        preview: GarmentProxy3dPreview | null,
      ): void => {
        const existing = state.garments.find((g) => g.id === id)
        if (!existing) return
        const garment: GarmentItem = {
          ...existing,
          proxy3dPreview: preview ?? undefined,
          updatedAt: Date.now(),
        }
        dispatch({
          type: 'UPDATE_GARMENT',
          garment,
          event: makeEvent(
            'garment_updated',
            preview
              ? `Saved proxy 3D preview: ${garment.name}`
              : `Removed proxy 3D preview: ${garment.name}`,
            { garmentId: garment.id },
          ),
        })
      },

      removeGarment: (id: string): void => {
        const existing = state.garments.find((g) => g.id === id)
        dispatch({
          type: 'REMOVE_GARMENT',
          id,
          event: makeEvent(
            'garment_removed',
            `Removed: ${existing?.name ?? 'piece'}`,
            { garmentId: id },
          ),
        })
        // Clean up the garment's blobs (each upload owns unique keys; saved
        // outfits never hold image data, so this is safe).
        if (existing && blobStoreRef.current) {
          const store = blobStoreRef.current
          for (const key of garmentBlobKeys(existing)) void store.delete(key)
        }
      },

      selectGarment: (garmentId: string): void => {
        const garment = state.garments.find((g) => g.id === garmentId)
        if (!garment) return
        dispatch({
          type: 'SELECT_GARMENT',
          slot: garment.category as OutfitSlot,
          garmentId,
        })
      },

      clearSlot: (slot: OutfitSlot): void => {
        dispatch({ type: 'CLEAR_SLOT', slot })
      },

      clearOutfit: (): void => {
        dispatch({
          type: 'CLEAR_OUTFIT',
          event: makeEvent('outfit_cleared', 'Cleared the rail'),
        })
      },

      saveOutfit: (name: string): SavedOutfit | null => {
        if (isOutfitEmpty(state.currentOutfit)) return null
        const coverHex = selectedGarments[0]?.colorHex ?? '#2b2b30'
        const trimmed = name.trim()
        const outfit: SavedOutfit = {
          id: createId('look'),
          name: trimmed.length > 0 ? trimmed : 'Untitled Look',
          selection: { ...state.currentOutfit },
          createdAt: Date.now(),
          coverHex,
        }
        dispatch({
          type: 'SAVE_OUTFIT',
          outfit,
          event: makeEvent('outfit_saved', `Saved look: ${outfit.name}`, {
            outfitId: outfit.id,
          }),
        })
        return outfit
      },

      removeOutfit: (id: string): void => {
        const existing = state.savedOutfits.find((o) => o.id === id)
        dispatch({
          type: 'REMOVE_OUTFIT',
          id,
          event: makeEvent(
            'outfit_removed',
            `Removed look: ${existing?.name ?? 'look'}`,
            { outfitId: id },
          ),
        })
      },

      restoreOutfit: (id: string): void => {
        const saved = state.savedOutfits.find((o) => o.id === id)
        if (!saved) return
        dispatch({
          type: 'RESTORE_OUTFIT',
          selection: saved.selection,
          event: makeEvent('outfit_restored', `Restored: ${saved.name}`, {
            outfitId: saved.id,
          }),
        })
      },

      loadSampleArchive: (): void => {
        const garments = buildSeedGarments(Date.now())
        dispatch({
          type: 'ADD_GARMENTS',
          garments,
          event: makeEvent('garment_added', 'Loaded the sample archive'),
        })
      },

      resetArchive: (): void => {
        dispatch({ type: 'RESET' })
        void adapterRef.current?.clearAll()
        void blobStoreRef.current?.clear()
      },
    }
  }, [state, storageBackend, persistence, conflict, trackSave])

  return (
    <ArchiveContext.Provider value={value}>{children}</ArchiveContext.Provider>
  )
}
