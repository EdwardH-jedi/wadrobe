> **Historical document — not current implementation status.**
> Kept for the reasoning it records. It was accurate when written and has not
> been maintained since. For what the repository actually contains today, see
> [`docs/CURRENT_STATE.md`](../CURRENT_STATE.md).

---

# Repository review — 2026-08-12

Prepared unattended. Nothing was deleted, committed, pushed, or refactored; the only two files created are `README.draft.md` and this file. `README.md` was left untouched.

---

## ⚠️ Must fix before making public

Ranked by what actually costs you something. **No credentials were found anywhere in the repository or in its git history** — see "Clean results" below for what that scan covered.

### 1. An orphan personal photo is committed at the repository root — and it is already pushed

| | |
|---|---|
| File | `IMG_0198.jpg` (369 KB, 1179×1888) |
| Added in | `319b673` "push everything" |
| Present on | `main`, `origin/main`, `eval/cutout-bench` — **already public if the repo is public** |
| Referenced by | nothing — `grep` across all tracked files returns no hits |

EXIF identifies it as an iPhone screenshot (`description=Screenshot`, `datetime=2026:06:29`); no GPS tags appear in the EXIF summary. The content is a product photo of a pair of Vans OTW sneakers — plausibly a test image for the upload flow, so this is a professionalism and repo-hygiene problem rather than a privacy incident. It is the first thing a recruiter sees in the file listing, directly above `README.md`.

**It is in history and on the remote.** Deleting it in a new commit removes it from the working tree but not from history; a genuine purge needs `git filter-repo` and a force-push. Given the content is a sneaker photo, a plain deletion commit is very likely sufficient — I have flagged the distinction rather than deciding it for you.

### 2. The optional serverless routes are wide open — and the fix already exists on an unmerged branch

All three Edge functions on `main` return `Access-Control-Allow-Origin: *`:

- `api/analyze.ts:28`
- `api/product-meta.ts:21`
- `api/candidate-search.ts:27`

`api/analyze.ts` has no authentication, no rate limit, and no request-size cap (verified by reading the whole handler), yet it spends `ANTHROPIC_API_KEY` on every call. If this is ever deployed to Vercel with that key set, anyone who learns the URL can bill your Anthropic account. `api/candidate-search.ts` has the same exposure against your eBay credentials.

**This is a deployment risk, not a leak.** With no `VITE_API_BASE` configured the web app makes no network calls at all, and the keys themselves are correctly server-only (no `VITE_` prefix, read from `process.env`, never in client code) — which is the right design.

The remedy is already written: commit `e15424c` "harden(api): origin allowlist, eBay token cache, per-caller throttle" adds `api/_lib/http.ts` (+228 lines) and rewrites all three routes. It exists **only** on the local branch `thread/api-hardening` and is reachable from neither `main` nor `origin/main`. Merging it is the single highest-value action on this list.

### 3. `.gitignore` gaps that would catch a real secret

`.env.local` exists locally and is correctly ignored — but only incidentally, by the `*.local` rule at `.gitignore:28`. It contains one non-sensitive key (`VITE_CUTOUT`) and **has never been committed** (verified against all refs). The gap is what is *not* covered:

| Path | Status |
|---|---|
| `.env` | **not ignored** |
| `.env.production` | **not ignored** |
| `secrets.json` | **not ignored** |
| `.venv/` (repo root) | **not ignored** — only `backend/.venv/` is |

A single `.env` written at the root today would be staged by `git add .`. Suggested additions: `.env`, `.env.*`, `!.env.example`, `.venv/`.

### Clean results (scanned, nothing found)

