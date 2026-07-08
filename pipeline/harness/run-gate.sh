#!/usr/bin/env bash
# run-gate.sh — the OBJECTIVE gate for one pipeline cycle.
#
# Runs the four gates that hold the highest authority (CLAUDE.md §6 + the run's
# invariant "gate > model > instruction"): typecheck, lint, test, build. Any red
# gate exits non-zero and NO commit may follow (enforced by the human/agent
# operator, not by this script).
#
# Node 20 is mandatory (tests break on Node 25 — native localStorage vs jsdom;
# see .nvmrc). This script pins Node 20 from the Homebrew keg or nvm, else fails
# loudly rather than silently running the wrong runtime.
set -euo pipefail

# --- pin Node 20 -------------------------------------------------------------
if [ -x /opt/homebrew/opt/node@20/bin/node ]; then
  export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
elif [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh" && nvm use 20 >/dev/null
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" != "20" ]; then
  echo "GATE ABORT: Node 20 required, found $(node --version)." >&2
  exit 3
fi
echo "gate: node $(node --version)"

fail=0
run() {
  local name="$1"; shift
  echo "=== gate: $name ==="
  if "$@"; then
    echo "PASS: $name"
  else
    echo "FAIL: $name" >&2
    fail=1
  fi
}

# Order cheapest → most expensive so an early red gate surfaces fast, but always
# run all four so a cycle report captures the full gate picture in one pass.
run typecheck npm run typecheck
run lint      npm run lint
run test      npm test
run build     npm run build

if [ "$fail" -ne 0 ]; then
  echo "GATE: RED — do not commit." >&2
  exit 1
fi
echo "GATE: GREEN"
