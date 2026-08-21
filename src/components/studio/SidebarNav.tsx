import type { StorageBackend } from '../../lib/storage/storageTypes'
import { cx } from '../../lib/cx'
import {
  persistenceLabel,
  type PersistenceState,
} from '../../app/providers/persistenceStatus'
import { Icon } from '../ui/Icon'
import { VIEW_META, VIEW_ORDER, type StudioView } from './views'

export interface SidebarNavProps {
  view: StudioView
  onView: (view: StudioView) => void
  onUpload: () => void
  garmentCount: number
  outfitCount: number
  storageBackend: StorageBackend | 'pending'
  uploadDisabled?: boolean
  /**
   * Which views to list, in order. Defaults to every declared view; the app
   * passes the flag-filtered order so an experimental view can be withheld
   * without this component knowing why (see `visibleViewOrder`).
   */
  views?: StudioView[]
  /** Durability of the local archive. Optional so other callers/tests can omit
   *  it; when absent the badge falls back to naming the backend. */
  persistence?: PersistenceState
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
  garmentCount,
  outfitCount,
  storageBackend,
  uploadDisabled = false,
  views = VIEW_ORDER,
  persistence,
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
        {views.map((id) => {
          const meta = VIEW_META[id]
          const count = countFor(id)
          return (
            <button
              key={id}
              className={cx('navbtn', view === id && 'navbtn--active')}
              onClick={() => onView(id)}
              aria-current={view === id ? 'page' : undefined}
              // Below 860px the visual label is display:none and the button
              // becomes icon-only. Without this it has no accessible name at
              // all on a phone — unreachable by screen reader and by name.
              aria-label={
                count !== null ? `${meta.label} (${count})` : meta.label
              }
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
          aria-label="Upload"
        >
          <Icon name="upload" className="navbtn__icon" />
          <span className="navbtn__label">Upload</span>
        </button>
      </div>

      <div className="sidebar__foot">
        <div
          className={cx(
            'storage-badge',
            persistence?.status === 'failed' && 'storage-badge--alert',
          )}
          // The text is hidden at narrow widths, so name the badge explicitly
          // or its status is announced as an empty region.
          aria-label={`Storage: ${
            persistence && persistence.status !== 'idle'
              ? persistenceLabel(persistence)
              : BACKEND_LABEL[storageBackend]
          }`}
          // Announce durability changes: a failed save is something the user
          // needs to learn about without watching the corner of the screen.
          role="status"
          aria-live="polite"
          title={persistence?.lastError ?? BACKEND_LABEL[storageBackend]}
        >
          <span
            className={cx(
              'storage-badge__dot',
              storageBackend === 'memory' && 'storage-badge__dot--memory',
              persistence?.status === 'failed' && 'storage-badge__dot--failed',
            )}
          />
          <span>
            {persistence && persistence.status !== 'idle'
              ? persistenceLabel(persistence)
              : BACKEND_LABEL[storageBackend]}
          </span>
        </div>
      </div>
    </nav>
  )
}
