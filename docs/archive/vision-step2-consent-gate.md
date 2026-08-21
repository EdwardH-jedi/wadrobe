> **Historical document — not current implementation status.**
> Kept for the reasoning it records. It was accurate when written and has not
> been maintained since. For what the repository actually contains today, see
> [`docs/PROJECT_STATUS.md`](../PROJECT_STATUS.md).

---

# The Archive — Vision Step 2: 동의 게이트 + positive 테스트

전제(보고로 확정): vision seam은 이미 채택됐고, cloud 카피 분기("configured server로 전송")는
이미 정직하게 구현돼 있다. **카피는 건드리지 않는다.** 남은 갭 2개만 닫는다.

- 갭 1 — 전송 전 **명시적 동의 게이트** 부재(고지는 있으나 사용자가 통과시키는 단계 없음).
- 갭 2 — vision일 때 cloud 고지가 실제 렌더된다는 **positive 테스트** 부재(현재는 금지어 부재만 보장).

확정 방향: **세션 1회 동의**(sessionStorage, 탭 닫으면 리셋) + **썸네일 생성 후·서버 전송 직전** 게이트.
mock 경로와 "이미 이 세션에 동의함" 경로는 게이트를 거치지 않는다(기존 동작 보존).

흐름:
```
SCAN_START → processImageFile(로컬 썸네일)
   ├─ kind==='mock'  ............................→ 분석(=mock, 전송 없음) → SUGGESTED
   ├─ kind==='backend' && 세션동의 있음 .........→ 분석(전송) → SUGGESTED
   └─ kind==='backend' && 세션동의 없음 .........→ consent 게이트
            ├─ 동의 → grantVisionConsent() → 분석(전송) → SUGGESTED
            └─ 취소 → idle (pendingInput 폐기, 사진 데이터 메모리에서 제거)
```

---

## 1. 새 파일 — `src/lib/ai/visionConsent.ts`

세션 스코프 동의. storage 없으면(jsdom/프라이빗) 항상 false → 다시 묻는다(절대 yes로 가정 안 함).

```ts
// Session-scoped consent for sending a photo to the vision server. Stored in
// sessionStorage so it resets when the tab closes — an honest "this session
// only" gate, not a permanent opt-in. No storage (jsdom / private mode) → the
// gate re-shows; we never assume consent we can't read.
const CONSENT_KEY = 'archive:vision-consent'

export function hasVisionConsent(): boolean {
  try {
    return sessionStorage.getItem(CONSENT_KEY) === 'granted'
  } catch {
    return false
  }
}

export function grantVisionConsent(): void {
  try {
    sessionStorage.setItem(CONSENT_KEY, 'granted')
  } catch {
    // Storage unavailable — consent just won't persist; the gate re-shows.
  }
}
```

테스트 `visionConsent.test.ts`:
```ts
import { afterEach, describe, expect, it } from 'vitest'
import { hasVisionConsent, grantVisionConsent } from './visionConsent'

afterEach(() => {
  try { sessionStorage.clear() } catch { /* no storage */ }
})

describe('visionConsent', () => {
  it('is false before granting', () => {
    expect(hasVisionConsent()).toBe(false)
  })
  it('is true after granting, within the session', () => {
    grantVisionConsent()
    expect(hasVisionConsent()).toBe(true)
  })
})
```

---

## 2. 수정 — `src/components/closet/uploadFlow.ts` (pure reducer)

`consent` status 하나와 전이 3개를 추가한다. `crop`/`cutout`을 끼운 것과 동일한 패턴.

`UploadStatus` 유니온에 추가:
```ts
  | 'consent'
```

`UploadAction` 유니온에 추가:
```ts
  /** vision + 미동의: 썸네일은 만들었지만 전송 전 동의를 받는다. */
  | { type: 'NEED_CONSENT' }
  /** 동의함: 다시 scanning으로 — 컴포넌트가 보관한 입력으로 분석을 재개한다. */
  | { type: 'GRANT_CONSENT' }
  /** 거부: 업로드를 처음으로 되돌린다. */
  | { type: 'DENY_CONSENT' }
```

reducer 케이스 추가(`SCAN_START` 근처):
```ts
    case 'NEED_CONSENT':
      if (state.status !== 'scanning') return state
      return { ...state, status: 'consent' }

    case 'GRANT_CONSENT':
      if (state.status !== 'consent') return state
      return { ...state, status: 'scanning' }

    case 'DENY_CONSENT':
      if (state.status !== 'consent') return state
      return initialUploadState
```

