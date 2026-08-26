# Development

Everything needed to go from a fresh clone to a running app and a green test
suite. For *what the code currently does*, see
[`PROJECT_STATUS.md`](PROJECT_STATUS.md).

---

## Prerequisites

| Tool | Version | Required for |
| --- | --- | --- |
| Node | **20.x** | The web app. Pinned in `.nvmrc` and `package.json` `engines`. |
| npm | ships with Node | — |
| Python | **3.12** | Only the experimental backend. |

**Node 22 is the floor, and it is a hard one.** Node 22 shipped a built-in Web
Storage implementation and Node 25 enables it by default. It exists before jsdom
installs its own, and jsdom cannot replace a global Node already owns — so
`localStorage` resolves to Node's object, which is not a `Storage` (no `clear`,
no `setItem`) and every storage test dies with
`TypeError: localStorage.clear is not a function`.

The fix is `--no-experimental-webstorage`, passed from
`test.poolOptions.{forks,threads}.execArgv` in `vite.config.ts` so that
`npm test`, `npx vitest` and an IDE runner all get it. `src/test/setup.ts`
asserts it worked and fails loudly, once, if it ever stops.

**Node 20 and earlier reject that flag** (`bad option`), which is why 22 is the
floor rather than a preference. Verified passing on **24.19.0, 25.8.0 and
26.7.0**.

`.nvmrc` pins 24 (current LTS) for any version manager that reads it (nvm, fnm,
volta, asdf). Without one, install it directly — e.g. `brew install node@24` and
put `$(brew --prefix node@24)/bin` first on `PATH`.

```bash
node -v          # expect v20.x
```

Nothing in the web app requires Python, and nothing in the backend requires
Node. You can work on either alone.

---

## Web app

```bash
npm ci           # exact, lockfile-driven install — prefer this over `npm install`
npm run dev      # http://localhost:5173
```

The dev server needs no configuration. With no `.env.local`, the app runs
entirely in the browser and makes no network requests.

In an empty studio, **Load sample** populates a procedural sample archive so you
can explore without uploading anything.

### Verification gates

Run these individually so a failure names itself. These are exactly the commands
CI runs.

```bash
npm run typecheck    # tsc --noEmit (strict) — src/ AND the api/ Edge functions
npm run lint         # eslint (flat config)
npm test             # vitest run
npm run build        # typecheck + vite build → dist/
```

`npm run test:watch` is available while developing.

`typecheck` runs twice: once against the root `tsconfig.json` (the app) and once
against `tsconfig.api.json` (the Edge functions in `api/`). They are separate
compilation units — one targets the browser bundle, the other a server runtime —
so a single project cannot cover both.

The suite is jsdom-based and deliberately keeps the canvas/image path out of unit
tests — jsdom has no canvas, so decode validation is exercised through a stubbed
`Image`.

---

## Experimental backend

Only needed for the Proxy 3D Lab. The web app never requires it.

### Setup

```bash
python3 -m venv backend/.venv
source backend/.venv/bin/activate          # Windows: backend\.venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r backend/requirements.txt
```

### Run

```bash
python -m uvicorn app.main:app --app-dir backend --port 8000
```

The Vite dev server proxies `/api` to `127.0.0.1:8000`, so with both running the
lab's requests are same-origin and need no CORS configuration.

### Test

```bash
python -m pytest backend      # from the repository root
```

`backend/pytest.ini` sets the rootdir and pythonpath, so this works from the
repository root without any `PYTHONPATH` juggling.

Job output is written under `backend/data/` (gitignored). Override the roots
with `AVATARWARDROBE_PROXY3D_DATA` and `AVATARWARDROBE_JOBS_DATA`.

---

## Environment configuration

Everything is **optional**. Copy `.env.example` to `.env.local` and uncomment
what you want; with none of it set, the app is local-only and network-free.

`.env.local` is gitignored. Never put a real secret in a committed file.

### Client variables (`VITE_`-prefixed — these reach the browser bundle)

