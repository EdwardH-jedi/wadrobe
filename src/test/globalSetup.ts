// Runs once, in the main process, before any test worker starts.
//
// Its whole job is to build the Swift verification binary exactly once and
// publish its path, so that no test ever calls `swift run` and no two workers
// contend for the SwiftPM lock. See `src/test/wardrobeDomain.ts` for the full
// reasoning.
import { buildWardrobeVerify, SWIFT_PACKAGE, wardrobeDomainPresent } from './wardrobeDomain'

export default function setup(): void {
  if (!wardrobeDomainPresent) {
    // Not an error: the cross-boundary suites are designed to skip when the
    // package is absent, so the web repository stands alone. Phase 4's runner
    // is what decides whether skipping is acceptable for a given invocation.
    console.log(
      `[globalSetup] no Swift package at ${SWIFT_PACKAGE} — ` +
        'cross-boundary suites will skip.',
    )
    return
  }

  const started = Date.now()
  const binary = buildWardrobeVerify()
  process.env.WARDROBE_VERIFY_BIN = binary
  console.log(
    `[globalSetup] built wardrobe-verify in ` +
      `${((Date.now() - started) / 1000).toFixed(1)}s → ${binary}`,
  )
}
