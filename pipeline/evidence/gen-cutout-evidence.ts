// Evidence generator for the Avatar Visual cutout steps. Runs the REAL on-device
// heuristic (`removeBackground` from src/lib/image/garmentCutout.ts — imported,
// NOT reimplemented) against a real shoe photo and writes a transparent PNG so
// the 1a heuristic result can be compared side-by-side with the 1b ML result.
//
// Headless: decodes/encodes 8-bit PNG with Node's zlib (no image deps). Bundled
// for node via esbuild, so it can import the app's TypeScript directly.
//
// Usage: node_modules/.bin/esbuild ... | node   (see pipeline/evidence/run.sh)
import { readFileSync, writeFileSync } from 'node:fs'
import { inflateSync, deflateSync } from 'node:zlib'
import {
  analyzeBorder,
  removeBackground,
  classifyRemoval,
} from '../../src/lib/image/garmentCutout'

// --- minimal PNG codec (8-bit, non-interlaced, colour type 2 RGB or 6 RGBA) ---
const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function crc32(buf: Uint8Array): number {
  let c = ~0
  for (let n = 0; n < buf.length; n++) {
    c ^= buf[n]
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return ~c >>> 0
}

interface Raster {
  data: Uint8ClampedArray
  width: number
  height: number
}

function decodePng(bytes: Buffer): Raster {
  for (let i = 0; i < SIG.length; i++)
    if (bytes[i] !== SIG[i]) throw new Error('not a PNG')
  let off = 8
  let width = 0
  let height = 0
  let colorType = 0
  let bitDepth = 0
  const idat: Buffer[] = []
  while (off < bytes.length) {
    const len = bytes.readUInt32BE(off)
    const type = bytes.toString('ascii', off + 4, off + 8)
    const body = bytes.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      bitDepth = body[8]
      colorType = body[9]
      if (body[12] !== 0) throw new Error('interlaced PNG unsupported')
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(body))
    } else if (type === 'IEND') {
      break
    }
    off += 12 + len
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6))
    throw new Error(`unsupported PNG (bitDepth ${bitDepth}, colorType ${colorType})`)
  const channels = colorType === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = new Uint8ClampedArray(width * height * 4)
  const prev = new Uint8Array(stride)
  const cur = new Uint8Array(stride)
  let p = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[p++]
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[p++]
      const a = x >= channels ? cur[x - channels] : 0
      const b = prev[x]
      const c = x >= channels ? prev[x - channels] : 0
      let val = rawByte
      if (filter === 1) val += a
      else if (filter === 2) val += b
      else if (filter === 3) val += (a + b) >> 1
      else if (filter === 4) {
        const pa = Math.abs(b - c)
        const pb = Math.abs(a - c)
        const pc = Math.abs(a + b - 2 * c)
        val += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      cur[x] = val & 0xff
    }
    for (let x = 0; x < width; x++) {
      const s = x * channels
      const d = (y * width + x) * 4
      out[d] = cur[s]
      out[d + 1] = cur[s + 1]
      out[d + 2] = cur[s + 2]
      out[d + 3] = channels === 4 ? cur[s + 3] : 255
    }
    prev.set(cur)
  }
  return { data: out, width, height }
}

function chunk(type: string, body: Uint8Array): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(body.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, Buffer.from(body)])), 0)
  return Buffer.concat([len, typeBuf, Buffer.from(body), crcBuf])
}

function encodePng({ data, width, height }: Raster): Buffer {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    for (let x = 0; x < stride; x++) raw[y * (stride + 1) + 1 + x] = data[y * stride + x]
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type RGBA
  return Buffer.concat([
    Buffer.from(SIG),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array()),
  ])
}

// --- run the real heuristic --------------------------------------------------
const [, , inPath, outPath] = process.argv
if (!inPath || !outPath) throw new Error('usage: gen <input.png> <output.png>')

const img = decodePng(readFileSync(inPath))
const { bg, uniformity } = analyzeBorder(img.data, img.width, img.height)
const { removedFraction, applied } = removeBackground(img.data, img.width, img.height)
const verdict = !applied
  ? 'unavailable (border not a uniform flat-lay)'
  : classifyRemoval(removedFraction)

// Whatever the verdict, write what the heuristic actually produced (mutated in
// place: removed pixels have alpha 0) so the user sees the honest result.
writeFileSync(outPath, encodePng(img))

console.log(
  JSON.stringify(
    {
      input: inPath,
      output: outPath,
      size: `${img.width}x${img.height}`,
      sampledBackground: bg,
      borderUniformity: Number(uniformity.toFixed(3)),
      removedFraction: Number(removedFraction.toFixed(3)),
      applied,
      verdict,
    },
    null,
    2,
  ),
)