| Variable | Default | Effect |
| --- | --- | --- |
| `VITE_API_BASE` | unset | Base URL of the optional Vercel Edge API. Unset ⇒ the app makes no application API calls (the page still fetches Google Fonts). Use your deployment origin so calls are same-origin. |
| `VITE_ANALYZER` | unset | `vision` ⇒ route uploads through the backend vision analyzer. **Also requires `VITE_API_BASE`.** |
| `VITE_CANDIDATES` | unset | `search` ⇒ use the live eBay Browse candidate search. **Also requires `VITE_API_BASE`.** |
| `VITE_ENABLE_EXPERIMENTAL_3D` | unset | `true` ⇒ expose the experimental Proxy 3D Lab. Also needs the local FastAPI backend running. |

Accepted truthy spellings for the 3D flag: `1`, `true`, `on`, `yes` (case- and
whitespace-insensitive). Anything else, including unset, is off.

### Server-only variables (no `VITE_` prefix — never exposed to the client)

Set these in your Vercel project settings, not in a file you commit.

| Variable | Used by | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | `api/analyze.ts` | Required when `VITE_ANALYZER=vision`. |
| `ANALYZE_MODEL` | `api/analyze.ts` | Optional model override. |
| `EBAY_CLIENT_ID` | `api/candidate-search.ts` | With either eBay variable unset the endpoint reports "not configured" and the app falls back to local mock candidates. |
| `EBAY_CLIENT_SECRET` | `api/candidate-search.ts` | — |

> **Before deploying `api/`:** the three Edge functions currently send
> `Access-Control-Allow-Origin: *` with no auth, rate limit, or request-size cap,
> while spending the keys above on every call. See the technical-debt section of
> [`PROJECT_STATUS.md`](PROJECT_STATUS.md#10-technical-debt).

---

## Runtime matrix — which server answers what

Three runtimes, two of which serve paths under `/api`. They are unrelated;
[`ARCHITECTURE.md`](ARCHITECTURE.md#4-backend-architecture) has
the full table.

| Route | `npm run dev` | `vercel dev` / deployment | FastAPI running |
| --- | --- | --- | --- |
| The app itself | ✅ | ✅ | — |
| `api/product-meta`, `api/analyze`, `api/candidate-search` | ❌ not served | ✅ (needs `VITE_API_BASE`) | ❌ |
| `/api/proxy-3d/*` | ✅ proxied to `127.0.0.1:8000` | ❌ | ✅ |
| `/api/jobs/*` | ✅ proxied, but **no frontend calls it** | ❌ | ✅ |

The short version: end-to-end testing of the Edge functions needs `vercel dev` or
a real deployment — `npm run dev` does not run them. The proxy-3D routes are the
opposite: local only.

---

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`:

- **Web (Node 24 LTS)** — `npm ci`, then typecheck, lint, test, build as
  separate steps.
- **Browser (Playwright, chromium)** — `npm run test:e2e`.
- **Backend (Python 3.12)** — install `backend/requirements.txt`, then
  `python -m pytest backend`.

Both jobs use dependency caching and fail on any real gate failure. There are no
`continue-on-error` steps.

---

## Conventions

- **Small, incremental, verified changes.** Run the gates and report real output.
- **Keep the reducer pure.** Ids, timestamps, and events arrive in action
  payloads; `Date.now()` and `crypto` live in the provider's action creators.
- **Render garment images via `getGarmentDisplayImage(garment)`**, never raw
  `imageDataUrl`.
- **Any new blob-ref field must be added to `garmentBlobKeys`** — it is the
  single owned-keys source for both delete-cleanup and the orphan sweep.
- **Use the design tokens** in `src/styles/archive-theme.css`; do not hardcode
  colours.
- **English only** in comments and identifiers.
- **Do not overclaim.** The preview is 2.5D, the default analyzer is a mock, the
  cutout is a flood fill, and the 3D lab is a proxy. `UPLOAD_COPY` in
  `uploadFlow.ts` is guarded by a unit test that enforces this.
