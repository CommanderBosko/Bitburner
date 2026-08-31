---
name: ship-fix
description: Verify and ship an ordinary src/scripts/*.ts bug fix in one command — build-check, then commit-and-push. Use when the user says "ship this fix", "ship-fix", "verify and ship", "build check then commit and push", or "ship the fix".
---

# Ship Fix

Chain the existing `build-check` and `commit-and-push` skills into one invocation, for the common case of a source-code fix that needs to compile-verify and then ship together — mirroring how `commit-and-push` already chains `git-commit` + `git-push`. (Bucket: Orchestration)

## Steps

1. Invoke the `build-check` skill. If it reports `BUILD: FAIL`, stop here and report the compile errors exactly as `build-check` printed them — do not proceed to shipping a broken build.
2. If `build-check` passes but reports the `dev-watch` sync as `NOT RUNNING` or otherwise inconclusive, note that plainly and point at the `dev-watch` (bring the watchers up) or `sync-verify` (confirm this specific file landed) skills — but don't block shipping on it. The source fix is still valid to commit even while the live in-game sync is momentarily down; catching up the sync is a separate concern from shipping the code.
3. Check whether this fix needs a project-memory doc update, per this repo's established convention of documenting symptom → root cause → fix with `**Why:**`/`**How to apply:**` lines (see `diagnose-loop-bug`'s Step 7 for the exact convention). If a memory doc for this fix was already written or updated earlier in the conversation, skip this — don't ask again. Otherwise, use the **AskUserQuestion** tool (not free-form prose) with options **Yes, write/update the memory doc** (write or update the relevant file under `memory/` following the existing frontmatter convention before continuing) and **No, skip it**.
4. Invoke the `commit-and-push` skill to commit and push the fix. Let it run its own normal flow (message drafting, secret-file check, push confirmation) rather than re-doing any of that here.
5. Report back: the `build-check` result (and sync status if inconclusive), whether a memory doc was touched, and the `commit-and-push` result (commit message, push outcome).
