// Pure state machine for the Proxy 3D Lab upload flow (Track B3/B3.6/B3.7),
// modeled on the closet uploadFlow reducer: the reducer is deterministic and
// side-effect free; file handles, blobs, object URLs and network calls live
// in the component.
//
// B3.7 shape: TWO independent sides. The front image is required; the back
// is optional. Each side carries its own B3.6 cutout-first state — a side
// without usable transparency never proceeds silently:
//   - front: [create cutout first] or [generate flat card anyway] (explicit;
//     the flat card is single-sided by definition and uses the front only)
//   - back:  [create cutout first], [use back image without cutout]
//     (explicit), or [remove back image]
// Generation is single-sided when only the front is resolved, dual-sided
// when both are.
//
// PROXY3D_COPY is the single source of user-facing wording for this flow and
// is guarded by an honesty test (PROXY3D_FORBIDDEN_CLAIM_TERMS): the result
// is always a "proxy 3D preview" (single-/dual-sided silhouette proxy or a
// flat image card fallback), never a try-on or a fit/size claim.

export type Proxy3dSide = 'front' | 'back'

export type Proxy3dStatus = 'editing' | 'uploading' | 'ready' | 'failed'

/** Client-side verdict on a selected PNG's transparency. */
export type Proxy3dAlphaVerdict = 'usable' | 'none' | 'unknown'

export interface InputInfo {
  width: number
  height: number
  has_alpha: boolean
}

/** Mirrors the backend's Proxy3dRecord response (backend/app/main.py). */
export interface Proxy3dRecord {
  job_id: string
  status: 'done'
  method:
    | 'extruded-alpha-contour'
    | 'extruded-alpha-contour-dual'
    | 'textured-plane'
  alpha_mask_used: boolean
  input: InputInfo
  mesh: {
    vertices: number
    faces: number
  }
  result_url: string
  limitations: string
  created_at: number
  sides?: 'single' | 'dual'
  back_input?: InputInfo | null
  back_alpha_mask_used?: boolean | null
  /** B3.8: the manual back alignment the backend actually applied. */
  back_alignment?: {
    scale: number
    offset_x: number
    offset_y: number
    manual: boolean
  } | null
}

/** Track A cutout tuning seams exposed in the lab (B3.8). */
export interface CutoutSettings {
  /** RGB distance treated as "same as the background" (Track A `tolerance`). */
  tolerance: number
  /** Border-uniformity gate that must pass before the fill runs. */
  uniformityMin: number
}

export const DEFAULT_CUTOUT_SETTINGS: CutoutSettings = {
  tolerance: 42,
  uniformityMin: 0.82,
}

export const CUTOUT_SETTING_LIMITS = {
  tolerance: { min: 10, max: 120, step: 1 },
  uniformityMin: { min: 0.5, max: 0.95, step: 0.01 },
} as const

export function clampCutoutSetting(
  setting: keyof CutoutSettings,
  value: number,
): number {
  const { min, max } = CUTOUT_SETTING_LIMITS[setting]
  if (!Number.isFinite(value)) return DEFAULT_CUTOUT_SETTINGS[setting]
  return Math.min(max, Math.max(min, value))
}

/** Manual back alignment (B3.8) — normalized units, mirrored by the backend. */
export interface BackAlignment {
  scale: number
  offsetX: number
  offsetY: number
}

export const DEFAULT_BACK_ALIGNMENT: BackAlignment = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
}

export const BACK_ALIGNMENT_LIMITS = {
  scale: { min: 0.25, max: 4, step: 0.05 },
  offsetX: { min: -0.5, max: 0.5, step: 0.01 },
  offsetY: { min: -0.5, max: 0.5, step: 0.01 },
} as const