> reducer는 여전히 순수하다. 무거운 입력(base64 썸네일)은 state에 넣지 않고 컴포넌트 ref에 보관한다 —
> garment를 ARCHIVE_START로 밖에서 만들어 넘기는 기존 컨벤션과 동일.

---

## 3. 수정 — `UPLOAD_COPY`에 consent 카피 추가

기존 cloud 카피와 같은 톤. 금지어(AI/recognize/real-time/try-on) 회피, "configured server" 정직.

```ts
  consentEyebrow: 'Before scanning',
  consentTitle: 'Send this photo to draft details?',
  consentBody:
    'Your downscaled photo is sent to a configured server to draft a starting point — just this session. You confirm or edit every field next.',
  consentConfirm: 'Send & scan',
  consentCancel: 'Cancel',
```

`UPLOAD_COPY`에 들어가므로 기존 honesty 루프(`Object.values(UPLOAD_COPY)` 순회)가 자동으로 금지어 검사한다.

---

## 4. 수정 — 스캔 카피 선택을 순수 함수로 분리 (갭 2의 토대)

지금은 컴포넌트가 `analyzerKind`로 cloud/device 카피를 직접 고른다. 그 선택을 순수 함수로 빼서
positive하게 테스트 가능하게 만든다. `uploadFlow.ts`(또는 카피가 있는 모듈)에 추가:

```ts
export type AnalyzerKind = 'mock' | 'backend'

export interface ScanCopy {
  eyebrow: string
  title: string
  badge: string
  body: string
}

/** backend(vision)면 서버 전송을 고지하는 cloud 카피, mock이면 on-device 카피. */
export function scanCopyForKind(kind: AnalyzerKind): ScanCopy {
  if (kind === 'backend') {
    return {
      eyebrow: UPLOAD_COPY.scanEyebrowCloud,
      title: UPLOAD_COPY.scanTitleCloud,
      badge: UPLOAD_COPY.scanBadgeCloud,
      body: UPLOAD_COPY.scanBodyCloud,
    }
  }
  return {
    eyebrow: UPLOAD_COPY.scanEyebrow,
    title: UPLOAD_COPY.scanTitle,
    badge: UPLOAD_COPY.scanBadge,
    body: UPLOAD_COPY.scanBody,
  }
}
```

그리고 `UploadGarmentModal`의 스캔 카피 렌더를 이 함수 호출로 교체한다(직접 분기 제거).
키 이름(`scanEyebrowCloud` 등)은 현재 코드의 실제 키에 맞춘다.

---

## 5. 수정 — `UploadGarmentModal.tsx` 통합

스캔 시작부를 동의 분기로 감싼다. 썸네일까지는 로컬이라 항상 만들고, **전송만** 게이트한다.

```ts
import { hasVisionConsent, grantVisionConsent } from '../../lib/ai/visionConsent'
// pendingInput: 동의 대기 동안 분석 입력을 보관(컴포넌트 ref).
const pendingInputRef = useRef<GarmentAnalysisInput | null>(null)

async function startScan(file: File) {
  const kind = selectAnalyzerKind() // 기존 함수
  dispatch({ type: 'SCAN_START' })

  const processed = await processImageFile(file) // 로컬 다운스케일, 전송 아님
  const input: GarmentAnalysisInput = {
    fileName: file.name,
    fileSizeBytes: file.size,
    dominantColorHex: processed.dominantColorHex,
    imageDataUrl: processed.dataUrl,
  }

  if (kind === 'backend' && !hasVisionConsent()) {
    pendingInputRef.current = input
    dispatch({ type: 'NEED_CONSENT' })
    return // 동의 대기
  }
  await analyzeAndSuggest(input)
}

// 분석 + SUGGESTED dispatch (기존 로직을 이 헬퍼로 묶음)
async function analyzeAndSuggest(input: GarmentAnalysisInput) {
  const guess = await runGarmentAnalysis(input)
  // ...기존 draft 생성 + dispatch({ type: 'SUGGESTED', draft, guess })
}

function onConsentConfirm() {
  grantVisionConsent()
  dispatch({ type: 'GRANT_CONSENT' })
  const input = pendingInputRef.current
  pendingInputRef.current = null
  if (input) void analyzeAndSuggest(input)
}

function onConsentCancel() {
  pendingInputRef.current = null // 사진 데이터 폐기
  dispatch({ type: 'DENY_CONSENT' })
}
```

