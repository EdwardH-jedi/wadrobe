> **Historical document — not current implementation status.**
> Kept for the reasoning it records. It was accurate when written and has not
> been maintained since. For what the repository actually contains today, see
> [`docs/CURRENT_STATE.md`](../CURRENT_STATE.md).

---

# The Archive — Vision API 통합 (Step 1)

목표: 3번 "옷 분석" seam의 `runGarmentAnalysis`를 **flag로 분기**해서, 켜지면 Claude vision으로
실제 사진을 분석하고(Vercel 함수 프록시 경유), 꺼져 있거나 실패하면 기존 mock으로 폴백한다.

**핵심 안전장치 — Step 1은 기본값이 mock이다.** `VITE_VISION_ENABLED`를 켜지 않는 한
모든 동작·카피·테스트가 지금과 100% 동일. 그래서 기존 36개 테스트가 그대로 green이다.
(사용자 동의 게이트 + 카피 수정은 flag를 켤 때 필요한 **Step 2** — 이 문서 맨 아래 참고.)

계층: `mockGarmentAnalysis`(leaf) + `visionGarmentAnalysis`(leaf) → `garmentAnalyzer`(selector).
호출부는 selector만 import한다. 순환 의존 없음.

---

## 파일 맵

| 동작 | 경로 |
|---|---|
| 새 파일 | `api/analyze-garment.ts` (Vercel serverless 함수) |
| 새 파일 | `src/lib/ai/visionGarmentAnalysis.ts` (Vision analyzer) |
| 새 파일 | `src/lib/ai/garmentAnalyzer.ts` (selector + 폴백) |
| 새 파일 | `src/lib/ai/visionGarmentAnalysis.test.ts` (단위테스트) |
| 수정 | `src/lib/ai/garmentAnalysisTypes.ts` (`imageDataUrl` 추가) |
| 수정 | `src/lib/ai/mockGarmentAnalysis.ts` (`runGarmentAnalysis` 제거, 순수 mock만 남김) |
| 수정 | `runGarmentAnalysis` 호출부 (import 경로 + `imageDataUrl` 전달) |

---

## 1. 새 파일 — `api/analyze-garment.ts` (Vercel 함수, 키는 서버에만)

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = process.env.VISION_MODEL ?? 'claude-sonnet-4-6'

const SYSTEM = `You are a fashion cataloguing assistant. Look at the garment photo and return ONLY a JSON object (no prose, no markdown fences) with exactly these keys:
{"category": one of "outerwear"|"top"|"pants"|"shoes"|"accessory",
 "color": short human color name e.g. "Charcoal",
 "colorHex": "#rrggbb" approximating the garment's main color,
 "styleTags": array of 1-3 short lowercase style words,
 "brand": the brand name if it is clearly legible, otherwise null,
 "confidence": number between 0 and 1}
Never invent a brand you cannot actually read in the image; use null when unsure.`

