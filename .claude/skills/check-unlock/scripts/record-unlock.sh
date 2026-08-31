#!/usr/bin/env bash
# record-unlock.sh — append a formatted "Programs unlocked" bullet to progression
# memory. Companion to check-unlock.sh (kept separate: that script only inspects
# NetscriptDefinitions.d.ts/src, this one is the only thing that writes memory).
set -euo pipefail

if [[ $# -ne 3 ]]; then
	echo "usage: record-unlock.sh <Program.exe> \"<one-line description + ns.* hook finding>\" \"<code-change verdict>\"" >&2
	exit 1
fi

PROGRAM="$1"
DESCRIPTION="$2"
VERDICT="$3"
TODAY="$(date +%Y-%m-%d)"
MEMORY_FILE="/home/bosko/.claude/projects/-home-bosko-projects-bitburner/memory/bitburner_progression.md"

if [[ ! -f "$MEMORY_FILE" ]]; then
	echo "memory file not found: $MEMORY_FILE" >&2
	exit 1
fi

BULLET="- **${PROGRAM}** (unlocked ${TODAY}). ${DESCRIPTION} ${VERDICT}"

LAST_BULLET_LINE="$(grep -n '^- \*\*' "$MEMORY_FILE" | tail -1 | cut -d: -f1)"
if [[ -z "$LAST_BULLET_LINE" ]]; then
	echo "no existing '- **' bullet found under '## Programs unlocked' in $MEMORY_FILE — append by hand" >&2
	exit 1
fi

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
awk -v n="$LAST_BULLET_LINE" -v bullet="$BULLET" 'NR==n{print; print bullet; next} {print}' "$MEMORY_FILE" > "$TMP"
mv "$TMP" "$MEMORY_FILE"

echo "appended to $MEMORY_FILE:"
echo "$BULLET"
