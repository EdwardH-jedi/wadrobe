import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'

export interface PanelProps {
  title?: ReactNode
  actions?: ReactNode
  raised?: boolean
  className?: string
  bodyClassName?: string
  /** Render children directly without the padded body wrapper. */
  flush?: boolean
  children: ReactNode
}

export function Panel({
  title,
  actions,
  raised = false,
  className,
  bodyClassName,
  flush = false,
  children,
}: PanelProps) {
  return (
    <section className={cx('panel', raised && 'panel--raised', className)}>
      {(title || actions) && (
        <header className="panel__head">
          {title ? <h3 className="panel__title">{title}</h3> : <span />}
          {actions && <div className="row">{actions}</div>}
        </header>
      )}
      {flush ? (
        children
      ) : (
        <div className={cx('panel__body', bodyClassName)}>{children}</div>
      )}
    </section>
  )
}
