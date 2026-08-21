> **Historical document — not current implementation status.**
> Kept for the reasoning it records. It was accurate when written and has not
> been maintained since. For what the repository actually contains today, see
> [`docs/PROJECT_STATUS.md`](../PROJECT_STATUS.md).

---

# AvatarWardrobe — 진행 상황 보고서

> 작성일: 2026-06-27 · 작성 목적: 여러 에이전트/터미널 병렬 작업을 위한 현황 스냅샷
> 기준 커밋: `9e094b0 first push` (이후 모든 변경은 **uncommitted 작업 트리** 상태)

---

## 0. 한 줄 요약

두 트랙(Track A 옷장 / Track B 아바타 랩)이 **계획 문서상 대부분 완료**됐고, 그
구현이 **아직 한 번도 커밋되지 않은 채 작업 트리에 통째로 쌓여 있다.** 프론트엔드
테스트는 378개 전부 green이지만, **백엔드 테스트는 이 머신에 `trimesh`가 설치되지
않아 아직 검증되지 않았다.** 지금 가장 시급한 일은 *새 기능*이 아니라 **이 거대한
uncommitted 덩어리를 검증 → 논리 단위로 쪼개 커밋**하는 것이다.

---

## 1. 커밋 상태 (가장 중요)

- 마지막 커밋: `9e094b0 first push`
- 이후 변경: **23개 파일 수정 + 26개 신규 파일(untracked)** = 단일 거대 변경 더미
- 즉, PLAN.md(Track A Phase 1–5)와 AVATAR_TRACK.md(B1–B3.9)가 "완료"로 표시돼 있고
  실제 코드도 트리에 있지만, **git 히스토리에는 아무것도 분리·기록돼 있지 않다.**

### 작업 트리에 들어와 있는 신규 파일(요약)

| 영역 | 신규 파일 | 대응 계획 |
|---|---|---|
| Track A · 비전 | `src/lib/ai/createAnalyzer.ts`, `visionAnalysis.ts`, `visionConsent.ts`, `backendClient.ts` (+각 `.test`) | PLAN Phase 2·4 + `vision-step2-consent-gate.md`(동의 게이트) |
| Track A · 제품매칭 | `src/lib/productMatch/{fetchProductMeta,productMetaParse,urlGuard}.ts` (+test) | PLAN Phase 3 (URL prefill) |
| Track A · 출처/저장 | `src/lib/ai/garmentProvenance.test.ts`, `src/lib/storage/purchaseMetadataPersistence.test.ts` | PLAN Phase 1 |
| Track A · 서버리스 | `api/` (Vercel 함수 디렉터리) | PLAN Phase 2A/3/4 |
| Track B · 백엔드 | `backend/app/jobs.py`, `backend/app/pipeline/` (`interfaces`,`dummy`,`runner`,`mannequin`,`fitter`), `backend/tests/{test_jobs,test_mannequin,test_fitter}.py` | AVATAR_TRACK B4a·**B4b·B5 fitter까지** |
| 계획 문서 | `track-b4a-jobs-api.md`, `vision-api-integration.md`, `vision-step2-consent-gate.md` | 작업 지시서(루트) |

> 주의: 비전 구현 파일명이 지시서(`visionGarmentAnalysis.ts`/`garmentAnalyzer.ts`)와
> 다르게 실제로는 `visionAnalysis.ts`/`createAnalyzer.ts`로 들어왔다. 문서와 코드의
> 이름 차이를 인지하고 grep할 것.

> 주의 2: 백엔드 파이프라인이 지시서(B4a = placeholder 박스)보다 **앞서 있다.**
> `mannequin.py`(B4b 절차적 마네킹)와 `fitter.py`(B5 옷 합성)까지 트리에 존재한다.
> AVATAR_TRACK.md의 B4/B5 "Not started" 표기는 **오래된 상태**다(코드가 먼저 나감).

---

## 2. Track A — 옷장 레이어 (PLAN.md 기준)

`PLAN.md`의 5개 Phase가 전부 `[x]` 완료 표기 + 코드 트리에 존재:

| Phase | 내용 | 상태 |
|---|---|---|
| 1 | `GarmentItem`에 구매 메타데이터(material/size/price/currency/subtype/purchasedAt/retailer) + 분석 출처(confidence/source/userEdited) 옵셔널 필드. 하위호환 파서. | ✅ 코드 존재 · FE 테스트 green |
| 2 | 백엔드 결정 = **2A(Vercel 서버리스)**. provider seam 배선(`createAnalyzer` 팩토리). env 미설정 시 mock. | ✅ |
| 3 | 제품 URL prefill — `api/product-meta` + `productMatch/`(JSON-LD/OG 파싱, SSRF 가드). | ✅ |
| 4 | 실 비전 분류기 — `visionAnalysis.ts`, `VITE_ANALYZER=vision`+`VITE_API_BASE`로 env-gated, **기본 off**. 실패 시 mock 폴백. | ✅ |
| 4.5 | 비전 **동의 게이트**(`visionConsent.ts`, 세션 1회 sessionStorage) + cloud 카피 분기 + positive honesty 테스트. | ✅ 코드+테스트 존재 |
| 5 | cutout → 마네킹 z-order 연결(`garmentLayout.ts` `getLayerZIndex`). | ✅ |

