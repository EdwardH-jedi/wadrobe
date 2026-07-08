#!/usr/bin/env bash
# codex-review.sh — the REVIEW stage for one pipeline cycle.
#
# Sends the cycle's diff to Codex (the external reviewer) with a strict
# "review only, do NOT rewrite" contract. Codex must return problems only,
# each tagged with a severity (blocker / major / minor). It may NOT edit code —
# the implementer (Claude) owns every code change (run invariant §0).
#
# The gate has already run BEFORE this stage; a red gate means we never get
# here. Codex is a second opinion layered on top of an already-green gate.
#
# Usage: codex-review.sh <git-range>   (default: staged + unstaged vs HEAD)
set -euo pipefail

RANGE="${1:-HEAD}"
DIFF="$(git diff "$RANGE"; git diff --cached "$RANGE" 2>/dev/null || true)"
if [ -z "${DIFF//[$'\t\r\n ']/}" ]; then
  DIFF="$(git show --format= -p "$RANGE" 2>/dev/null || true)"
fi

PROMPT="You are the external REVIEWER in a two-agent pipeline. You review ONLY.
Absolute rules:
- Do NOT rewrite, edit, or produce corrected code. The implementer owns all edits.
- List PROBLEMS ONLY. For each: a severity tag in [blocker], [major], or [minor],
  the file:line, and one sentence on the defect and its concrete failure.
- Severity: blocker = ships broken behavior / breaks a gate / violates an
  explicit project invariant (see CLAUDE.md: honest copy, mock-by-default, zero
  network, pure reducer, backend/ untouched). major = real bug or regression risk
  a user could hit. minor = style/clarity/nit with no behavioral impact.
- If you find nothing at a severity, say so. Do not invent issues to seem useful.
- The objective gate (typecheck/lint/test/build) already passed on Node 20.

Review this diff:

${DIFF}"

echo "$PROMPT" | codex exec --sandbox read-only -
