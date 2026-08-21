// Accessible modal dialog.
//
// Hand-rolled rather than native `<dialog>`: the DOM shape stays identical to
// what the upload/edit flows already render and test against, and jsdom's
// `<dialog>` focus behaviour is incomplete enough to make those suites unreliable.
// What matters is that the *behaviour* is complete — the pattern below covers
// initial focus, a focus trap, focus restoration, an accessible name, and
// background inertness.
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../../lib/cx'
import { Icon } from './Icon'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  /** Editorial eyebrow above the title. */
  eyebrow?: ReactNode
  size?: 'md' | 'lg'
  footer?: ReactNode
  children: ReactNode
  /**
   * Accessible name when `title` is absent or not a plain string. A dialog
   * without a name is announced only as "dialog", which tells a screen-reader
   * user nothing about what just took over the screen.
   */
  ariaLabel?: string
  /** Optional longer description, associated via `aria-describedby`. */
  description?: ReactNode
}

/** Elements that can hold focus, in DOM order. */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  )
}

export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  size = 'md',
  footer,
  children,
  ariaLabel,
  description,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  // Whatever had focus before the dialog opened, so it can be given back.
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const reactId = useId()
  const titleId = `modal-title-${reactId}`
  const descriptionId = `modal-desc-${reactId}`

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const root = dialogRef.current
      if (!root) return
      const focusable = focusableWithin(root)
      if (focusable.length === 0) {
        // Nothing to land on: keep focus on the dialog rather than letting it
        // escape to the page behind.
        event.preventDefault()
        root.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      // Wrap at both ends so Tab can never reach the inert background.
      if (event.shiftKey && (active === first || active === root)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    },
    [onClose],
  )

  useEffect(() => {
    if (!open) return

    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null

    // Move focus into the dialog: the first control if there is one, otherwise
    // the dialog itself, so the next Tab starts from inside.
    const root = dialogRef.current
    if (root) {
      const focusable = focusableWithin(root)
      ;(focusable[0] ?? root).focus()
    }

    // Hide the rest of the page from assistive technology while the dialog is
    // up. `inert` also blocks pointer and keyboard interaction where supported.
    const siblings = Array.from(document.body.children).filter(
      (el) => el !== root?.closest('.modal-overlay'),
    ) as HTMLElement[]
    const previous = siblings.map((el) => ({
      el,
      ariaHidden: el.getAttribute('aria-hidden'),
      inert: el.hasAttribute('inert'),
    }))
    for (const el of siblings) {
      el.setAttribute('aria-hidden', 'true')
      el.setAttribute('inert', '')
    }

    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      for (const entry of previous) {
        if (entry.ariaHidden === null) entry.el.removeAttribute('aria-hidden')
        else entry.el.setAttribute('aria-hidden', entry.ariaHidden)
        if (!entry.inert) entry.el.removeAttribute('inert')
      }
      // Give focus back to whatever opened the dialog, so keyboard users are
      // not dropped at the top of the document.
      returnFocusRef.current?.focus?.()
    }
  }, [open, handleKeyDown])

  if (!open) return null

  const hasTextTitle = typeof title === 'string' && title.length > 0

  return createPortal(
    <div
      className="modal-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className={cx('modal', size === 'lg' && 'modal--lg')}
        role="dialog"
        aria-modal="true"
        // A dialog must have a name. Prefer the visible title so the announced
        // name matches what is on screen.
        aria-labelledby={hasTextTitle ? titleId : undefined}
        aria-label={hasTextTitle ? undefined : (ariaLabel ?? 'Dialog')}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        {(title || eyebrow) && (
          <header className="modal__head">
            <div>
              {eyebrow && (
                <div className="eyebrow" style={{ marginBottom: 6 }}>
                  {eyebrow}
                </div>
              )}
              {title && (
                <h2 className="modal__title" id={titleId}>
                  {title}
                </h2>
              )}
            </div>
            <button
              className="modal__close"
              onClick={onClose}
              aria-label="Close"
            >
              <Icon name="close" size={18} />
            </button>
          </header>
        )}
        {description && (
          <p className="modal__description" id={descriptionId}>
            {description}
          </p>
        )}
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
