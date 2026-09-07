// The one place the app tells the user their archive is not safe.
//
// Everything upstream of this — the revision guard, the write acknowledgement
// reducer, the backend probe — exists to DETECT trouble. Until this component
// existed, none of it was ever said out loud: a stale tab silently refused its
// writes and an in-memory session silently promised durability it did not have.
//
// Deliberately not a modal. It is a strip above the view: announced politely to
// assistive technology, never stealing focus, never blocking the work. The one
// action it offers is the one that actually fixes something (reload, for the
// multi-tab case); the rest is words, because the rest is the user's call.
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { cx } from '../../lib/cx'
import {
  archiveAlert,
  type PersistenceState,
} from '../../app/providers/persistenceStatus'

export interface ArchiveAlertBannerProps {
  persistence: PersistenceState
  conflict: boolean
  /** Stored entries dropped at load because they were not readable garments. */
  unreadableGarments?: number
  /** True when the stored garments record could not be read at all. */
  storeUnreadable?: boolean
  /** Injected so the reload is testable without navigating the test runner. */
  onReload?: () => void
}

export function ArchiveAlertBanner({
  persistence,
  conflict,
  unreadableGarments = 0,
  storeUnreadable = false,
  onReload,
}: ArchiveAlertBannerProps) {
  const alert = archiveAlert(persistence, {
    conflict,
    unreadableGarments,
    storeUnreadable,
  })
  if (!alert) return null

  const reload = onReload ?? (() => window.location.reload())

  return (
    <div
      className={cx('archive-alert', `archive-alert--${alert.tone}`)}
      // `status` + polite: the user learns about it at the next natural pause
      // instead of having their current sentence interrupted.
      role="status"
      aria-live="polite"
    >
      <Icon name="info" size={18} className="archive-alert__icon" />
      <div className="archive-alert__text">
        <strong className="archive-alert__title">{alert.title}</strong>{' '}
        <span className="archive-alert__detail">{alert.detail}</span>
      </div>
      {alert.offerReload && (
        <Button variant="ghost" onClick={reload}>
          Reload
        </Button>
      )}
    </div>
  )
}