**불변 규칙(유지 확인됨):** mock 기본값, 이름 필수 게이트, UPLOAD_COPY 정직성 테스트,
순수 reducer, 로컬 저장. env 미설정 시 네트워크 호출 0.

---

## 3. Track B — 아바타 랩 (docs/AVATAR_TRACK.md 기준)

| Phase | 내용 | 문서 표기 | 실제 트리 |
|---|---|---|---|
| B1 | 두-트랙 문서 베이스라인 | ✅ Done | ✅ |
| B2 | PNG → proxy-3D GLB 스파이크(`backend/`, FastAPI, `/api/proxy-3d`) | ✅ Done | ✅ |
| B3 | 프론트 Proxy 3D Lab 뷰(`'lab'`), three.js 동적 임포트 뷰어 | ✅ Done | ✅ |
| B3.5 | 검증 패스(뷰어 견고성·PNG 엣지·오프라인) | ✅ Done | ✅ |
| B3.6 | cutout-first UX(투명도 없는 PNG는 조용히 flat-card로 안 감) | ✅ Done | ✅ |
| B3.7 | 앞/뒤 듀얼 이미지 → 듀얼 텍스처 GLB | ✅ Done | ✅ |
| B3.8 | cutout 튜닝 슬라이더 + 수동 back 정렬 | ✅ Done | ✅ |
| B3.9 | 옷장 아이템 ↔ proxy 3D 브릿지(`proxy3dPreview` 링크) | ✅ Done | ✅ |
| **B4a** | 비동기 jobs API(`/api/jobs`) + 5개 pipeline interface + dummy | 문서상 Not started | ⚠️ **코드 트리에 존재**(jobs.py, pipeline/) |
| **B4b** | 절차적 trimesh 마네킹 빌더 | 문서상 Not started | ⚠️ **`mannequin.py` 존재** |
| **B5** | 옷 GLB bbox 합성(IOutfitFitter) | 문서상 Not started | ⚠️ **`fitter.py` 존재** |
| B6 | 옷장 브릿지(사이즈/소재/리세일 텍스트) | Not started | ❌ |

➡️ **AVATAR_TRACK.md의 phase 표가 코드보다 뒤처져 있다.** B4·B5 구현이 들어왔으므로
표를 갱신해야 한다(검증 후).

---

## 4. 검증 상태 (실제 실행 결과)

```
프론트엔드:  npm test       →  44 files, 378 tests, ALL PASS (10.8s)
백엔드:      pytest         →  65 tests, ALL PASS (0.73s)  [backend/.venv]
타입체크:    npm run typecheck →  PASS (tsc --noEmit, 에러 0)
린트:        npm run lint      →  PASS (clean, 경고 0)
빌드:        npm run build     →  PASS (103 modules, 1.37s)
```

**전체 검증 매트릭스 5/5 green** (2026-06-27 세션). 거대 uncommitted 더미가 모든
게이트를 통과 — 분리 커밋해도 안전한 상태.

빌드 청크 분리 확인: `three.module`(732kB)·`GLTFLoader`·`OrbitControls`가 메인
앱 청크(`index` 273kB)와 **별도 청크**로 떨어졌다 → CLAUDE.md의 "three는 lab GLB
뷰어의 동적 임포트로만 로드, Track A 번들 무영향" 불변식이 **실제로 유지됨**.
(500kB 초과 경고는 lazy three 청크에 대한 정보성 경고일 뿐 — 차단 아님.)

- 프론트엔드는 **신뢰 가능하게 green.** 비전/동의/productMatch/proxy3d 브릿지 테스트 포함.
- 백엔드도 **green 확인됨** (2026-06-27, `backend/.venv`에 의존성 사전 설치돼 있음).
  파일별 분포:

  | 테스트 파일 | 개수 | 대응 |
  |---|---|---|
  | `test_pipeline.py` | 20 | proxy-3d 파이프라인 (B2) |
  | `test_api.py` | 20 | proxy-3d 라우트 (B2/B3.x) |
  | `test_jobs.py` | 12 | **B4a** jobs API |
  | `test_mannequin.py` | 7 | **B4b** 절차적 마네킹 |
  | `test_fitter.py` | 6 | **B5** 옷 GLB 합성 |

  ➡️ B4a·B4b·B5 코드가 **실제로 동작하며 테스트로 보증됨**(보고서 §3의 의문 해소).
- 알려진 경고 2건(둘 다 비차단):
  1. `StarletteDeprecationWarning` — fastapi testclient의 httpx 사용(의존성 측, 무해).
  2. `app/pipeline/fitter.py:58` — `Scene.dump(concatenate=True)`가 trimesh에서
     deprecated(2025-04 제거 예정 표기). **우리 코드** → 추후 `Scene.to_geometry()`로
     교체 권장(현재는 동작·테스트 green).
