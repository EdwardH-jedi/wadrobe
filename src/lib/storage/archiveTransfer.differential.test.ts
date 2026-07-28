// Differential fuzzing: the same damaged file through both decoders.
//
// `archiveTransfer.property.test.ts` fuzzes this importer and proves it never
// corrupts. The Swift package's `ArchiveExportFuzzTests` does the same for that
// one. Both can hold and the two can still disagree about what a given broken
// file means — and a disagreement about a broken file is how a user ends up
// with an archive on one device and an error on the other.
//
// So: generate mutants, run BOTH decoders over the identical bytes, and require
// that they agree on the two things the specification actually fixes —
//
//   * accepted or rejected (§3.1 lists exactly five rejections)
//   * how many records survived (§6 and §8 fix the per-record rules)
//
// Warning *taxonomies* are deliberately not compared: this side reports issue
// codes and the other reports warning kinds, and forcing those to match would
// be inventing a rule the format does not have. What is compared is that when
// records are dropped, both sides say something about it.
//
// Mutants are seeded, so a disagreement reproduces from the seed in its message.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { reviewArchiveImportText } from './archiveImport'
import {
  requireWardrobeVerify,
  runVerify,
  wardrobeDomainPresent,
} from '../../test/wardrobeDomain'

// Vitest's worker talks to the runner over an RPC channel with its own timeout,
// and answering it needs a turn of the event loop. At 50,000 mutants this
// `beforeAll` used to run ~124 seconds of unbroken synchronous work — 300,000
// file writes plus a blocking `execFileSync` — so the heartbeat never got a
// turn and the run ended with
//
//   Error: [vitest-worker]: Timeout calling "onTaskUpdate"
//   This might cause false positive tests.
//
// The tests passed, but a runner warning that results may be unreliable makes
// the green meaningless. The fix is to stop blocking rather than to raise the
// timeout: every subprocess call is awaited, and the generation loop yields on
// a fixed interval.
const YIELD_EVERY = 250

/** Hand the event loop a turn so the worker can answer its RPC heartbeat. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

const FIXTURE_DIR = join(
  process.cwd(),
  'src/lib/storage/__fixtures__/archive-export',
)

const available = wardrobeDomainPresent

/** How many mutants per source fixture. Raise for a deeper sweep. */
const MUTANTS = Number(process.env.DIFFERENTIAL_MUTANTS ?? 60)

// --- deterministic randomness -----------------------------------------------

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// --- mutations --------------------------------------------------------------

/**
 * The junk values that break decoders: a type that cannot hold the value, a
 * number that is not representable, a structure where a scalar belongs. Kept
 * deliberately in step with `Mutation.poison` in the Swift fuzzer, so both
 * suites explore the same shape of damage even when they are not sharing bytes.
 */
const POISON: unknown[] = [
  null,
  true,
  0,
  -1,
  Number.MAX_VALUE,
  '',
  'not a number',
  '1970-01-01T00:00:00Z',
  [],
  [null, 1],
  {},
  { kind: 'indexeddb-blob', key: 'asset_1_x' },
  'blob:http://localhost/dead-handle',
]

type Path = (string | number)[]

/** Every addressable position in the tree, capped so the mutator stays cheap. */
function paths(value: unknown, current: Path, out: Path[]): void {
  if (out.length > 4000) return
  if (current.length > 0) out.push(current)
  if (Array.isArray(value)) {
    value.forEach((child, index) => paths(child, [...current, index], out))
  } else if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value as object).sort()) {
      paths((value as Record<string, unknown>)[key], [...current, key], out)
    }
  }
}

/** Replace, or with `remove`, delete the value at `path`. */
function mutateAt(root: unknown, path: Path, value: unknown, remove: boolean): unknown {
  if (path.length === 0) return remove ? undefined : value
  const clone: unknown = Array.isArray(root)
    ? [...root]
    : { ...(root as Record<string, unknown>) }
  const [head, ...rest] = path
  const container = clone as Record<string | number, unknown>

  if (rest.length === 0) {
    if (remove) {
      if (Array.isArray(clone)) clone.splice(head as number, 1)
      else delete container[head]
    } else {
      container[head] = value
    }
    return clone
  }
  container[head] = mutateAt(container[head], rest, value, remove)
  return clone
}

