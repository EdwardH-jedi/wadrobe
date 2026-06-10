// Pure state machine for the Proxy 3D Lab upload flow (Track B3), modeled on
// the closet uploadFlow reducer: the reducer is deterministic and side-effect
// free; file handles, object URLs and network calls live in the component.
//
// Status graph:
//   idle -> selected -> uploading -> ready
//                    \-> (reject)     \-> failed -> uploading (retry)
//
// PROXY3D_COPY is the single source of user-facing wording for this flow and
// is guarded by an honesty test (PROXY3D_FORBIDDEN_CLAIM_TERMS): the result
// is always a "proxy 3D preview" / "image-to-3D proxy", never a try-on or a
// fit/size claim.

export type Proxy3dStatus = 'idle' | 'selected' | 'uploading' | 'ready' | 'failed'

/** Mirrors the backend's Proxy3dRecord response (backend/app/main.py). */
export interface Proxy3dRecord {
  job_id: string
  status: 'done'
  method: 'extruded-alpha-contour' | 'textured-plane'
  alpha_mask_used: boolean
  input: {
    width: number
    height: number
    has_alpha: boolean
  }
  mesh: {
    vertices: number
    faces: number
  }
  result_url: string
  limitations: string
  created_at: number
}

export interface SelectedFileMeta {
  name: string
  sizeBytes: number
  /** Object URL for a small 2D thumbnail, or null when unavailable. */
  previewUrl: string | null
}

export interface Proxy3dFlowState {
  status: Proxy3dStatus
  file: SelectedFileMeta | null
  record: Proxy3dRecord | null
  error: string | null
  /** True when the failure looks like the backend being unreachable/down —
   *  gates the "make sure the backend is running" hint so it never shows on
   *  ordinary validation errors the backend itself returned. */
  errorIsConnectivity: boolean
}

export type Proxy3dFlowAction =
  | { type: 'SELECT_FILE'; file: SelectedFileMeta }
  | { type: 'REJECT_FILE'; reason: string }
  | { type: 'UPLOAD_START' }
  | { type: 'UPLOAD_SUCCESS'; record: Proxy3dRecord }
  | { type: 'UPLOAD_FAILURE'; message: string; connectivity?: boolean }
  | { type: 'RESET' }

export const INITIAL_PROXY3D_STATE: Proxy3dFlowState = {
  status: 'idle',
  file: null,
  record: null,
  error: null,
  errorIsConnectivity: false,
}

/** Client-side mirror of the backend's upload byte limit. */
export const MAX_PROXY3D_UPLOAD_BYTES = 10 * 1024 * 1024

export function proxy3dFlowReducer(
  state: Proxy3dFlowState,
  action: Proxy3dFlowAction,
): Proxy3dFlowState {
  switch (action.type) {
    case 'SELECT_FILE':
      // A new file can be picked any time except mid-upload.
      if (state.status === 'uploading') return state
      return {
        status: 'selected',
        file: action.file,
        record: null,
        error: null,
        errorIsConnectivity: false,
      }
    case 'REJECT_FILE':
      if (state.status === 'uploading') return state
      return {
        status: 'idle',
        file: null,
        record: null,
        error: action.reason,
        errorIsConnectivity: false,
      }
    case 'UPLOAD_START':
      // From a fresh selection, or retrying after a failure.
      if (state.status !== 'selected' && state.status !== 'failed') return state
      if (!state.file) return state
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

/** All user-facing copy for the Proxy 3D Lab — honesty-guarded by test. */
export const PROXY3D_COPY = {
  panelTitle: 'Image-to-3D proxy',
  intro:
    'Upload a PNG garment image and the local backend builds an experimental ' +
    'proxy 3D preview — a textured, lightly extruded silhouette card exported ' +
    'as a GLB. A transparent background gives the best result.',
  dropTitle: 'Choose a PNG garment image',
  dropHint: 'PNG only, up to 10 MB. Transparent backgrounds work best.',
  selectButton: 'Choose PNG',
  replaceButton: 'Choose another PNG',
  submitButton: 'Generate proxy 3D preview',
  retryButton: 'Try again',
  resetButton: 'Start over',
  uploadingTitle: 'Generating proxy 3D preview…',
  uploadingHint: 'The local backend is building a textured GLB from your image.',
  readyTitle: 'Proxy 3D preview ready',
  metaTitle: 'Generation report',
  metaJobId: 'Job',
  metaInput: 'Input image',
  metaMethod: 'Method',
  metaAlphaMask: 'Alpha mask used',
  metaVertices: 'Vertices',
  metaFaces: 'Faces',
  limitationsLabel: 'Honest limits',
  downloadButton: 'Download result.glb',
  viewerCaption: 'Image-to-3D proxy · experimental preview · drag to orbit',
  viewerLoading: 'Opening GLB preview…',
  viewerFallback:
    'The in-browser preview could not start here. Download the GLB and open ' +
    'it in any glTF viewer instead.',
  errorTitle: 'Proxy generation failed',
  backendHint:
    'Make sure the local backend is running (see backend/README.md), then ' +
    'try again.',
  rejectNotPng:
    'That file is not a PNG. Choose a .png image — a transparent background ' +
    'works best.',
  rejectTooLarge:
    'That PNG is over the 10 MB limit for this experimental preview.',
} as const

/** "extruded-alpha-contour" -> honest, human-readable label. */
export const PROXY3D_METHOD_LABEL: Record<Proxy3dRecord['method'], string> = {
  'extruded-alpha-contour': 'Extruded silhouette card (from the alpha mask)',
  'textured-plane': 'Flat textured plane (no usable transparency)',
}

/** Compact byte count for the selected-file row ("184.2 KB"). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