consent UI: `status === 'consent'`일 때 모달에 `consentTitle/consentBody` + `[consentConfirm]`/`[consentCancel]`
버튼 렌더. 기존 crop/cutout 단계 UI 패턴 재사용.

---

## 6. 테스트 — 갭 1 + 갭 2 잠금

reducer 전이(`uploadFlow.test.ts`에 추가):
```ts
it('scanning → consent → scanning when consent is granted', () => {
  let s = uploadReducer(initialUploadState, { type: 'SCAN_START' })
  s = uploadReducer(s, { type: 'NEED_CONSENT' })
  expect(s.status).toBe('consent')
  s = uploadReducer(s, { type: 'GRANT_CONSENT' })
  expect(s.status).toBe('scanning')
})

it('consent → idle when denied', () => {
  const s = uploadReducer(
    { ...initialUploadState, status: 'consent' },
    { type: 'DENY_CONSENT' },
  )
  expect(s.status).toBe('idle')
})
```

positive 카피(갭 2 — `uploadFlow.test.ts`에 추가):
```ts
it('backend kind surfaces the server-transmission notice', () => {
  const copy = scanCopyForKind('backend')
  expect(copy.body).toBe(UPLOAD_COPY.scanBodyCloud)
  expect(copy.body).toMatch(/server/i) // positive: 전송 고지가 실제로 존재
})

it('mock kind keeps the on-device line', () => {
  expect(scanCopyForKind('mock').body).toBe(UPLOAD_COPY.scanBody)
})

it('every scan copy and consent copy avoids forbidden claims', () => {
  const copies = [
    ...Object.values(scanCopyForKind('mock')),
    ...Object.values(scanCopyForKind('backend')),
    UPLOAD_COPY.consentTitle,
    UPLOAD_COPY.consentBody,
  ]
  for (const v of copies) expect(v).not.toMatch(FORBIDDEN_CLAIM_TERMS)
})
```

---

## 7. 검증

```bash
npm run typecheck
npm test     # 기존 371 + 신규(consent reducer/positive copy/visionConsent)
npm run lint
```

mock 경로(기본)는 consent를 거치지 않으므로 기존 동작·테스트가 그대로 green이어야 한다.
그 뒤 `VITE_ANALYZER=vision` + `VITE_API_BASE` 켜고 실제 업로드 → 첫 전송 시 동의 게이트가 1회 뜨고,
같은 세션 두 번째 업로드부턴 안 뜨는지 확인.

---

## Claude Code 프롬프트

```
The Archive에 vision Step 2(동의 게이트 + positive 카피 테스트)를 구현한다.
첨부 vision-step2-consent-gate.md를 따르되, 현재 코드의 실제 키/시그니처에 맞춰 통합해라.
범위:
- 새 파일: src/lib/ai/visionConsent.ts (+ test).
- uploadFlow.ts: status 'consent' + NEED_CONSENT/GRANT_CONSENT/DENY_CONSENT 전이 추가(reducer는 순수 유지).
- UPLOAD_COPY: consent 카피 4개 추가. cloud 카피는 절대 수정하지 마라(이미 정직함).
- scanCopyForKind(kind) 순수 함수 분리 + UploadGarmentModal의 스캔 카피 렌더를 이 함수로 교체.
- UploadGarmentModal: 썸네일 생성 후 kind==='backend' && !hasVisionConsent()이면 NEED_CONSENT로
  게이트하고, 동의 시 grantVisionConsent() 후 보관한 입력으로 분석 재개. 취소 시 입력 폐기 + idle.
  mock 경로와 이미 동의한 세션은 게이트를 거치지 않는다(기존 동작 보존).
- 테스트: reducer 전이 2개 + positive 카피 3개 + visionConsent 2개.
규칙: 세션 1회 동의(sessionStorage), storage 없으면 false(다시 물음). 전송 직전에만 게이트.
끝나면 typecheck/test/lint 셋 green 확인하고 diff만 보여줘. 커밋하지 마.
```

이게 들어오면 vision 트랙은 정직성까지 완결된다. 그다음은 Track B(Avatar Lab B4)로.
