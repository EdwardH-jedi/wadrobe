// Ambient typing for Vite's `import.meta.env`. The project's tsconfig restricts
// `types` to "node" (no vite/client), so we declare just the env shape the app
// reads here. Custom variables must be prefixed `VITE_` to be exposed to the
// client bundle.
interface ImportMetaEnv {
  /**
   * Base URL of the OPTIONAL Vercel serverless API (Track A, Phase 2A). Unset or
   * blank by default — when empty the app stays mock-only and makes no network
   * calls. Phase 3 attaches the real `/api/*` routes behind this base.
   */
  readonly VITE_API_BASE?: string
  /**
   * OPTIONAL analyzer opt-in (Phase 4). Set to `'vision'` *and* configure
   * `VITE_API_BASE` to route uploads through the backend vision provider; unset
   * (the default) keeps the local mock analyzer and sends no photo anywhere.
   */
  readonly VITE_ANALYZER?: string
  /**
   * OPTIONAL reference-candidate source opt-in (Wardrobe Flow C). Set to
   * `'search'` to use the live text-search provider (wired in C3); unset (the
   * default) keeps the deterministic local mock candidates and makes no network
   * calls.
   */
  readonly VITE_CANDIDATES?: string
  readonly MODE: string
  readonly DEV: boolean
  readonly PROD: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
