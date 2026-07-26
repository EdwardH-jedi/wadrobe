import type { StorageBackend } from '../../lib/storage/storageTypes'
import { cx } from '../../lib/cx'
import { Icon } from '../ui/Icon'
import { VIEW_META, VIEW_ORDER, type StudioView } from './views'

export interface SidebarNavProps {
  view: StudioView
  onView: (view: StudioView) => void
  onUpload: () => void
  /** Opens the backup & transfer panel (archive JSON export/import). */
  onTransfer: () => void
  garmentCount: number
  outfitCount: number
  storageBackend: StorageBackend | 'pending'
  uploadDisabled?: boolean
}

const BACKEND_LABEL: Record<StorageBackend | 'pending', string> = {
  indexeddb: 'IndexedDB · persistent',
  localstorage: 'localStorage · persistent',
  memory: 'In-memory · not saved',
  pending: 'Connecting…',
}

export function SidebarNav({
  view,
  onView,
  onUpload,
  onTransfer,
  garmentCount,
  outfitCount,
  storageBackend,
  uploadDisabled = false,
}: SidebarNavProps) {
  const countFor = (id: StudioView): number | null => {
    if (id === 'closet') return garmentCount
    if (id === 'outfits') return outfitCount
    return null
  }

  return (
    <nav className="sidebar">
      <div className="sidebar__brand">
        <div className="sidebar__mark">A</div>
        <div className="sidebar__wordmark">
          <b>The Archive</b>
          <span>Fit OS</span>
        </div>
      </div>

      <div className="sidebar__nav">
        {VIEW_ORDER.map((id) => {
          const meta = VIEW_META[id]
          const count = countFor(id)
          return (
            <button
              key={id}
              className={cx('navbtn', view === id && 'navbtn--active')}
              onClick={() => onView(id)}
              aria-current={view === id ? 'page' : undefined}
            >
              <Icon name={meta.icon} className="navbtn__icon" />
              <span className="navbtn__label">{meta.label}</span>
              {count !== null && <span className="navbtn__badge">{count}</span>}
            </button>
          )
        })}

        <button
          className="navbtn navbtn--accent"
          disabled={uploadDisabled}
          onClick={onUpload}
        >
          <Icon name="upload" className="navbtn__icon" />
          <span className="navbtn__label">Upload</span>
        </button>
      </div>

      <div className="sidebar__foot">
        {/* Sits with the storage badge: both are about where the archive lives. */}
        <button className="sidebar__action" onClick={onTransfer}>
          <Icon name="download" size={15} />
          <span>Backup &amp; transfer</span>
        </button>
        <div className="storage-badge">
          <span
            className={cx(
              'storage-badge__dot',
              storageBackend === 'memory' && 'storage-badge__dot--memory',
            )}
          />
          <span>{BACKEND_LABEL[storageBackend]}</span>
        </div>
      </div>
    </nav>
  )
}
