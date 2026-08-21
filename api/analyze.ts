// Vercel serverless function (Edge runtime) — Track A, Phase 4 (backend 2A).
//
// Optional real vision analyzer: given a garment's downscaled thumbnail, ask a
// Claude vision model to draft category/color/style-tags (and a brand only if a
// logo is clearly legible). The result is a NON-BINDING draft the user confirms.
// THIN WRAPPER: the schema, prompt, image-source split, and response parsing all
// live in the unit-tested `src/lib/ai/visionAnalysis.ts`; this file only does the
// HTTP. Off by default — the front end calls it only when VITE_ANALYZER=vision.
//
// Raw fetch (no SDK) is deliberate: the repo's "justify every dependency" rule
// favors not adding one for a single documented HTTP call. The Anthropic
// Messages API shape below is the documented one. This file IS type-checked --
// `npm run typecheck` runs `tsconfig.api.json` over `api/` as its own
// compilation unit (it targets a server runtime, not the browser bundle).
import {
  VISION_GUESS_SCHEMA,
  buildVisionInstruction,
  dataUrlToImageSource,
  parseVisionGuess,
} from '../src/lib/ai/visionAnalysis'
import { gateRequest, jsonResponse, type RateLimitRule } from './_lib/http'

export const config = { runtime: 'edge' }

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const DEFAULT_MODEL = 'claude-opus-4-8'
const TIMEOUT_MS = 20000

// The most expensive endpoint here: every allowed call is a billed vision
// request. A real user archives pieces one photo at a time, so a low ceiling
// costs nothing legitimate.
const RATE_LIMIT: RateLimitRule = { name: 'analyze', max: 10 }

function extractText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  for (const block of content) {
    if (
      block &&
      typeof block === 'object' &&
      (block as { type?: unknown }).type === 'text' &&
      typeof (block as { text?: unknown }).text === 'string'
    ) {
      return (block as { text: string }).text
    }
  }
  return ''
}

export default async function handler(req: Request): Promise<Response> {
  const gate = gateRequest(req, RATE_LIMIT)
  if (!gate.ok) return gate.response
  const json = (body: unknown, status: number) => jsonResponse(body, status, gate.cors)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return json({ error: 'Vision analyzer is not configured' }, 500)
  }

  let imageDataUrl = ''
  let dominantColorHex: string | undefined
  try {
    const body = await req.json()
    imageDataUrl = body && typeof body.imageDataUrl === 'string' ? body.imageDataUrl : ''
    dominantColorHex =
      body && typeof body.dominantColorHex === 'string' ? body.dominantColorHex : undefined
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const image = dataUrlToImageSource(imageDataUrl)
  if (!image) return json({ error: 'Expected an image data URL' }, 400)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.ANALYZE_MODEL || DEFAULT_MODEL,
        max_tokens: 1024,
        output_config: { format: { type: 'json_schema', schema: VISION_GUESS_SCHEMA } },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: image.mediaType,
                  data: image.data,
                },
              },
              { type: 'text', text: buildVisionInstruction() },
            ],
          },
        ],
      }),
    })

    if (!res.ok) return json({ error: `Upstream responded ${res.status}` }, 502)

    const data = await res.json()
    let parsed: unknown
    try {
      parsed = JSON.parse(extractText(data.content))
    } catch {
      return json({ error: 'Could not parse the analysis result' }, 502)
    }

    const guess = parseVisionGuess(parsed, dominantColorHex)
    if (!guess) return json({ error: 'Unusable analysis result' }, 502)
    return json(guess, 200)
  } catch {
    return json({ error: 'Could not analyze the image' }, 502)
  } finally {
    clearTimeout(timer)
  }
}