- **Secrets across the entire history.** Every git object on every branch and commit (76 commits, 4.8 MB object store) was streamed through a pattern scan for `sk-`/`sk-ant-` keys, AWS `AKIA` ids, GitHub `ghp_`/`github_pat_` tokens, Slack `xox*` tokens, Google `AIza` keys, PEM private-key headers, and Postgres/MySQL/MongoDB/Redis connection strings with embedded credentials. **Zero matches.**
- **Committed `.env` files.** `git ls-files` returns exactly one: `.env.example`, which is a documented template with all values blank. Correct.
- **`node_modules/`, `dist/`, build artefacts.** None tracked; both are correctly ignored and present only in the working tree.
- **Large binaries / datasets.** The largest tracked file is `IMG_0198.jpg` (369 KB, item 1 above); next is `package-lock.json` (164 KB). Nothing else exceeds 62 KB. No datasets or model weights.
- **Personal data in file contents.** A scan of all 204 tracked files for email addresses and phone-number patterns produced only two false positives (a timestamp in `src/lib/storage/assetBlobStore.test.ts:15` and a UUID at `:20`).
- **Personal data in git metadata (informational, not a defect).** Commit authorship exposes three addresses — `edwardhwang1223@gmail.com` (59 commits), `shwa6649@sydney.edu.au` (16), and `sangmyeonglee123@gmail.com` (1, a second contributor). This is normal, unavoidable git behaviour. Flagging it only so the second contributor's presence is a deliberate choice rather than a surprise; if this becomes a portfolio piece, their contribution is worth crediting explicitly.

---

## Needs confirmation — blanks for you to fill

I left these out of `README.draft.md` rather than guess.

1. **The screenshot itself.** `docs/demo.png` does not exist and I was told to produce exactly two files, so the placeholder points at a path you must populate. My recommendation of the **Mirror / Fit Preview** screen is argued from reading the code and the view metadata, **not from a rendered run** — I did not open the app in a browser. Confirm it actually looks the way the code suggests before capturing.
2. **What this is for.** Nothing in the repo states whether this is a portfolio piece, coursework, or a product attempt. My one-sentence summary says "for one person cataloguing their own wardrobe", which is derived from the feature set, not from a stated goal. Correct it if wrong — it is the first line a recruiter reads.
3. **Licence.** There is no `LICENSE` file and no licence field in `package.json`. A public repo with no licence is legally "all rights reserved", which discourages the reading you presumably want.
4. **Live demo URL.** `.env.example` references a Vercel deployment pattern, but no deployed URL appears anywhere in the repo. If one exists, it belongs at the top of the README — it is worth more than any screenshot.
5. **Attribution for the second contributor.** One commit is authored by `smyeong123`. Unclear whether to credit them in the README.
6. **Whether the vision path has ever run end-to-end.** The code is complete and unit-tested, but tests exercise the parsing seam with fixtures; I have no evidence that a real Anthropic call has ever succeeded through `api/analyze.ts`. I made no claim either way.
7. **Performance, bundle-size targets, user counts.** No such data exists in the repo. The only numbers in the README are ones I measured myself (test counts, bundle sizes from an actual build).
8. **`eval/`** — untracked work-in-progress from an earlier session in this repo (a cutout benchmark harness). Deliberately omitted from the README; decide whether it ships or stays local.

### What I verified, and how

Everything numeric in `README.draft.md` comes from a command I ran:

| Claim | Evidence |
|---|---|
| 433 tests / 55 files pass | `npm test` on Node 20.20.2 — `Test Files 55 passed, Tests 433 passed`, 7.62 s |
| 65 backend tests pass | `backend/.venv/bin/python -m pytest -q` — `65 passed`, 0.33 s |
| Strict typecheck passes | `npm run typecheck` (`tsc --noEmit`), exit 0 |
| Lint passes | `npx eslint src api eslint.config.js vite.config.ts`, exit 0 |
| Build succeeds; bundle split | `vite build` to a scratch directory (your `dist/` was **not** touched) — main `index-*.js` 282.57 kB, `three.module-*.js` 732.83 kB as a separate lazy chunk |
| Dev server serves | `npm run dev` → `curl localhost:5173` → HTTP 200, Vite 6.4.3 |
| Node 25 breaks tests | `npx vitest run src/lib/storage/localStorageFallback.test.ts` on v25.8.0 — 14/14 fail, `TypeError: localStorage.clear is not a function` |
| three.js is lazy | single `import('three')` at `src/components/avatar/GlbViewer.tsx:42`, corroborated by the build's chunk split |