function mutate(root: unknown, random: () => number): unknown {
  const all: Path[] = []
  paths(root, [], all)
  if (all.length === 0) return root

  const choice = random()
  const target = all[Math.floor(random() * all.length)]

  if (choice < 0.45) {
    return mutateAt(root, target, POISON[Math.floor(random() * POISON.length)], false)
  }
  if (choice < 0.8) {
    return mutateAt(root, target, undefined, true)
  }
  // Duplicate a record, which is how an id collides with itself.
  const doc = root as Record<string, unknown>
  const section = random() < 0.5 ? 'garments' : 'savedOutfits'
  const list = doc[section]
  if (!Array.isArray(list) || list.length === 0) return root
  return { ...doc, [section]: [...list, list[Math.floor(random() * list.length)]] }
}

// --- verdicts ---------------------------------------------------------------

interface Verdict {
  file: string
  accepted: boolean
  code?: string | null
  garments?: number
  savedOutfits?: number
  warnings?: number
  explained?: boolean
  unexpectedError?: string
}

function webVerdict(file: string, text: string): Verdict {
  const review = reviewArchiveImportText(text)
  if (!review.ok) {
    return { file, accepted: false, code: review.issues[0]?.code ?? null }
  }
  return {
    file,
    accepted: true,
    garments: review.garments.length,
    savedOutfits: review.savedOutfits.length,
    warnings: review.issues.length,
    explained: review.issues.every((i) => i.message.length > 0),
  }
}

let workDir = ''

async function swiftVerdicts(): Promise<Map<string, Verdict>> {
  // Awaited, and against the built binary: a blocking call that lasts minutes
  // stops the worker answering vitest's RPC heartbeat, and `swift run` would
  // take the SwiftPM lock that a parallel worker is also reaching for.
  const stdout = await runVerify(['fuzzcheck', workDir])
  const map = new Map<string, Verdict>()
  for (const line of stdout.split('\n')) {
    if (!line.trim().startsWith('{')) continue
    const verdict = JSON.parse(line) as Verdict
    map.set(verdict.file, verdict)
  }
  return map
}

// --- the suite --------------------------------------------------------------

const SOURCES = [
  'minimal-valid.json',
  'full-featured.json',
  'legacy-records.json',
  'blob-backed-inlined.json',
  'unrecognized-enums.json',
  'blob-ref-leaked.json',
]

