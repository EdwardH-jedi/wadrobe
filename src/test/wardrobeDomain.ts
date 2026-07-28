// Locating, building and invoking the WardrobeDomain verification binary.
//
// Two problems this solves, both seen in a real run.
//
// **SwiftPM lock contention.** `swift run` takes an exclusive lock on the
// package's `.build` directory for the whole invocation. The cross-client suite
// calls it once per fixture and the differential suite once per sweep, and
// vitest runs test files in parallel workers, so two workers reach for the same
// lock and one blocks:
//
//   Another instance of SwiftPM (PID: 60249) is already running using
//   '.../WardrobeDomain/.build', waiting until that process has finished
//   execution...
//
// It appeared twice in a single run. It resolved both times — SwiftPM waits
// rather than failing — but a suite whose runtime depends on lock ordering is
// one that will eventually time out instead.
//
// The fix is to stop calling `swift run` from tests at all. `globalSetup` builds
// the package **once**, before any worker starts, and publishes the built
// binary's path. Tests then exec that binary directly: no package resolution, no
// lock, no contention, and each call is much faster because SwiftPM is not in
// the loop.
//
// **Silent skips.** Both suites `describe.skipIf(!available)`, which is right
// when the package genuinely is not checked out and wrong when it is present and
// simply failed to build — that reads as `0 failures` while testing nothing.
// `requireWardrobeDomain()` distinguishes the two.
import { execFile, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** Overridable so this can run against a checkout somewhere else. */
export const SWIFT_PACKAGE =
  process.env.WARDROBE_DOMAIN_PATH ??
  join(process.env.HOME ?? '', 'Desktop/archive-ios/WardrobeDomain')

/** Is the package checked out at all? */
export const wardrobeDomainPresent = existsSync(join(SWIFT_PACKAGE, 'Package.swift'))

/**
 * Where `globalSetup` published the built binary. Absent when the package is
 * not present, or when the suite was run without the global setup.
 */
export function builtBinaryPath(): string | undefined {
  return process.env.WARDROBE_VERIFY_BIN
}

/**
 * Build the package once and return the path to `wardrobe-verify`.
 *
 * Called from `globalSetup`, in the main process, before any worker exists — so
 * exactly one build runs and no two processes contend for the lock.
 */
export function buildWardrobeVerify(): string {
  const binDir = execFileSync('swift', ['build', '--show-bin-path'], {
    cwd: SWIFT_PACKAGE,
    encoding: 'utf8',
    timeout: 900_000,
    env: { ...process.env, NO_COLOR: '1' },
  })
    .trim()
    .split('\n')
    .pop()!
    .trim()

  execFileSync('swift', ['build', '--product', 'wardrobe-verify'], {
    cwd: SWIFT_PACKAGE,
    encoding: 'utf8',
    timeout: 900_000,
    env: { ...process.env, NO_COLOR: '1' },
  })

  const binary = join(binDir, 'wardrobe-verify')
  if (!existsSync(binary)) {
    throw new Error(
      `swift build reported bin path ${binDir} but ${binary} does not exist`,
    )
  }
  return binary
}

/**
 * The binary a test should invoke, or a thrown error explaining precisely why
 * there is not one.
 *
 * Never returns a path that does not exist, and never silently degrades to
 * `swift run` — falling back to it would reintroduce the lock contention this
 * module exists to remove.
 */
export function requireWardrobeVerify(): string {
  if (!wardrobeDomainPresent) {
    throw new Error(
      `No Swift package at ${SWIFT_PACKAGE}. Set WARDROBE_DOMAIN_PATH, or ` +
        'accept that the cross-boundary suites skip.',
    )
  }
  const binary = builtBinaryPath()
  if (!binary) {
    throw new Error(
      'WARDROBE_VERIFY_BIN is unset: the vitest globalSetup did not run.\n' +
        'Run the suite through `npm test` (vite.config.ts wires globalSetup), ' +
        'not by invoking a bare vitest binary without the project config.',
    )
  }
  if (!existsSync(binary)) {
    throw new Error(`WARDROBE_VERIFY_BIN points at ${binary}, which does not exist.`)
  }
  return binary
}

/** Run the built binary. Synchronous; for short single-file invocations. */
export function runVerifySync(args: string[], options: { maxBuffer?: number } = {}): string {
  return execFileSync(requireWardrobeVerify(), args, {
    encoding: 'utf8',
    maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
    timeout: 300_000,
    env: { ...process.env, NO_COLOR: '1' },
  })
}

/**
 * Run the built binary without blocking the event loop.
 *
 * The differential sweep needs this: a blocking call that lasts minutes stops
 * the vitest worker answering its RPC heartbeat, and the run ends with
 * `Timeout calling "onTaskUpdate"` and a warning that results may be false
 * positives.
 */
export async function runVerify(
  args: string[],
  options: { maxBuffer?: number; timeout?: number } = {},
): Promise<string> {
  const { stdout } = await execFileAsync(requireWardrobeVerify(), args, {
    encoding: 'utf8',
    maxBuffer: options.maxBuffer ?? 512 * 1024 * 1024,
    timeout: options.timeout ?? 1_800_000,
    env: { ...process.env, NO_COLOR: '1' },
  })
  return stdout
}