One caveat: `npm run lint` **fails from a clean checkout of your working tree** — but only on `.remember/tmp/last-ndc.ts`, a session artefact that is git-ignored and would not exist in a clone. `eslint.config.js:9` ignores only `dist`, `node_modules`, `coverage`. Adding `.remember` there costs one line and removes a confusing local failure.

---

## The three biggest weaknesses

### 1. The root directory reads as a working folder, not a project — and the README is stale (~1–2 hours)

Nineteen files sit at the repository root, nine of them planning documents (`PLAN.md`, `MASTER_SCOPE_ROADMAP.md`, `PROGRESS_REPORT.md`, `AVATAR_VISUAL_PLAN.md`, `track-b4a-jobs-api.md`, `vision-api-integration.md`, `vision-step2-consent-gate.md`, `AGENTS.md`, `CLAUDE.md`), plus the orphan JPEG. These read as internal process notes, and their presence at the top level makes the repo look mid-construction.

Worse, the current `README.md` actively contradicts the code: it says "makes no real AI/Vision API calls yet" and "No backend" while `api/analyze.ts` and `backend/` both exist, and it advertises "Phases 1–7" against a codebase that has shipped through Phase 12.5 plus a Track B avatar lab. A recruiter who reads the README and then the file tree concludes the documentation is not maintained.

**Fix:** move the planning docs into `docs/`, delete the JPEG, promote `README.draft.md`. Mostly mechanical.

### 2. No CI, and no Node version pin (~1 hour)

498 tests pass, which is genuinely the strongest signal in this repository — and nothing surfaces that. There is no `.github/` directory, so no badge, no green check on any commit, and no protection against a regression. Compounding it, `package.json` declares no `engines` field while the suite fails on newer Node (verified failing on v25.8.0; passing on v20.20.2 — the versions in between were not tested). A reviewer who clones this on current Node runs `npm test`, watches it fail, and forms a conclusion in about forty seconds.

**Fix:** add `"engines": { "node": ">=20 <21" }` and a GitHub Actions workflow running typecheck, lint, test and build on Node 20. This is the highest return-on-effort item on the whole list — it converts invisible work into the first thing a visitor sees.

### 3. Security hardening is written but stranded on an unmerged branch (~1–2 hours)

The wide-open CORS described above is not an oversight you have failed to notice — you already fixed it in `e15424c`, and the fix has sat unmerged on `thread/api-hardening` while `main` carries the vulnerable version. There are six unmerged `thread/*` branches in this repository. From the outside, only `main` is visible, so the work reads as absent.

**Fix:** merge or cherry-pick `thread/api-hardening`, re-run the suite, and triage the other five branches — merge, or delete them so the branch list stops implying abandoned work.

---

## First impression, bluntly

A recruiter opening this repository sees a stale README that undersells the project, nineteen root-level files including a loose iPhone screenshot of a pair of sneakers, six unmerged branches, and no CI badge — and forms the impression of an abandoned personal experiment within thirty seconds. That impression is wrong, which is what makes it expensive. Underneath is a strict-TypeScript codebase of roughly 19,000 lines across 139 files with 498 passing tests, a genuinely well-reasoned storage layer that degrades through three tiers instead of failing, careful boundaries around the optional network paths, and a documented refusal to overclaim what the app does — the code repeatedly insists in its own comments that the preview is 2.5D and the classifier is a mock, which is a discipline most portfolio projects do not show. The gap between the substance and the shopfront is almost entirely presentational, and closing it is a few hours of work, not a rewrite. Fix the root directory, merge the hardening branch, and add a CI badge, and this stops looking like a scratch folder and starts looking like the engineering it actually contains.
