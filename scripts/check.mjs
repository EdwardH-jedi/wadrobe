#!/usr/bin/env node
// The one command. `npm run check`.
//
// Runs everything that can fail — typecheck, lint, the web suite, the Swift
// package's suite — from a clean shell with no environment variables set, and
// exits non-zero if any of it fails.
//
// It also fails on a class of green run that should not count: **a suite that
// reported no failures because it never ran.** The two cross-boundary suites
// call `describe.skipIf(!available)`, which is correct when the Swift package
// genuinely is not checked out and dangerously wrong when it is present and
// something else went wrong — a failed build, a missing binary, a globalSetup
// that did not run. In that case vitest prints `0 failed` and means `0 tested`.
//
// So: if WardrobeDomain is present, the cross-boundary files MUST have executed
// their tests. Skipping them is a failure, reported as one.
//
// Options:
//   --deep      DIFFERENTIAL_MUTANTS=5000  (~12 s instead of ~2 s)
//   --deepest   DIFFERENTIAL_MUTANTS=50000 (~124 s)
//   --quick     web suite only; skips typecheck, lint and the Swift package
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const argv = process.argv.slice(2)
const has = (flag) => argv.includes(flag)

const SWIFT_PACKAGE =
  process.env.WARDROBE_DOMAIN_PATH ??
  join(process.env.HOME ?? '', 'Desktop/archive-ios/WardrobeDomain')
const swiftPackagePresent = existsSync(join(SWIFT_PACKAGE, 'Package.swift'))

/**
 * Files that exist to cross the web/Swift boundary. When the package is present
 * these must run; a skip means the harness broke, not that there was nothing to
 * test.
 */
const CROSS_BOUNDARY = [
  'src/lib/storage/archiveTransfer.crossclient.test.ts',
  'src/lib/storage/archiveTransfer.differential.test.ts',
]

const failures = []
let stepNumber = 0

function step(label) {
  stepNumber += 1
  process.stdout.write(`\n\x1b[1m[${stepNumber}] ${label}\x1b[0m\n`)
}

function ok(label) {
  process.stdout.write(`\x1b[32m  ✓ ${label}\x1b[0m\n`)
}

function fail(label, detail) {
  failures.push(detail ? `${label}: ${detail}` : label)
  process.stdout.write(`\x1b[31m  ✗ ${label}\x1b[0m\n`)
  if (detail) process.stdout.write(`    ${detail}\n`)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    encoding: 'utf8',
    ...options,
  })
  return result.status ?? 1
}

// --- 1. typecheck + lint ----------------------------------------------------

if (!has('--quick')) {
  step('typecheck')
  run('npx', ['tsc', '--noEmit']) === 0 ? ok('typecheck') : fail('typecheck')

  step('lint')
  run('npx', ['eslint', '.']) === 0 ? ok('lint') : fail('lint')
}

// --- 2. the web suite -------------------------------------------------------

const mutants = has('--deepest') ? '50000' : has('--deep') ? '5000' : undefined
const reportPath = join(tmpdir(), `wardrobe-check-${process.pid}.json`)

step(
  `web suite${mutants ? ` (DIFFERENTIAL_MUTANTS=${mutants})` : ''}` +
    `${swiftPackagePresent ? '' : ' — no Swift package, cross-boundary suites will skip'}`,
)

const webStatus = run(
  'npx',
  ['vitest', 'run', '--reporter=default', '--reporter=json', `--outputFile=${reportPath}`],
  {
    env: {
      ...process.env,
      ...(mutants ? { DIFFERENTIAL_MUTANTS: mutants } : {}),
      // Only meaningful when the package is present; makes the cross-client
      // suite throw rather than skip if it is somehow unavailable anyway.
      ...(swiftPackagePresent ? { CROSSCLIENT_STRICT: '1' } : {}),
    },
  },
)

if (webStatus === 0) ok('web suite')
else fail('web suite', `vitest exited ${webStatus}`)

// --- 3. did anything skip that should not have? -----------------------------

step('coverage of the cross-boundary suites')

if (!existsSync(reportPath)) {
  fail('vitest report', `no JSON report at ${reportPath}`)
} else {
  const report = JSON.parse(readFileSync(reportPath, 'utf8'))

  // Any pending test anywhere is worth naming — a silently skipped test is the
  // failure mode this whole step exists for.
  const pending = []
  for (const file of report.testResults ?? []) {
    for (const assertion of file.assertionResults ?? []) {
      if (assertion.status === 'pending' || assertion.status === 'todo') {
        pending.push(`${file.name.replace(process.cwd() + '/', '')} › ${assertion.title}`)
      }
    }
  }

  if (swiftPackagePresent) {
    for (const relative of CROSS_BOUNDARY) {
      const file = (report.testResults ?? []).find((f) => f.name.endsWith(relative))
      if (!file) {
        fail(
          relative,
          'the Swift package is present but this file did not run at all. ' +
            'It is meant to cross the boundary; a missing run is not a pass.',
        )
        continue
      }
      const executed = (file.assertionResults ?? []).filter(
        (a) => a.status === 'passed' || a.status === 'failed',
      ).length
      if (executed === 0) {
        fail(
          relative,
          `the Swift package is present at ${SWIFT_PACKAGE} but every test in ` +
            'this file skipped. That reports 0 failures while testing nothing — ' +
            'check that globalSetup built wardrobe-verify.',
        )
      } else {
        ok(`${relative} — ${executed} tests executed`)
      }
    }
  } else {
    process.stdout.write(
      `\x1b[33m  ! no Swift package at ${SWIFT_PACKAGE}; cross-boundary suites skipped ` +
        'legitimately. Set WARDROBE_DOMAIN_PATH to include them.\x1b[0m\n',
    )
  }

  if (pending.length > 0) {
    fail(
      'skipped tests',
      `${pending.length} test(s) did not run:\n    ` + pending.join('\n    '),
    )
  } else {
    ok('nothing skipped unexpectedly')
  }

  rmSync(reportPath, { force: true })
}

// --- 4. the Swift package ---------------------------------------------------

if (!has('--quick')) {
  if (swiftPackagePresent) {
    step('WardrobeDomain suite')
    run('swift', ['test'], { cwd: SWIFT_PACKAGE }) === 0
      ? ok('swift test')
      : fail('swift test')
  } else {
    step('WardrobeDomain suite — skipped, package not present')
  }
}

// --- verdict ----------------------------------------------------------------

process.stdout.write('\n' + '─'.repeat(60) + '\n')
if (failures.length === 0) {
  process.stdout.write('\x1b[32m✓ everything green\x1b[0m\n')
  process.exit(0)
}
process.stdout.write(`\x1b[31m✗ ${failures.length} failure(s):\x1b[0m\n`)
for (const failure of failures) process.stdout.write(`  • ${failure}\n`)
process.exit(1)
