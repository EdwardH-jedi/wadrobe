import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'

type BadgeVariant = 'default' | 'accent' | 'outline'

export interface BadgeProps {
  variant?: BadgeVariant
  /** When set, renders a small color dot before the label. */
  swatch?: string
  className?: string
  children: ReactNode
}

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  default: '',
  accent: 'badge--accent',
  outline: 'badge--outline',
}

export function Badge({
  variant = 'default',
  swatch,
  className,
  children,
}: BadgeProps) {
  return (
    <span className={cx('badge', VARIANT_CLASS[variant], className)}>
      {swatch && (
        <span
          className="badge__swatch"
          style={{ background: swatch }}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  )
}
