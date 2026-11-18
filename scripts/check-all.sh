#!/usr/bin/env bash
# Validate the marketplace and validate + test every mod. Shared by CI and the pre-push hook.
set -eu

cd "$(dirname "$0")/.."

echo "== marketplace"
claude plugin validate . --strict

for manifest in */.claude-plugin/plugin.json; do
  mod="${manifest%%/*}"
  echo "== $mod"
  claude plugin validate "$mod" --strict
  claude plugin test "$mod"
done
