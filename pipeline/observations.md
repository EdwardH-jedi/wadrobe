# Observations — pipeline-run-1

> ⚠️ 에이전트 자체 평가 — 자기평가 편향 가능, 사용자 재검토 필요.
> (Agent self-evaluation across cycles. Self-assessment bias is possible; user
> re-review needed before these observations drive a permanent policy.)

Accumulated across the observation rounds (Scope 1.2). Each cycle's full report
lives in `pipeline/cycles/cycle_N_report.md`.

| # | Task | Gate #1 | Codex verdict | Fix pass | Gate #2 | Outcome |
|---|------|---------|---------------|----------|---------|---------|
| 1 | Empty market-value hint (backlog #1) | GREEN | 0/0/0 | — | — | committed |
| 2 | Latest-value context in record panel | **RED→GREEN** (TDD) | major×1 → 0/0/0 | 1 of 2 | GREEN | committed |

## Running notes
- **Gate authority held** in every cycle so far — the gate runs before the
  review, and no review opinion can override a gate result.
- **Reviewer stayed review-only** — no code edits from Codex; it explores
  read-only and returns severity-tagged problems (or none).
- **Harness friction:** Codex emits a harmless `no such table: jobs` warning; and
  prints exploration before its verdict, so the harness saves full output to a
  file and greps the verdict.
- **Gate-block observed (cycle 2):** a test-first RED gate stopped the commit
  until the FEATURE was implemented (test never weakened). Empirical proof of
  gate authority.
- **Review earned its place (cycle 2):** Codex caught a runtime stale-snapshot
  bug that typecheck/lint/unit tests did not — no unit covered the
  open-modal-then-record flow. The review is a genuine second layer on a green
  gate, not redundant.
- **Fix loop terminated cleanly:** 1 of max-2 fix passes; re-review clean.
- **Watch item:** the cycle-2 fix touched 2 files beyond the stated task (scope
  creep pressure when a small task exposes a latent bug). The policy should keep
  the fix bounded and force it to be reported — done here.
