---
name: sync-verify
description: Confirm one specific edited script actually synced into the running Bitburner game — not just that dev-watch's processes are alive. Use when the user says "did this sync", "confirm X synced", "verify sync landed", "check the sync log for X", "sync-verify", or "did the fix actually reach the game".
model: haiku
---

# Sync Verify

Given the path or name of a script that was just edited, confirm the exact compiled file reached the running game via `bitburner-filesync` — checking the sync log, source/output mtimes, and (optionally) the compiled code itself for a signature of the change. (Bucket: Verification)

This is a companion to `build-check`, not a replacement. `build-check` confirms the build compiles and that `dev-watch`'s watch/sync *processes* are alive — a shallow liveness check. It stays that way; this skill exists for the deeper, per-file question `build-check` doesn't answer: **did *this specific* fix actually land in the running game**, not just that *some* sync happened recently. Reach for this after `build-check` passes when there's still doubt — e.g. a stale `dev-watch` PID (see `bitburner_devwatch_pid_reuse.md`) can leave `SYNC: running` true while the actual push silently stopped.

## Arguments

- **Script name or path** (required) — e.g. `augment-loop`, `augment-loop.ts`, or `src/scripts/augment-loop.ts`. All resolve to the same target (`src/scripts/<name>.ts` / `dist/scripts/<name>.js`).
- **Signature string** (optional) — a distinctive snippet from the fix (a new function/variable/string literal) to grep for in the compiled output. Use this when the mtime/log checks alone aren't conclusive — it's the strongest possible evidence the specific change landed, not just that a build happened.

## Steps

1. Run the check:
   ```bash
   .claude/skills/sync-verify/scripts/sync-verify.sh <script-name-or-path> [signature-string]
   ```
   This prints, in order: source/dist file existence, the most recent `.dev-watch/sync.log` line mentioning the compiled filename, an mtime comparison (flagging `dist` older than `src` as stale), and — if a signature string was given — whether it's present in the compiled output. It ends with a `VERDICT: PASS|STALE|FAIL` line and a reason list, exiting 0 on PASS and 1 otherwise.

2. Relay the result:
   - **PASS** — report plainly that the fix is confirmed synced, citing the sync.log timestamp (and the signature match, if one was checked).
   - **STALE** — the source was edited more recently than the compiled output. Point at `dev-watch` (`dev-watch status` — check for the PID-reuse false-positive noted in its Gotchas — or `dev-watch stop`/`start` for a fresh sync) rather than re-editing the source; the fix likely never got the chance to compile/sync.
   - **FAIL** — report the specific reason(s) printed (missing file, no sync.log entry, signature not found). If a signature check failed but the mtimes look fine, treat it as inconclusive rather than assuming the fix is entirely absent — suggest re-running with a different, more distinctive signature string before concluding the code truly didn't land.

## Scripts

- `scripts/sync-verify.sh <script-name-or-path> [signature-string]` — Step 1's full check (log match, mtime comparison, optional signature grep). Read-only. Exit 0 on PASS, 1 on STALE/FAIL. Called directly in Step 1.