export function clampBackAlignment(patch: Partial<BackAlignment>): Partial<BackAlignment> {
  const out: Partial<BackAlignment> = {}
  for (const key of ['scale', 'offsetX', 'offsetY'] as const) {
    const value = patch[key]
    if (value === undefined) continue
    const { min, max } = BACK_ALIGNMENT_LIMITS[key]
    out[key] = Number.isFinite(value)
      ? Math.min(max, Math.max(min, value))
      : DEFAULT_BACK_ALIGNMENT[key]
  }
  return out
}

export function isManualAlignment(alignment: BackAlignment): boolean {
  return (
    alignment.scale !== 1 || alignment.offsetX !== 0 || alignment.offsetY !== 0
  )
}

export interface SelectedFileMeta {
  name: string
  sizeBytes: number
  /** Object URL for a small 2D thumbnail, or null when unavailable. */
  previewUrl: string | null
}

/** The locally produced transparent cutout shown before/instead of upload. */
export interface CutoutMeta {
  previewUrl: string
  sizeBytes: number
}

export interface SideState {
  file: SelectedFileMeta | null
  alpha: Proxy3dAlphaVerdict | null
  cutout: CutoutMeta | null
  cutoutError: string | null
  cutting: boolean
  /** Back-only explicit choice: project the uncut image onto the silhouette. */
  useAsIs: boolean
  /** Track A cutout tuning for this side (B3.8). */
  cutoutSettings: CutoutSettings
}

export const EMPTY_SIDE: SideState = {
  file: null,
  alpha: null,
  cutout: null,
  cutoutError: null,
  cutting: false,
  useAsIs: false,
  cutoutSettings: DEFAULT_CUTOUT_SETTINGS,
}

export interface Proxy3dFlowState {
  status: Proxy3dStatus
  front: SideState
  back: SideState
  /** Manual back alignment for dual generation (B3.8). */
  backAlignment: BackAlignment
  record: Proxy3dRecord | null
  error: string | null
  /** True when the failure looks like the backend being unreachable/down —
   *  gates the "make sure the backend is running" hint so it never shows on
   *  ordinary validation errors the backend itself returned. */
  errorIsConnectivity: boolean
}

export type Proxy3dFlowAction =
  | {
      type: 'SELECT_FILE'
      side: Proxy3dSide
      file: SelectedFileMeta
      alpha: Proxy3dAlphaVerdict
    }
  | { type: 'REJECT_FILE'; reason: string }
  | { type: 'REMOVE_SIDE'; side: Proxy3dSide }
  | {
      type: 'SET_CUTOUT_SETTING'
      side: Proxy3dSide
      setting: keyof CutoutSettings
      value: number
    }
  | { type: 'RESET_CUTOUT_SETTINGS'; side: Proxy3dSide }
  | { type: 'CUTOUT_START'; side: Proxy3dSide }
  | { type: 'CUTOUT_SUCCESS'; side: Proxy3dSide; cutout: CutoutMeta }
  | { type: 'CUTOUT_FAILURE'; side: Proxy3dSide; reason: string }
  | { type: 'USE_BACK_AS_IS' }
  | { type: 'SET_BACK_ALIGNMENT'; patch: Partial<BackAlignment> }
  | { type: 'RESET_BACK_ALIGNMENT' }
  | { type: 'UPLOAD_START' }
  | { type: 'UPLOAD_SUCCESS'; record: Proxy3dRecord }
  | { type: 'UPLOAD_FAILURE'; message: string; connectivity?: boolean }
  | { type: 'RESET' }

export const INITIAL_PROXY3D_STATE: Proxy3dFlowState = {
  status: 'editing',
  front: EMPTY_SIDE,
  back: EMPTY_SIDE,
  backAlignment: DEFAULT_BACK_ALIGNMENT,
  record: null,
  error: null,
  errorIsConnectivity: false,
}

/** Client-side mirror of the backend's upload byte limit. */
export const MAX_PROXY3D_UPLOAD_BYTES = 10 * 1024 * 1024

const isBusy = (state: Proxy3dFlowState): boolean =>
  state.status === 'uploading' || state.front.cutting || state.back.cutting