- `npm run typecheck`, `npm run lint`, `npm run build`는 이번 세션에서 미실행
  (보고서 작성 범위). 커밋 전 실행 권장.

---

## 5. 지금 가장 중요한 작업 (우선순위)

1. **백엔드 의존성 설치 + pytest 검증** — B4/B5 코드가 실제로 도는지 모른다. 0순위.
2. **typecheck / lint / build 풀 검증** — 거대 변경 더미를 커밋하기 전 게이트.
3. **거대 uncommitted 더미를 논리 단위로 분리 커밋** — 현재는 전부 한 덩어리.
   최소 분할 예시: (a) Track A Phase 1 데이터모델, (b) Phase 2 seam, (c) Phase 3
   productMatch, (d) Phase 4 비전, (e) Phase 4.5 동의게이트, (f) Track B B4a jobs,
   (g) B4b mannequin, (h) B5 fitter.
4. **문서 동기화** — AVATAR_TRACK.md phase 표(B4/B5 상태), PLAN.md(Phase 4.5 동의
   게이트 반영), CLAUDE.md §0(트랙 상태 최신화).

---

## 6. 멀티 에이전트 / 터미널 분할 전략

> 핵심 제약: 지금은 **전부 한 작업 트리 한 브랜치**에 섞여 있다. 병렬 작업을 안전하게
> 하려면 먼저 #5의 1–3을 끝내 깨끗한 베이스라인을 만든 뒤 분기하는 게 맞다. 아래는
> 베이스라인 정리 후의 병렬화 지도.

### 의존성/충돌 경계

- **Track A(`src/`, `api/`)** 와 **Track B(`backend/`)** 는 파일이 겹치지 않는다 →
  서로 다른 에이전트에 줘도 **충돌 없음**. 가장 깨끗한 병렬 경계.
- 단 두 트랙 모두 `vite.config.ts` dev proxy(`/api`)를 공유한다. 비전(Vercel 함수)과
  proxy-3d(FastAPI)가 같은 `/api` 경로를 쓰므로 **dev 라우팅은 한 사람이 조정**.

### 권장 병렬 트랙 (각각 별도 터미널/워크트리/에이전트)

| 트랙 | 담당 범위 | 건드리는 디렉터리 | 충돌 위험 |
|---|---|---|---|
| **T1 · 베이스라인 정리** | 백엔드 의존성 설치·pytest, typecheck/lint/build, 더미 분리 커밋 | 전역(읽기) + git | 선행 작업 — **이게 끝나야 나머지 분기** |
| **T2 · 백엔드 아바타** | B4a jobs API 검증 → B4b 마네킹 품질 → B5 fitter 합성 | `backend/` 단독 | 낮음(트랙 격리) |
| **T3 · 프론트 아바타 랩 연동** | `/api/jobs` 흐름을 Avatar Lab 뷰에 배선(B5 프론트) | `src/components/avatar/`, `studio/views.ts` | 중(views.ts) |
| **T4 · 비전 라이브 검증** | `vercel dev`로 실제 비전 켜고 동의 게이트·카피 E2E | `api/`, `src/lib/ai/`, `.env.local` | 낮음 |
| **T5 · 문서 동기화** | AVATAR_TRACK 표·PLAN·CLAUDE §0 최신화 | `docs/`, 루트 `.md` | 낮음(문서만) |

권장 격리 수단: `git worktree`로 트랙별 작업 폴더 분리(각 워크트리 = 각 터미널 =
각 에이전트). Track A/Track B는 디스크상 파일이 겹치지 않아 worktree 병합 충돌이 거의 없다.

### 병렬화하면 안 되는 것

- 동일 베이스라인 정리(#5의 1–3)는 **단일 에이전트가 순차로** — 거대 더미를 두 명이
  동시에 커밋 분리하면 인덱스가 꼬인다.
- `vite.config.ts`, `eslint.config.js`, `CLAUDE.md` 같은 **공유 설정 파일**은 한 트랙만
  소유하게 지정.

---

## 7. 다음 결정이 필요한 지점

- B4/B5 코드가 이미 들어왔는데 **검증·커밋이 안 된 상태**다. 이걸 (a) 지금 검증·커밋해
  공식화할지, (b) 일부 되돌리고 AVATAR_TRACK의 점진 phase 순서로 다시 갈지 — **사용자
  결정 필요.** 보고서는 현 상태를 (a) 쪽(이미 구현됨)으로 기술했다.
- 비전을 실제로 켤 거면 `ANTHROPIC_API_KEY`(서버 전용, `VITE_` 금지)와 Vercel 배포
  라우팅을 정해야 한다.

---

## 부록 · 빠른 명령어

```bash
# 프론트엔드 (green 확인됨)
npm test && npm run typecheck && npm run lint && npm run build

# 백엔드 (미검증 — 먼저 의존성)
python -m venv backend/.venv && source backend/.venv/Scripts/activate   # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
cd backend && pytest -q

# 현황 파악
git status --porcelain          # 26 untracked + 23 modified
git diff --stat HEAD
```
