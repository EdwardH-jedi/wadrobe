// The primary views and their editorial copy/icons. Upload is a modal,
// not a view, so it is not listed here. 'lab' is the additive Track B view
// (Experimental 3D) — see docs/AVATAR_TRACK.md.
//
// NAVIGATION HIERARCHY (revival Phase 1) — the wardrobe is the product, so the
// order here leads with it. `studio` is the decorative showroom room: it keeps
// its portfolio value but no longer defines the app, and `lab` is experimental.
// Both sit at the end, and on a phone both live behind "More"
// (`MOBILE_MORE_VIEWS`) so neither competes with the Closet and Outfit work.
import type { IconName } from '../ui/Icon'

export type StudioView =
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
  closet: {
    id: 'closet',
    label: 'Closet',
    icon: 'closet',
    eyebrow: 'The Closet',
    title: 'Digital Closet',
    sub: 'Browse and curate your archived pieces.',
  },
  outfits: {
    id: 'outfits',
    label: 'Outfits',
    icon: 'outfits',
    eyebrow: 'The Board',
    title: 'Saved Looks',
    sub: 'Your editorial outfit board.',
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
    // Named for what it does, not for the furniture it used to be.
    label: 'Fit Preview',
    icon: 'mirror',
    eyebrow: 'The Mirror',
    title: 'Fit Preview',
    sub: 'Style the mannequin — a 2.5D layered preview.',
  },
  studio: {
    id: 'studio',
    label: 'Studio',
    icon: 'studio',
    eyebrow: 'The Studio',
    title: 'Archive Studio',
    sub: 'Your private styling room — step inside.',
  },
  lab: {
    id: 'lab',
    // "Proxy 3D" read like a shipped feature. It is a research surface, and the
    // label now says so before a visitor clicks it.
    label: 'Experimental 3D',
    icon: 'cube',
    eyebrow: 'The Lab',
    title: 'Proxy 3D Lab',
    sub: 'Turn a PNG into an experimental image-to-3D proxy preview — a local demo with honest limits.',
  },
}

/**
 * Every view, in navigation order: the wardrobe first, then the secondary
 * showroom, then the experimental lab.
 */
export const VIEW_ORDER: StudioView[] = [
  'closet',
  'outfits',
  'lookbook',
  'mirror',
  'studio',
  'lab',
]

/**
 * Where a visitor lands. The Closet is the product: a user should see their
 * clothes without first having to understand the decorative Studio room.
 *
 * This is a single global default rather than a width-dependent one — a
 * responsive first-view policy would mean reading the window during render, and
 * the Closet is the right landing view on a desktop too.
 */
export const DEFAULT_VIEW: StudioView = 'closet'

/**
 * The views a build actually exposes. The experimental 3D lab is dropped
 * unless the build opted in (`VITE_ENABLE_EXPERIMENTAL_3D`); every wardrobe view
 * is unaffected, so the default navigation is the core product only.
 */
export function visibleViewOrder(experimental3dEnabled: boolean): StudioView[] {
  return experimental3dEnabled
    ? VIEW_ORDER
    : VIEW_ORDER.filter((id) => id !== 'lab')
}

/**
 * The destinations that get a permanent slot in the mobile bottom bar. Four
 * views plus the Add button is the most a thumb-width bar holds without the
 * targets getting too small to hit; everything else goes behind "More".
 *
 * Fit Preview is not here despite being a core destination — it is reachable
 * from the Outfits board and the Studio rail in context, which is how a user
 * actually arrives at it, and giving it a permanent slot would cost the
 * Lookbook one.
 */
export const MOBILE_PRIMARY_VIEWS: StudioView[] = [
  'closet',
  'outfits',
  'lookbook',
]

/**
 * What the mobile "More" sheet lists: every visible view that did not earn a
 * permanent slot, in navigation order. Derived rather than hand-listed, so a
 * new view can never be added to `VIEW_ORDER` and then be unreachable on a
 * phone.
 */
export function mobileMoreViews(experimental3dEnabled: boolean): StudioView[] {
  return visibleViewOrder(experimental3dEnabled).filter(
    (id) => !MOBILE_PRIMARY_VIEWS.includes(id),
  )
}
