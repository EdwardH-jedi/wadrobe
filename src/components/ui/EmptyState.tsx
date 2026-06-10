import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export interface EmptyStateProps {
  icon?: IconName
  title: ReactNode
  text?: ReactNode
  actions?: ReactNode
}

export function EmptyState({
  icon = 'hanger',
  title,
  text,
  actions,
}: EmptyStateProps) {
  return (
    <div className="empty">
      <Icon name={icon} size={44} className="empty__icon" />
      <div className="empty__title display">{title}</div>
      {text && <p className="empty__text">{text}</p>}
      {actions && <div className="empty__actions">{actions}</div>}
    </div>
  )
}