function parseDataUrl(dataUrl: string): { mediaType: string; data: string } | null {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl)
  return m ? { mediaType: m[1], data: m[2] } : null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ detail: 'Method not allowed.' })
    return
  }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(500).json({ detail: 'Vision API key is not configured on the server.' })
    return
  }

  const body = req.body as { imageDataUrl?: unknown }
  const imageDataUrl = typeof body?.imageDataUrl === 'string' ? body.imageDataUrl : null
  if (!imageDataUrl) {
    res.status(400).json({ detail: 'imageDataUrl (a base64 image data URL) is required.' })
    return
  }
  const parsed = parseDataUrl(imageDataUrl)
  if (!parsed) {
    res.status(400).json({ detail: 'imageDataUrl must be a base64 image data URL.' })
    return
  }

  let upstream: Response
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: parsed.mediaType, data: parsed.data } },
              { type: 'text', text: 'Catalogue this garment as JSON.' },
            ],
          },
        ],
      }),
    })
  } catch {
    res.status(502).json({ detail: 'Could not reach the vision provider.' })
    return
  }

  if (!upstream.ok) {
    res.status(502).json({ detail: `Vision provider error (HTTP ${upstream.status}).` })
    return
  }

  const payload = (await upstream.json()) as { content?: Array<{ type: string; text?: string }> }
  const text = (payload.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
    .trim()
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/```$/, '')
    .trim()

  let guess: unknown
  try {
    guess = JSON.parse(cleaned)
  } catch {
    res.status(502).json({ detail: 'Vision provider returned an unparseable response.' })
    return
  }
  res.status(200).json(guess)
}
```

> `@vercel/node` 타입이 없으면: `npm i -D @vercel/node`.
> **키 주의:** `ANTHROPIC_API_KEY`는 절대 `VITE_` 접두사를 붙이지 마라 — 붙이면 프론트 번들에 박혀 노출된다. 이 키는 오직 서버(Vercel 함수)에서만 읽는다.

---

## 2. 새 파일 — `src/lib/ai/visionGarmentAnalysis.ts`

`proxy3dApi.ts`와 동일한 패턴: `FetchLike` 주입, 커스텀 에러, 정직한 메시지.
provider가 준 hex는 mock과 동일하게 `nearestColorOption`으로 큐레이션 팔레트에 스냅한다.

```ts
import { COLOR_OPTIONS } from '../../domain/garmentTaxonomy'
import { nearestColorOption } from '../color'
import type { ClothingCategory } from '../../domain/garmentTypes'
import type {
  GarmentAnalysisGuess,
  GarmentAnalysisInput,
  GarmentAnalyzer,
} from './garmentAnalysisTypes'

export const VISION_ENDPOINT =
  import.meta.env.VITE_VISION_ENDPOINT ?? '/api/analyze-garment'

export class VisionAnalysisError extends Error {
  readonly status: number | null
  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'VisionAnalysisError'
    this.status = status
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

const CATEGORIES: ClothingCategory[] = [
  'outerwear',
  'top',
  'pants',
  'shoes',
  'accessory',
]

function coerceCategory(value: unknown): ClothingCategory {
  return CATEGORIES.includes(value as ClothingCategory)
    ? (value as ClothingCategory)
    : 'top'
}

function coerceTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((t): t is string => typeof t === 'string').slice(0, 3)
}

function clampConfidence(value: unknown): number {
  const n = typeof value === 'number' ? value : 0.6
  return Math.max(0, Math.min(1, Math.round(n * 100) / 100))
}

export class VisionGarmentAnalyzer implements GarmentAnalyzer {
  constructor(
    private readonly fetchFn: FetchLike = (input, init) => fetch(input, init),
  ) {}

  async analyze(input: GarmentAnalysisInput): Promise<GarmentAnalysisGuess> {
    if (!input.imageDataUrl) {
      throw new VisionAnalysisError(
        'No image was provided for vision analysis.',
        null,
      )
    }

    let response: Response
    try {
      response = await this.fetchFn(VISION_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: input.imageDataUrl }),
      })
    } catch {
      throw new VisionAnalysisError(
        'Could not reach the vision analysis endpoint.',
        null,
      )
    }

    if (!response.ok) {
      let detail: string | null = null
      try {
        const body = (await response.json()) as { detail?: unknown }
        if (typeof body.detail === 'string') detail = body.detail
      } catch {
        // Non-JSON error body.
      }
      throw new VisionAnalysisError(
        detail ?? `Vision analysis failed (HTTP ${response.status}).`,
        response.status,
      )
    }

    const raw = (await response.json()) as Record<string, unknown>
    return this.normalize(raw, input)
  }

  private normalize(
    raw: Record<string, unknown>,
    input: GarmentAnalysisInput,
  ): GarmentAnalysisGuess {
    const hex =
      typeof raw.colorHex === 'string' ? raw.colorHex : input.dominantColorHex
    const option = hex ? nearestColorOption(hex) : COLOR_OPTIONS[0]
    const colorName =
      typeof raw.color === 'string' && raw.color.trim()
        ? raw.color.trim()
        : option.name
    const brand =
      typeof raw.brand === 'string' && raw.brand.trim()
        ? raw.brand.trim()
        : undefined

    return {
      category: coerceCategory(raw.category),
      color: colorName,
      colorHex: option.hex,
      styleTags: coerceTags(raw.styleTags),
      brand,
      confidence: clampConfidence(raw.confidence),
      source: 'vision-api',
    }
  }
}
```

---

## 3. 새 파일 — `src/lib/ai/garmentAnalyzer.ts` (selector + 폴백)

`runGarmentAnalysis`가 이리로 이동한다. flag가 켜져 있고 이미지가 있으면 vision 시도,
실패하면 mock으로 폴백(아카이빙을 절대 막지 않는다).

```ts
import { analyzeGarmentMock } from './mockGarmentAnalysis'
import { VisionGarmentAnalyzer } from './visionGarmentAnalysis'
import type {
  GarmentAnalysisGuess,
  GarmentAnalysisInput,
} from './garmentAnalysisTypes'

const VISION_ENABLED = import.meta.env.VITE_VISION_ENABLED === 'true'

export function isVisionEnabled(): boolean {
  return VISION_ENABLED
}

/**
 * The single entry point the UI calls. With vision off (default) this is exactly
 * the old mock behaviour. With vision on, a provider failure falls back to the
 * deterministic mock so the upload ritual never stalls.
 */
export async function runGarmentAnalysis(
  input: GarmentAnalysisInput,
): Promise<GarmentAnalysisGuess> {
  if (VISION_ENABLED && input.imageDataUrl) {
    try {
      return await new VisionGarmentAnalyzer().analyze(input)
    } catch {
      return analyzeGarmentMock(input)
    }
  }
  return analyzeGarmentMock(input)
}
```

---

## 4. 새 파일 — `src/lib/ai/visionGarmentAnalysis.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { VisionGarmentAnalyzer, VisionAnalysisError } from './visionGarmentAnalysis'
import type { GarmentAnalysisInput } from './garmentAnalysisTypes'

const input: GarmentAnalysisInput = {
  fileName: 'IMG_4821.jpg',
  imageDataUrl: 'data:image/jpeg;base64,AAAA',
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response
}

describe('VisionGarmentAnalyzer', () => {
  it('maps a provider response onto GarmentAnalysisGuess with source vision-api', async () => {
    const analyzer = new VisionGarmentAnalyzer(async () =>
      jsonResponse({
        category: 'outerwear',
        color: 'Charcoal',
        colorHex: '#2b2b2e',
        styleTags: ['tailored', 'minimal'],
        brand: 'Stussy',
        confidence: 0.9,
      }),
    )
    const guess = await analyzer.analyze(input)
    expect(guess.category).toBe('outerwear')
    expect(guess.brand).toBe('Stussy')
    expect(guess.source).toBe('vision-api')
    expect(guess.confidence).toBeLessThanOrEqual(1)
  })

  it('coerces an unknown category to a safe default', async () => {
    const analyzer = new VisionGarmentAnalyzer(async () =>
      jsonResponse({ category: 'spaceship', colorHex: '#000000' }),
    )
    const guess = await analyzer.analyze(input)
    expect(['outerwear', 'top', 'pants', 'shoes', 'accessory']).toContain(
      guess.category,
    )
  })

  it('throws VisionAnalysisError on a non-ok response', async () => {
    const analyzer = new VisionGarmentAnalyzer(async () =>
      jsonResponse({ detail: 'boom' }, false, 502),
    )
    await expect(analyzer.analyze(input)).rejects.toBeInstanceOf(
      VisionAnalysisError,
    )
  })

  it('throws when no image is provided', async () => {
    const analyzer = new VisionGarmentAnalyzer()
    await expect(
      analyzer.analyze({ fileName: 'x.jpg' }),
    ).rejects.toBeInstanceOf(VisionAnalysisError)
  })
})
```

---

## 5. 수정 — `src/lib/ai/garmentAnalysisTypes.ts`

`GarmentAnalysisInput`에 `imageDataUrl`을 추가한다(선택 — mock은 무시, vision은 사용).

```ts
export interface GarmentAnalysisInput {
  fileName: string
  fileSizeBytes?: number
  /** Optional dominant color sampled from the image by `imageFileUtils`. */
  dominantColorHex?: string
  /**
   * Downscaled thumbnail data URL. Used by the vision analyzer; the mock
   * ignores it (so jsdom unit tests still run without canvas).
   */
  imageDataUrl?: string
}
```

`AnalysisSource`는 이미 `'mock' | 'vision-api'`라 그대로 둔다.

---

## 6. 수정 — `src/lib/ai/mockGarmentAnalysis.ts`

맨 아래 `runGarmentAnalysis`를 **삭제**한다(이제 selector가 소유). `analyzeGarmentMock`만 export로 남긴다.
파일 상단의 "Replacing this with a real Vision API" 주석은 "구현 완료 — `garmentAnalyzer.ts`/`visionGarmentAnalysis.ts` 참고"로 갱신.

삭제할 블록:

```ts
export function runGarmentAnalysis(
  input: GarmentAnalysisInput,
): Promise<GarmentAnalysisGuess> {
  return Promise.resolve(analyzeGarmentMock(input))
}
```

이제 `GarmentAnalysisGuess` import가 안 쓰이면 정리(`analyzeGarmentMock` 반환 타입으로는 여전히 필요할 수 있으니 typecheck로 확인).

---

## 7. 수정 — `runGarmentAnalysis` 호출부

`runGarmentAnalysis`를 호출하는 곳(업로드 플로우를 구동하는 컴포넌트/프로바이더,
보통 scan 단계에서 `SUGGESTED`를 dispatch하기 직전)에서 두 가지를 바꾼다.

1. import 경로: `from '../../lib/ai/mockGarmentAnalysis'` → `from '../../lib/ai/garmentAnalyzer'`
2. 넘기는 `GarmentAnalysisInput`에 다운스케일 썸네일을 추가:
   `imageDataUrl: <downscaleDataUrl 결과 — sampleDominantColorHex에 쓰는 그 썸네일>`

찾기:
```bash
grep -rn "runGarmentAnalysis" src/
```

> 썸네일은 2번 단계에서 이미 만들어진다(`downscaleDataUrl`, ≤768px JPEG). 원본 대신 이 썸네일을
> 보내야 API 비용·대역폭이 작다. 이미 `draft.imageDataUrl`로 들고 있으면 그대로 재사용.

---

## 8. 환경변수

`.env.local` (로컬) 및 Vercel 프로젝트 환경변수(배포):

```
# 서버 전용 — 절대 VITE_ 붙이지 말 것(붙이면 번들에 노출)
ANTHROPIC_API_KEY=sk-ant-...

# 프론트 — vision 켜기. 안 켜면 mock 그대로(Step 1 기본)
VITE_VISION_ENABLED=true

# (선택) 기본값 있음
# VITE_VISION_ENDPOINT=/api/analyze-garment
# VISION_MODEL=claude-sonnet-4-6
```

- 실제 키 값은 **네가 Vercel 대시보드(Settings → Environment Variables)에 직접** 넣는다. 코드/깃에 키를 커밋하지 마라. `.env.local`은 `.gitignore`에 있어야 한다.

---

## 9. dev 실행

기존 `vite.config.ts`의 dev proxy는 `/api` → `127.0.0.1:8000`(Track B FastAPI)로 가 있다.
`/api/analyze-garment`는 Vercel 함수라 dev에서 두 가지 선택:

- **간단:** `vercel dev`로 띄우면 `api/*.ts` 함수가 로컬에서 실행된다(`npm i -g vercel` 후 `vercel dev`).
  단 이때 Track B의 `/api/proxy-3d`(FastAPI)와 경로가 겹치니, 둘 다 쓸 거면 FastAPI는 따로 띄우고
  vite proxy에서 `proxy-3d`만 FastAPI로, 나머지는 그대로 두는 식으로 분리.
- **분리 운영:** vision은 `vercel dev`(예: :3000), Track B는 vite(:5173)+FastAPI(:8000)로 따로 검증.

프로덕션(Vercel 배포)에선 `/api/analyze-garment`가 자동으로 함수로 매핑돼 추가 설정이 거의 없다.

---

## 10. 검증 (반드시 통과)

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run — 기존 36개 + vision 4개
npm run lint        # eslint .
```

flag를 안 켠 상태(기본)에서 이 셋이 다 green이면 Step 1 안전. 그 뒤 `.env.local`에
`VITE_VISION_ENABLED=true` + 키를 넣고 `vercel dev`로 실제 사진 업로드 → vision 분류 확인.

---

## Claude Code에 그대로 줄 프롬프트

```
The Archive에 Vision API seam을 추가한다. 첨부한 vision-api-integration.md를 그대로 따라
구현해라. 규칙:
- Step 1만 구현한다(동의 게이트/카피 수정 = Step 2는 건드리지 마라).
- 새 파일 4개 생성: api/analyze-garment.ts, src/lib/ai/visionGarmentAnalysis.ts,
  src/lib/ai/garmentAnalyzer.ts, src/lib/ai/visionGarmentAnalysis.test.ts.
- 수정 3곳: garmentAnalysisTypes.ts(imageDataUrl 추가),
  mockGarmentAnalysis.ts(runGarmentAnalysis 제거),
  runGarmentAnalysis 호출부(import 경로를 garmentAnalyzer로 + input.imageDataUrl에 다운스케일 썸네일 전달).
- VITE_VISION_ENABLED 기본 off → 기존 동작/카피/테스트가 100% 그대로여야 한다.
- ANTHROPIC_API_KEY에는 절대 VITE_ 접두사를 붙이지 마라.
- 끝나면 npm run typecheck && npm test && npm run lint 셋 다 green인지 확인하고 diff를 보여줘라.
커밋하지 말고 diff만.
```

---

## 다음 — Step 2 (flag를 켤 때 필요)

vision을 실제로 켜면 `UPLOAD_COPY`의 "no photo leaves your device"가 거짓이 된다. 그래서:
1. scan 단계 앞에 **명시적 동의 게이트** ("이 사진을 분석 서버로 보냅니다") 추가.
2. `isVisionEnabled()`로 분기해 vision일 때만 카피를 정직하게 교체.
3. honesty 테스트(`FORBIDDEN_CLAIM_TERMS` 패턴) 갱신 — vision 경로의 카피 검증.

Step 1이 green으로 들어오면 Step 2 설계로 이어가자.
