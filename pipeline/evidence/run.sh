#!/usr/bin/env bash
# Bundle the evidence generator (so it can import the app's real cutout TS) and
# run it. Reuses the REAL removeBackground — no reimplementation, no divergence.
#   run.sh <input.png> <output.png>
set -euo pipefail
cd "$(dirname "$0")/../.."
IN="${1:?input png}"
OUT="${2:?output png}"
TMP="$(mktemp -t gen-evidence-XXXX).mjs"
node_modules/.bin/esbuild pipeline/evidence/gen-cutout-evidence.ts \
  --bundle --platform=node --format=esm --log-level=warning --outfile="$TMP"
node "$TMP" "$IN" "$OUT"
rm -f "$TMP"
