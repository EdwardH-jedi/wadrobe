// Inline line-icon set (stroke-based, currentColor). No icon dependency —
// keeps the thin editorial line look and zero bundle cost.
import type { SVGProps } from 'react'

export type IconName =
  | 'studio'
  | 'closet'
  | 'mirror'
  | 'outfits'
  | 'upload'
  | 'download'
  | 'plus'
  | 'close'
  | 'trash'
  | 'edit'
  | 'check'
  | 'arrow-left'
  | 'sparkles'
  | 'image'
  | 'hanger'
  | 'layers'
  | 'refresh'
  | 'info'
  | 'shoe'
  | 'cube'

const PATHS: Record<IconName, JSX.Element> = {
  studio: (
    <>
      <path d="M3 9.5 12 4l9 5.5" />
      <path d="M5 8.5V20h14V8.5" />
      <path d="M9.5 20v-5h5v5" />
    </>
  ),
  closet: (
    <>
      <path d="M12 3a2 2 0 0 0-1 3.7L4 11v9h16v-9l-7-4.3" />
      <path d="M4 16h16" />
    </>
  ),
  mirror: (
    <>
      <rect x="6" y="3" width="12" height="18" rx="6" />
      <path d="M9 6.5c-1 1-1.5 2.5-1.5 4" />
    </>
  ),
  outfits: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  close: (
    <>
      <path d="M6 6 18 18" />
      <path d="M18 6 6 18" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M9 7V4h6v3" />
    </>
  ),
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  check: <path d="m5 12 4.5 4.5L19 7" />,
  'arrow-left': (
    <>
      <path d="M19 12H5" />
      <path d="m11 18-6-6 6-6" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6Z" />
      <path d="M18 15l.7 1.8L20.5 17.5l-1.8.7L18 20l-.7-1.8L15.5 17.5l1.8-.7Z" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m5 18 5-5 4 4 2-2 3 3" />
    </>
  ),
  hanger: (
    <>
      <path d="M12 5a1.8 1.8 0 1 1 1.8 1.8c-1 0-1.8.8-1.8 1.8" />
      <path d="m12 8.6-8 5.4a1.4 1.4 0 0 0 .8 2.6h14.4a1.4 1.4 0 0 0 .8-2.6Z" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14-4l-2 2" />
      <path d="M4 5v4h4" />
      <path d="M4 13a8 8 0 0 0 14 4l2-2" />
      <path d="M20 19v-4h-4" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </>
  ),
  shoe: (
    <>
      <path d="M3 14h9l5 2 4 .5V18a1 1 0 0 1-1 1H3Z" />
      <path d="M3 14v-3l4-1 2 2 3 .5" />
    </>
  ),
  cube: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z" />
      <path d="M4 7.5l8 4.5 8-4.5" />
      <path d="M12 12v9" />
    </>
  ),
}

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  size?: number
}

export function Icon({ name, size = 20, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}
