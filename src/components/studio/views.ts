// The four primary views and their editorial copy/icons. Upload is a modal,
// not a view, so it is not listed here.
import type { IconName } from '../ui/Icon'

export type StudioView = 'studio' | 'closet' | 'mirror' | 'outfits'

export interface ViewMeta {
  id: StudioView
  label: string
  icon: IconName
  eyebrow: string
  title: string
  sub: string
}

export const VIEW_META: Record<StudioView, ViewMeta> = {
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
}

export const VIEW_ORDER: StudioView[] = ['studio', 'closet', 'mirror', 'outfits']
