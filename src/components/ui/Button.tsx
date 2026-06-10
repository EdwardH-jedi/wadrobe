import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from '../../lib/cx'

type ButtonVariant = 'default' | 'primary' | 'ghost' | 'quiet' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  children?: ReactNode
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  default: '',
  primary: 'btn--primary',
  ghost: 'btn--ghost',
  quiet: 'btn--quiet',
  danger: 'btn--danger',
}

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'btn--sm',
  md: '',
  lg: 'btn--lg',
}

export function Button({
  variant = 'default',
  size = 'md',
  block = false,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'btn',
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        block && 'btn--block',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
