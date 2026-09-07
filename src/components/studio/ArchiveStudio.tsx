// Top-level composition: sidebar + contextual topbar + the active view, plus
// the always-present rail (filmstrip) and the upload/edit modals.
import { useState } from 'react'
import type { GarmentItem } from '../../domain/garmentTypes'
import { useArchive } from '../../app/providers/useArchive'
import { isExperimental3dEnabled } from '../../lib/featureFlags'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { Panel } from '../ui/Panel'
import { ClosetPanel } from '../closet/ClosetPanel'
import { ArchiveCard } from '../closet/ArchiveCard'
import { GarmentFilmstrip } from '../closet/GarmentFilmstrip'
import { UploadGarmentModal } from '../closet/UploadGarmentModal'
import { EditGarmentModal } from '../closet/GarmentEditor'
import { Modal } from '../ui/Modal'
import { OutfitInspector } from '../outfit/OutfitInspector'
import { OutfitBuilder } from '../outfit/OutfitBuilder'
import { Proxy3DLab } from '../avatar/Proxy3DLab'
import { ArchiveAlertBanner } from './ArchiveAlertBanner'
import { SidebarNav } from './SidebarNav'
import { StudioScene } from './StudioScene'
import { StudioFitRail } from './StudioFitRail'
import { MirrorPreview } from './MirrorPreview'
import { OutfitWallBoard } from './OutfitWallBoard'
import { LookbookView } from './LookbookView'
import { VIEW_META, visibleViewOrder, type StudioView } from './views'

export function ArchiveStudio() {
  const {
    garments,
    savedOutfits,
    storageBackend,
    persistence,
    archiveConflict,
    unreadableGarments,
    storeUnreadable,
    hydrated,
    loadSampleArchive,
    setGarmentProxy3dPreview,
  } = useArchive()

  // Track B (Proxy 3D Lab) is opt-in. When off, its view is not listed, the
  // closet offers no 3D affordances, and the lab is never mounted — so three.js
  // (dynamically imported inside the GLB viewer) is never loaded. Already-saved
  // `proxy3dPreview` metadata on a piece is left untouched either way.
  const experimental3d = isExperimental3dEnabled()
  const navViews = visibleViewOrder(experimental3d)

  const [view, setView] = useState<StudioView>('studio')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [editGarment, setEditGarment] = useState<GarmentItem | null>(null)
  const [enteredId, setEnteredId] = useState<string | null>(null)
  // Track B bridge (B3.9): the closet piece the Proxy 3D Lab is linked to.
  // Stored as an id and resolved live so the lab always sees current data.
  const [labGarmentId, setLabGarmentId] = useState<string | null>(null)
  const labGarment = labGarmentId
    ? (garments.find((g) => g.id === labGarmentId) ?? null)
    : null

  const openProxy3d = (garment: GarmentItem) => {
    setLabGarmentId(garment.id)
    setView('lab')
  }

  // Wardrobe Flow A2: the piece shown in the read-only archive card modal.
  // Resolved live so edits reflect immediately.
  const [detailGarmentId, setDetailGarmentId] = useState<string | null>(null)
  const detailGarment = detailGarmentId
    ? (garments.find((g) => g.id === detailGarmentId) ?? null)
    : null

  const meta = VIEW_META[view]
  const openUpload = () => {
    if (hydrated) setUploadOpen(true)
  }

  const handleArchived = (id: string) => {
    setEnteredId(id)
    window.setTimeout(() => setEnteredId(null), 1200)
  }

  const renderView = () => {
    if (!hydrated) {
      return (
        <div className="empty" style={{ borderStyle: 'solid' }}>
          <Icon name="refresh" size={34} className="empty__icon" />
          <div className="empty__title display">Opening the archive…</div>
        </div>
      )
    }

    switch (view) {
      case 'studio':
        return (
          <>
            <StudioScene onOpen={setView} onUpload={openUpload} />
            <StudioFitRail onOpenMirror={() => setView('mirror')} />
          </>
        )
      case 'closet':
        return (
          <ClosetPanel
            onUpload={openUpload}
            onEdit={setEditGarment}
            onProxy3d={experimental3d ? openProxy3d : undefined}
            onDetails={(g) => setDetailGarmentId(g.id)}
          />
        )
      case 'mirror':
        return (
          <div className="stack-lg">
            <div className="mirrorview">
              <MirrorPreview variant="full" />
              <OutfitInspector />
            </div>
            <Panel title="Build the fit">
              <OutfitBuilder onUpload={openUpload} />
            </Panel>
          </div>
        )
      case 'lookbook':
        return <LookbookView garments={garments} onUpload={openUpload} />
      case 'outfits':
        return <OutfitWallBoard onOpenMirror={() => setView('mirror')} />
      case 'lab':
        // Defensive: unreachable while the flag is off, since the view is not
        // listed and nothing else sets it.
        if (!experimental3d) return null
        return (
          <Proxy3DLab
            linkedGarment={labGarment}
            onSetPreview={
              labGarment
                ? (preview) =>
                    setGarmentProxy3dPreview(labGarment.id, preview)
                : undefined
            }
            onUnlink={() => setLabGarmentId(null)}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="app">
      <SidebarNav
        view={view}
        views={navViews}
        onView={setView}
        onUpload={openUpload}
        garmentCount={garments.length}
        outfitCount={savedOutfits.length}
        storageBackend={storageBackend}
        persistence={persistence}
        uploadDisabled={!hydrated}
      />

      <main className="main">
        <ArchiveAlertBanner
          persistence={persistence}
          conflict={archiveConflict}
          unreadableGarments={unreadableGarments}
          storeUnreadable={storeUnreadable}
        />
        <header className="topbar">
          <div className="topbar__titles">
            <div className="eyebrow topbar__eyebrow">{meta.eyebrow}</div>
            <h1 className="topbar__title">{meta.title}</h1>
            <p className="topbar__sub">{meta.sub}</p>
          </div>
          <div className="topbar__actions">
            {hydrated && garments.length === 0 && view !== 'studio' && (
              <Button variant="ghost" onClick={loadSampleArchive}>
                Load sample
              </Button>
            )}
            <Button variant="primary" disabled={!hydrated} onClick={openUpload}>
              <Icon name="upload" size={16} />
              Upload
            </Button>
          </div>
        </header>

        <div className={view === 'studio' ? 'view view--flush' : 'view'}>
          {renderView()}
        </div>
      </main>

      <GarmentFilmstrip
        onUpload={openUpload}
        uploadDisabled={!hydrated}
        highlightId={enteredId}
      />

      <UploadGarmentModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onArchived={handleArchived}
      />
      <EditGarmentModal
        garment={editGarment}
        onClose={() => setEditGarment(null)}
      />
      <Modal
        open={detailGarment !== null}
        onClose={() => setDetailGarmentId(null)}
        eyebrow="Archive piece"
        title={detailGarment?.name ?? ''}
        size="lg"
      >
        {detailGarment && <ArchiveCard garment={detailGarment} />}
      </Modal>
    </div>
  )
}