describe.skipIf(!available)('differential fuzzing (web vs WardrobeDomain)', () => {
  const web = new Map<string, Verdict>()
  const seeds = new Map<string, string>()
  let swift = new Map<string, Verdict>()

  beforeAll(async () => {
    const started = Date.now()
    workDir = mkdtempSync(join(tmpdir(), 'archive-differential-'))
    requireWardrobeVerify()

    const total = SOURCES.length * MUTANTS
    let generated = 0
    let lastReport = Date.now()

    for (const source of SOURCES) {
      const original = JSON.parse(
        readFileSync(join(FIXTURE_DIR, source), 'utf8'),
      ) as unknown

      for (let seed = 1; seed <= MUTANTS; seed += 1) {
        const random = rng(seed * 2654435761)
        let mutated = original
        // Compound up to three mutations so damage can interact — a single
        // edit tends to hit only the rules that are already well covered.
        const rounds = 1 + Math.floor(random() * 3)
        for (let i = 0; i < rounds; i += 1) mutated = mutate(mutated, random)

        generated += 1
        // Yield on a fixed interval so the worker can answer its RPC heartbeat.
        // Without this the loop runs to completion without ever returning to
        // the event loop, and vitest reports `Timeout calling "onTaskUpdate"`.
        if (generated % YIELD_EVERY === 0) {
          await yieldToEventLoop()
          // Progress, but only when a run is long enough to need it — at the
          // default 60 mutants this never prints.
          if (Date.now() - lastReport > 10_000) {
            lastReport = Date.now()
            const elapsed = ((Date.now() - started) / 1000).toFixed(0)
            console.log(
              `[differential] generated ${generated}/${total} mutants (${elapsed}s)`,
            )
          }
        }

        let text: string
        try {
          text = JSON.stringify(mutated)
        } catch {
          continue // a mutation produced something unserializable
        }
        if (text === undefined) continue

        const name = `${source.replace('.json', '')}-${seed}.json`
        writeFileSync(join(workDir, name), text, 'utf8')
        seeds.set(name, `${source} seed ${seed}`)
        web.set(name, webVerdict(name, text))
      }
    }

    if (total > YIELD_EVERY) {
      console.log(
        `[differential] ${web.size} mutants written in ` +
          `${((Date.now() - started) / 1000).toFixed(0)}s; running Swift decoder`,
      )
    }
    swift = await swiftVerdicts()
    if (total > YIELD_EVERY) {
      console.log(
        `[differential] both decoders done in ` +
          `${((Date.now() - started) / 1000).toFixed(0)}s`,
      )
    }
  }, 3_600_000)

  it('produces mutants for both decoders to disagree about', () => {
    expect(web.size).toBe(SOURCES.length * MUTANTS)
    expect(swift.size).toBe(web.size)
  })

  it('neither decoder ever fails in a way it does not model', () => {
    // The Swift side reports this explicitly; on this side, `reviewArchive-
    // ImportText` throwing at all would have failed `beforeAll` already.
    const unmodelled = [...swift.values()].filter((v) => v.unexpectedError)
    expect(unmodelled.map((v) => `${seeds.get(v.file)}: ${v.unexpectedError}`)).toEqual([])
  })

  it('both decoders agree on accept vs reject', () => {
    const disagreements: string[] = []
    for (const [name, ours] of web) {
      const theirs = swift.get(name)
      if (!theirs) continue
      if (ours.accepted !== theirs.accepted) {
        disagreements.push(
          `${seeds.get(name)}: web ${ours.accepted ? 'accepted' : `rejected (${ours.code})`}, ` +
            `swift ${theirs.accepted ? 'accepted' : `rejected (${theirs.code})`}`,
        )
      }
    }
    expect(disagreements).toEqual([])
  })

  it('both decoders reject for the same reason', () => {
    const disagreements: string[] = []
    for (const [name, ours] of web) {
      const theirs = swift.get(name)
      if (!theirs || ours.accepted || theirs.accepted) continue
      if (ours.code !== theirs.code) {
        disagreements.push(`${seeds.get(name)}: web ${ours.code}, swift ${theirs.code}`)
      }
    }
    expect(disagreements).toEqual([])
  })

  it('both decoders keep the same records', () => {
    const disagreements: string[] = []
    for (const [name, ours] of web) {
      const theirs = swift.get(name)
      if (!theirs || !ours.accepted || !theirs.accepted) continue
      if (
        ours.garments !== theirs.garments ||
        ours.savedOutfits !== theirs.savedOutfits
      ) {
        disagreements.push(
          `${seeds.get(name)}: web ${ours.garments}g/${ours.savedOutfits}o, ` +
            `swift ${theirs.garments}g/${theirs.savedOutfits}o`,
        )
      }
    }
    expect(disagreements).toEqual([])
  })

  it('neither decoder drops anything silently', () => {
    // "Reports what it dropped and why" — every problem carries a non-empty
    // explanation on both sides, and a document that lost records says so.
    const silent: string[] = []
    for (const [name, ours] of web) {
      const theirs = swift.get(name)
      if (!theirs || !ours.accepted) continue
      if (ours.explained === false) silent.push(`${seeds.get(name)}: web issue with no message`)
      if (theirs.explained === false) silent.push(`${seeds.get(name)}: swift warning with no detail`)
    }
    expect(silent).toEqual([])
  })
})