function withSide(
  state: Proxy3dFlowState,
  side: Proxy3dSide,
  next: Partial<SideState>,
): Proxy3dFlowState {
  return { ...state, [side]: { ...state[side], ...next } }
}

export function proxy3dFlowReducer(
  state: Proxy3dFlowState,
  action: Proxy3dFlowAction,
): Proxy3dFlowState {
  switch (action.type) {
    case 'SELECT_FILE': {
      if (isBusy(state)) return state
      const base = withSide(state, action.side, {
        ...EMPTY_SIDE,
        file: action.file,
        alpha: action.alpha,
      })
      return {
        ...base,
        status: 'editing',
        record: null,
        error: null,
        errorIsConnectivity: false,
      }
    }
    case 'REJECT_FILE':
      if (isBusy(state)) return state
      return {
        ...state,
        status: 'editing',
        record: null,
        error: action.reason,
        errorIsConnectivity: false,
      }
    case 'REMOVE_SIDE':
      if (isBusy(state)) return state
      return {
        ...withSide(state, action.side, { ...EMPTY_SIDE }),
        status: 'editing',
        record: null,
        error: null,
        errorIsConnectivity: false,
      }
    case 'SET_CUTOUT_SETTING': {
      if (isBusy(state)) return state
      const value = clampCutoutSetting(action.setting, action.value)
      return withSide(state, action.side, {
        cutoutSettings: {
          ...state[action.side].cutoutSettings,
          [action.setting]: value,
        },
      })
    }
    case 'RESET_CUTOUT_SETTINGS':
      if (isBusy(state)) return state
      return withSide(state, action.side, {
        cutoutSettings: DEFAULT_CUTOUT_SETTINGS,
      })
    case 'CUTOUT_START': {
      if (isBusy(state)) return state
      const side = state[action.side]
      if (!side.file || side.alpha !== 'none') return state
      // A (re)cut replaces any previous cutout — the component drops the
      // matching blob ref at the same time.
      return {
        ...withSide(state, action.side, {
          cutting: true,
          cutoutError: null,
          cutout: null,
          useAsIs: false,
        }),
        status: 'editing',
        record: null,
        error: null,
        errorIsConnectivity: false,
      }
    }
    case 'CUTOUT_SUCCESS':
      if (!state[action.side].cutting) return state
      return withSide(state, action.side, {
        cutting: false,
        cutout: action.cutout,
        useAsIs: false,
      })
    case 'CUTOUT_FAILURE':
      // Back to the explicit choices — fallbacks stay available.
      if (!state[action.side].cutting) return state
      return withSide(state, action.side, {
        cutting: false,
        cutoutError: action.reason,
      })
    case 'USE_BACK_AS_IS': {
      if (isBusy(state)) return state
      const back = state.back
      if (!back.file || back.alpha !== 'none' || back.cutout) return state
      return withSide(state, 'back', { useAsIs: true, cutoutError: null })
    }
    case 'SET_BACK_ALIGNMENT':
      if (isBusy(state)) return state
      return {
        ...state,
        backAlignment: {
          ...state.backAlignment,
          ...clampBackAlignment(action.patch),
        },
      }
    case 'RESET_BACK_ALIGNMENT':
      if (isBusy(state)) return state
      return { ...state, backAlignment: DEFAULT_BACK_ALIGNMENT }
    case 'UPLOAD_START':
      // 'ready' is allowed too: adjust alignment/cutout, then regenerate.
      if (
        state.status !== 'editing' &&
        state.status !== 'failed' &&
        state.status !== 'ready'
      ) {
        return state
      }
      if (isBusy(state)) return state
      if (!state.front.file) return state
      return {
        ...state,
        status: 'uploading',
        record: null,
        error: null,
        errorIsConnectivity: false,
      }
    case 'UPLOAD_SUCCESS':
      if (state.status !== 'uploading') return state
      return { ...state, status: 'ready', record: action.record, error: null }
    case 'UPLOAD_FAILURE':
      if (state.status !== 'uploading') return state
      return {
        ...state,
        status: 'failed',
        record: null,
        error: action.message,
        errorIsConnectivity: action.connectivity ?? false,
      }
    case 'RESET':
      return INITIAL_PROXY3D_STATE
    default:
      return state
  }
}

