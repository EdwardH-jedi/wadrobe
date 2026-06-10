import { useEffect, type ReactNode } from 'react'
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
}

export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  size = 'md',
  footer,
  children,
}: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="modal-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={cx('modal', size === 'lg' && 'modal--lg')}
        role="dialog"
        aria-modal="true"
      >
        {(title || eyebrow) && (
          <header className="modal__head">
            <div>
              {eyebrow && (
                <div className="eyebrow" style={{ marginBottom: 6 }}>
                  {eyebrow}
                </div>
              )}
              {title && <h2 className="modal__title">{title}</h2>}
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
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
