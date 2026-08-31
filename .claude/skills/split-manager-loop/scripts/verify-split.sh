#!/usr/bin/env bash
# verify-split.sh — post-split verification bundle for split-manager-loop.
#
# Chains the four checks that used to get assembled by hand after every
# orchestrator+worker RAM split (confirmed repeated 4x in one 2026-08-30
# session): npm run build -> activate-check -> ram-audit -> sync-verify
# (once per touched script).
#
# Usage: verify-split.sh <script-name-1> [<script-name-2> ...]
#   One or more script basenames (no .ts/.js extension) touched by the split
#   — typically the orchestrator plus its new worker(s), e.g.:
#     verify-split.sh foo-loop foo-agent-status foo-agent-act
#
# Prints one stage header + PASS/FAIL per stage, plus the full ram-audit
# table (the caller picks out the touched rows — filtering it here would
# have to special-case its "+ src/lib/..." breakdown sub-lines, not worth
# the fragility). Exits 0 only if build, activate-check, and every
# sync-verify call passed; ram-audit is informational and never fails
# the exit code on its own — a real regression there is a judgment call
# for the caller (compare against the before/after numbers), not a fixed
# pass/fail threshold.

set -uo pipefail

if [ "$#" -lt 1 ]; then
  echo "usage: verify-split.sh <script-name> [<script-name> ...]" >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT" || exit 1

OVERALL=0
BUILD_LOG="$(mktemp)"
trap 'rm -f "$BUILD_LOG"' EXIT

echo "=== 1/4 build ==="
if npm run build > "$BUILD_LOG" 2>&1; then
  echo "BUILD: PASS"
else
  echo "BUILD: FAIL"
  tail -n 40 "$BUILD_LOG"
  OVERALL=1
fi

echo
echo "=== 2/4 activate-check ==="
if node .claude/skills/activate-check/scripts/activate-check.mjs; then
  echo "ACTIVATE-CHECK: PASS"
else
  echo "ACTIVATE-CHECK: FAIL"
  OVERALL=1
fi

echo
echo "=== 3/4 ram-audit (full table — pick out the touched rows) ==="
node .claude/skills/ram-audit/scripts/ram-audit.mjs

echo
echo "=== 4/4 sync-verify (per touched script) ==="
for name in "$@"; do
  echo "--- $name ---"
  if ! .claude/skills/sync-verify/scripts/sync-verify.sh "$name"; then
    OVERALL=1
  fi
done

echo
if [ "$OVERALL" -eq 0 ]; then
  echo "VERDICT: PASS"
else
  echo "VERDICT: FAIL — see stage output above"
fi
exit "$OVERALL"