// --- Pure selectors ----------------------------------------------------------

export type SideReadiness =
  | 'empty'
  | 'pending-choice'
  | 'cutting'
  | 'ready-original'
  | 'ready-cutout'
  | 'ready-as-is'

/** How far along one side is toward being usable in a generation. */
export function sideReadiness(side: SideState): SideReadiness {
  if (!side.file) return 'empty'
  if (side.cutting) return 'cutting'
  if (side.cutout) return 'ready-cutout'
  if (side.alpha === 'none') {
    return side.useAsIs ? 'ready-as-is' : 'pending-choice'
  }
  return 'ready-original'
}

/**
 * What pressing Generate would produce right now:
 * 'dual' | 'single' | null (blocked — missing front, a side mid-cutout, or a
 * no-alpha side awaiting its explicit choice).
 */
export function plannedGeneration(
  state: Proxy3dFlowState,
): 'dual' | 'single' | null {
  const front = sideReadiness(state.front)
  if (front !== 'ready-original' && front !== 'ready-cutout') return null
  const back = sideReadiness(state.back)
  if (back === 'empty') return 'single'
  if (back === 'pending-choice' || back === 'cutting') return null
  return 'dual'
}

/** All user-facing copy for the Proxy 3D Lab — honesty-guarded by test. */
export const PROXY3D_COPY = {
  panelTitle: 'Image-to-3D proxy',
  intro:
    'Upload a PNG garment image — and optionally a photo of its back — and ' +
    'the local backend builds an experimental proxy 3D preview: a textured, ' +
    'lightly extruded silhouette card exported as a GLB. Transparent ' +
    'backgrounds give the best result.',
  frontLabel: 'Front image',
  backLabel: 'Back image · optional',
  selectButton: 'Choose PNG',
  replaceButton: 'Replace PNG',
  dropHint: 'PNG only, up to 10 MB each. Transparent backgrounds work best.',
  alphaOkNote: 'Transparent background detected.',
  alphaUnknownNote: 'Transparency will be checked by the local backend.',
  submitButton: 'Generate proxy 3D preview',
  submitDualButton: 'Generate dual-sided proxy 3D preview',
  retryButton: 'Try again',
  resetButton: 'Start over',
  uploadingTitle: 'Generating proxy 3D preview…',
  uploadingHint: 'The local backend is building a textured GLB from your images.',
  readyTitle: 'Proxy 3D preview ready',
  metaTitle: 'Generation report',
  metaJobId: 'Job',
  metaSides: 'Sides',
  metaSidesSingle: 'Single-sided (front image only)',
  metaSidesDual: 'Dual-sided (front + back images)',
  metaInput: 'Front image',
  metaBackInput: 'Back image',
  metaMethod: 'Method',
  metaAlphaMask: 'Front alpha mask used',
  metaBackAlphaMask: 'Back alpha mask used',
  metaVertices: 'Vertices',
  metaFaces: 'Faces',
  limitationsLabel: 'Honest limits',
  downloadButton: 'Download result.glb',
  viewerCaption: 'Image-to-3D proxy · experimental preview · drag to orbit',
  viewerLoading: 'Opening GLB preview…',
  viewerFallback:
    'The in-browser preview could not start here. Download the GLB and open ' +
    'it in any glTF viewer instead.',
  rotateHint: 'Rotate the preview to inspect the back side.',
  errorTitle: 'Proxy generation failed',
  backendHint:
    'Make sure the local backend is running (see backend/README.md), then ' +
    'try again.',
  rejectNotPng:
    'That file is not a PNG. Choose a .png image — a transparent background ' +
    'works best.',
  rejectTooLarge:
    'That PNG is over the 10 MB limit for this experimental preview.',
  // --- B3.6 cutout-first (per side since B3.7) ---------------------------
  noAlphaTitle: 'No transparent background detected',
  noAlphaWarning:
    'This image has no transparent background. Generating now will create ' +
    'a flat image card, not a silhouette proxy.',
  noAlphaBackWarning:
    'The back image has no transparent background. Create a cutout, use it ' +
    'as-is, or remove it.',
  cutoutButton: 'Create cutout first',
  flatCardButton: 'Generate flat card anyway',
  flatCardNote: 'The flat card uses the front image only.',
  backUseAsIsButton: 'Use back image without cutout',
  backUseAsIsNote:
    'The uncut back image will be projected onto the front silhouette.',
  backAsIsChosenNote: 'Back image will be used without a cutout.',
  removeBackButton: 'Remove back image',
  cuttingTitle: 'Removing the background locally…',
  cuttingHint:
    'An on-device edge flood fill — nothing is uploaded in this step, and ' +
    'quality varies with the photo background.',
  cutoutReadyTitle: 'Local cutout ready',
  cutoutReadyHint:
    'Background removed on your device. This transparent cutout will be ' +
    'sent instead of the original image.',
  cutoutFailedIntro: 'Local cutout did not work here: ',
  // --- B3.8 cutout tuning + back alignment -------------------------------
  cutoutTuningTitle: 'Cutout tuning',
  cutoutTuningHint:
    'Adjust the local edge flood fill, then recreate the cutout to compare.',
  toleranceLabel: 'Background match tolerance',
  uniformityLabel: 'Background uniformity gate',
  recreateCutoutButton: 'Recreate cutout',
  resetCutoutSettingsButton: 'Reset cutout settings',
  alignTitle: 'Back alignment',
  alignHint:
    'Nudge how the back image sits on the front silhouette, then generate ' +
    'to see it on the proxy.',
  alignScaleLabel: 'Back scale',
  alignOffsetXLabel: 'Back horizontal offset',
  alignOffsetYLabel: 'Back vertical offset',
  alignResetButton: 'Reset alignment',
  alignPreviewNote:
    'Approximate overlay — the local backend aligns by silhouette bounding ' +
    'box, then applies these adjustments.',
  planDualNote: 'Will generate: dual-sided silhouette proxy.',
  planSingleNote:
    'Will generate: single-sided silhouette proxy (front image only).',
  regenerateButton: 'Regenerate proxy 3D preview',
} as const

