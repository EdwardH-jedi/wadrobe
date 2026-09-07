// The phone navigation bar (revival Phase 1).
//
// On a narrow screen the desktop sidebar is not rendered at all (CSS, not a
// window-size hook) and this takes its place: the wardrobe destinations a thumb
// should always reach, with Add in the middle where it is hardest to miss.
//
// Everything that did not earn a permanent slot — Fit Preview, the Studio room,
// the experimental 3D lab — lives behind "More". That sheet is local state, not
// a `StudioView`: it is a menu, and making it a view would put it in history,
// in the topbar, and in the sidebar on desktop, where it means nothing.
import { useEffect, useRef, useState } from 'react'
import { cx } from '../../lib/cx'
import { Icon } from '../ui/Icon'
import {
  MOBILE_PRIMARY_VIEWS,
  VIEW_META,
  mobileMoreViews,
  type StudioView,
} from '../studio/views'

export interface MobileBottomNavProps {
  view: StudioView
  onView: (view: StudioView) => void
  onUpload: () => void
  garmentCount: number
  outfitCount: number
  uploadDisabled?: boolean
  /** Whether the build exposes the experimental 3D lab in the More sheet. */
  experimental3dEnabled?: boolean
}

export function MobileBottomNav({
  view,
  onView,
  onUpload,
  garmentCount,
  outfitCount,
  uploadDisabled = false,
  experimental3dEnabled = false,
}: MobileBottomNavProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement | null>(null)
  const moreViews = mobileMoreViews(experimental3dEnabled)

  // Escape closes the sheet, and a tap anywhere outside it does too — the two
  // things a user expects of a menu and the two that are easy to forget.
  useEffect(() => {
    if (!moreOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false)
    }
    const onPointer = (e: PointerEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [moreOpen])

  const countFor = (id: StudioView): number | null => {
    if (id === 'closet') return garmentCount
    if (id === 'outfits') return outfitCount
    return null
  }

  const go = (id: StudioView) => {
    onView(id)
    setMoreOpen(false)
  }

  const renderTab = (id: StudioView) => {
    const meta = VIEW_META[id]
    const count = countFor(id)
    return (
      <button
        key={id}
        type="button"
        className={cx('mobilenav__tab', view === id && 'mobilenav__tab--active')}
        onClick={() => go(id)}
        aria-current={view === id ? 'page' : undefined}
        aria-label={count !== null ? `${meta.label} (${count})` : meta.label}
      >
        <Icon name={meta.icon} size={21} className="mobilenav__icon" />
        <span className="mobilenav__label">{meta.label}</span>
      </button>
    )
  }

  // Add sits in the middle of the bar: Closet, Outfits, [Add], Lookbook, More.
  const [first, second, third] = MOBILE_PRIMARY_VIEWS

  return (
    <nav className="mobilenav" aria-label="Primary">
      {first && renderTab(first)}
      {second && renderTab(second)}

      <button
        type="button"
        className="mobilenav__add"
        onClick={onUpload}
        disabled={uploadDisabled}
        aria-label="Add a piece"
      >
        <Icon name="plus" size={24} />
        <span className="mobilenav__label">Add</span>
      </button>

      {third && renderTab(third)}

      <div className="mobilenav__more" ref={moreRef}>
        {moreOpen && (
          <div className="mobilenav__sheet" role="menu" aria-label="More">
            {moreViews.map((id) => {
              const meta = VIEW_META[id]
              return (
                <button
                  key={id}
                  type="button"
                  role="menuitem"
                  className={cx(
                    'mobilenav__sheetitem',
                    view === id && 'mobilenav__sheetitem--active',
                  )}
                  onClick={() => go(id)}
                  aria-current={view === id ? 'page' : undefined}
                >
                  <Icon name={meta.icon} size={18} />
                  <span>{meta.label}</span>
                </button>
              )
            })}
          </div>
        )}
        <button
          type="button"
          className={cx(
            'mobilenav__tab',
            // The More button reads as active while one of the views it holds
            // is open, so the bar never looks like nothing is selected.
            moreViews.includes(view) && 'mobilenav__tab--active',
          )}
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          aria-haspopup="menu"
          aria-label="More"
        >
          <Icon name="more" size={21} className="mobilenav__icon" />
          <span className="mobilenav__label">More</span>
        </button>
      </div>
    </nav>
  )
}
