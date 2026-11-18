#!/usr/bin/env bash
# PostToolUse hook (Edit|Write): after a file inside a mod folder changes,
# validate that mod and run its tests. Exit 2 feeds the failure back to Claude.
set -u

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
file="$(jq -r '.tool_input.file_path // empty')"
[ -n "$file" ] || exit 0

# Mod folder = first path segment under the repo root that holds .claude-plugin/plugin.json
rel="${file#"$root"/}"
[ "$rel" != "$file" ] || exit 0
mod="${rel%%/*}"
[ -f "$root/$mod/.claude-plugin/plugin.json" ] || exit 0

out="$(cd "$root" && claude plugin validate "$mod" 2>&1 && claude plugin test "$mod" 2>&1)"
status=$?
if [ $status -ne 0 ]; then
  echo "Mod check failed for $mod:" >&2
  echo "$out" | tail -40 >&2
  exit 2
fi
exit 0
