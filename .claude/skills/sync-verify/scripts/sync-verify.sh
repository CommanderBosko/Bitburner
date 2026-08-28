#!/usr/bin/env bash
# sync-verify.sh — Confirm one specific edited script actually synced into the
# running Bitburner game, not just that dev-watch's processes are alive.
#
# Usage: sync-verify.sh <script-name-or-path> [signature-string]
#   script-name-or-path: e.g. "augment-loop", "augment-loop.ts", or
#                         "src/scripts/augment-loop.ts" — all resolve to the
#                         same target.
#   signature-string:    optional distinctive snippet from the fix (e.g. a new
#                         function/variable name) to grep for in the compiled
#                         output, as the most conclusive proof the specific
#                         change landed (not just that *a* build happened).
#
# Exit 0 on PASS, 1 on STALE or FAIL.

set -uo pipefail

if [ "$#" -lt 1 ]; then
  echo "usage: sync-verify.sh <script-name-or-path> [signature-string]" >&2
  exit 1
fi

RAW="$1"
SIG="${2:-}"

# Normalize to a bare basename: strip any leading path and a trailing .ts/.js
BASENAME="$(basename "$RAW")"
BASENAME="${BASENAME%.ts}"
BASENAME="${BASENAME%.js}"

SRC="src/scripts/${BASENAME}.ts"
DIST="dist/scripts/${BASENAME}.js"
SYNC_LOG=".dev-watch/sync.log"

VERDICT="PASS"
REASONS=()

echo "==> sync-verify: ${BASENAME}"

if [ ! -f "$SRC" ]; then
  echo "SRC: not found ($SRC)"
  VERDICT="FAIL"
  REASONS+=("source file not found: $SRC")
else
  echo "SRC: $SRC"
fi

if [ ! -f "$DIST" ]; then
  echo "DIST: not found ($DIST)"
  VERDICT="FAIL"
  REASONS+=("compiled output not found: $DIST")
else
  echo "DIST: $DIST"
fi

echo
echo "--- most recent sync.log match for ${BASENAME}.js ---"
if [ -f "$SYNC_LOG" ]; then
  LOGMATCH="$(grep -n "${BASENAME}\.js" "$SYNC_LOG" | tail -1)"
  if [ -n "$LOGMATCH" ]; then
    echo "$LOGMATCH"
  else
    echo "(no match found in $SYNC_LOG)"
    VERDICT="FAIL"
    REASONS+=("no sync.log entry for ${BASENAME}.js — sync may never have run for this file")
  fi
else
  echo "(no $SYNC_LOG — has dev-watch ever run sync in this repo?)"
  VERDICT="FAIL"
  REASONS+=("$SYNC_LOG does not exist")
fi

if [ -f "$SRC" ] && [ -f "$DIST" ]; then
  echo
  echo "--- mtime comparison ---"
  SRC_MTIME="$(stat -c '%Y' "$SRC")"
  DIST_MTIME="$(stat -c '%Y' "$DIST")"
  NOW="$(date +%s)"
  echo "src  mtime: $(date -d "@$SRC_MTIME" '+%Y-%m-%d %H:%M:%S')"
  echo "dist mtime: $(date -d "@$DIST_MTIME" '+%Y-%m-%d %H:%M:%S')"
  if [ "$DIST_MTIME" -lt "$SRC_MTIME" ]; then
    echo "STALE: dist is older than src — the edit hasn't been compiled/synced yet"
    VERDICT="STALE"
    REASONS+=("dist/scripts/${BASENAME}.js predates the last src edit")
  fi
fi

if [ -n "$SIG" ] && [ -f "$DIST" ]; then
  echo
  echo "--- signature check: \"$SIG\" in $DIST ---"
  SIGCOUNT="$(grep -c -- "$SIG" "$DIST" 2>/dev/null || true)"
  if [ "${SIGCOUNT:-0}" -gt 0 ]; then
    echo "found ($SIGCOUNT match(es)) — the specific fix is present in the compiled output"
  else
    echo "not found — the compiled output does not contain this signature"
    if [ "$VERDICT" = "PASS" ]; then
      VERDICT="FAIL"
    fi
    REASONS+=("signature \"$SIG\" not found in $DIST")
  fi
fi

echo
echo "VERDICT: $VERDICT"
if [ "${#REASONS[@]}" -gt 0 ]; then
  for r in "${REASONS[@]}"; do
    echo "  - $r"
  done
fi

[ "$VERDICT" = "PASS" ] && exit 0 || exit 1
