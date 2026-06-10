import type { ReactNode } from 'react'

export type ZoneArea = 'board' | 'rack' | 'mannequin' | 'mirror' | 'shelf'

export interface RoomZoneProps {
  area: ZoneArea
  label: string
  onClick: () => void
  children: ReactNode
}

/** A clickable alcove in the studio scene. */
export function RoomZone({ area, label, onClick, children }: RoomZoneProps) {
  return (
    <button className={`zone zone--${area}`} onClick={onClick}>
      <span className="zone__label">
        <span className="eyebrow">{label}</span>
      </span>
      <span className="zone__hint eyebrow">Open</span>
      {children}
    </button>
  )
}
