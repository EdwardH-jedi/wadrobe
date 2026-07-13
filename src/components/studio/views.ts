// The primary views and their editorial copy/icons. Upload is a modal,
// not a view, so it is not listed here. 'lab' is the additive Track B view
// (Proxy 3D Lab) — see docs/AVATAR_TRACK.md.
import type { IconName } from '../ui/Icon'

export type StudioView =
  | 'wardrobe'
  | 'studio'
  | 'closet'
  | 'lookbook'
  | 'mirror'
  | 'outfits'
  | 'lab'

export interface ViewMeta {
  id: StudioView
  label: string
  icon: IconName
  eyebrow: string
  title: string
  sub: string
}

export const VIEW_META: Record<StudioView, ViewMeta> = {
  wardrobe: {
    id: 'wardrobe',
    label: 'Wardrobe',
    icon: 'hanger',
    eyebrow: 'The Wardrobe',
    title: 'Wardrobe',
    sub: 'Browse your archive and build a fit — one workspace.',
  },
  studio: {
    id: 'studio',
    label: 'Studio',
    icon: 'studio',
    eyebrow: 'The Studio',
    title: 'Archive Studio',
    sub: 'Your private styling room — step inside.',
  },
  closet: {
    id: 'closet',
    label: 'Closet',
    icon: 'closet',
    eyebrow: 'The Closet',
    title: 'Digital Closet',
    sub: 'Browse and curate your archived pieces.',
  },
  lookbook: {
    id: 'lookbook',
    label: 'Lookbook',
    icon: 'layers',
    eyebrow: 'The Lookbook',
    title: 'Archive Lookbook',
    sub: 'Your archived pieces as a collection — each photo with its reference details.',
  },
  mirror: {
    id: 'mirror',
    label: 'Mirror',
    icon: 'mirror',
    eyebrow: 'The Mirror',
    title: 'Fit Preview',
    sub: 'Style the mannequin — a 2.5D layered preview.',
  },
  outfits: {
    id: 'outfits',
    label: 'Outfits',
    icon: 'outfits',
    eyebrow: 'The Board',
    title: 'Saved Looks',
    sub: 'Your editorial outfit board.',
  },
  lab: {
    id: 'lab',
    label: 'Proxy 3D',
    icon: 'cube',
    eyebrow: 'The Lab',
    title: 'Proxy 3D Lab',
    sub: 'Turn a PNG into an experimental image-to-3D proxy preview — a local demo with honest limits.',
  },
}

export const VIEW_ORDER: StudioView[] = [
  'wardrobe',
  'studio',
  'closet',
  'lookbook',
  'mirror',
  'outfits',
  'lab',
]