/** Backend method -> honest, human-readable description. */
export const PROXY3D_METHOD_LABEL: Record<Proxy3dRecord['method'], string> = {
  'extruded-alpha-contour': 'Extruded silhouette card (from the alpha mask)',
  'extruded-alpha-contour-dual':
    'Extruded silhouette card with separate front and back textures',
  'textured-plane': 'Flat textured plane (no usable transparency)',
}

/** Honest verdict shown on the result panel, by backend method. */
export const PROXY3D_RESULT_LABEL: Record<Proxy3dRecord['method'], string> = {
  'extruded-alpha-contour': 'Single-sided silhouette proxy 3D preview',
  'extruded-alpha-contour-dual': 'Dual-sided silhouette proxy 3D preview',
  'textured-plane': 'Flat image card fallback',
}

export const PROXY3D_RESULT_LABEL_DUAL_MANUAL =
  'Dual-sided silhouette proxy 3D preview · manual alignment'

/** The honest verdict for a record, including the manual-alignment variant. */
export function resultLabelFor(record: Proxy3dRecord): string {
  if (
    record.method === 'extruded-alpha-contour-dual' &&
    record.back_alignment?.manual
  ) {
    return PROXY3D_RESULT_LABEL_DUAL_MANUAL
  }
  return PROXY3D_RESULT_LABEL[record.method]
}

/** Compact byte count for the selected-file row ("184.2 KB"). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
