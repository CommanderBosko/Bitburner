---
name: split-manager-loop
description: Split an existing RAM-heavy monolithic Bitburner background-loop script into a cheap resident orchestrator plus transient worker script(s) — the pattern already applied by hand to gang-manager.ts, corp-manager.ts, bladeburner-manager.ts, augment-loop.ts, and faction-work-loop.ts. Use when the user says "split this loop's RAM", "this script's RAM is too high, split it", "apply the RAM-split pattern to X", "orchestrator+worker split for X", or "/split-manager-loop".
---

# Split Manager Loop

Convert an existing monolithic Bitburner background-loop script — one whose static RAM cost has grown because it references several expensive resident `ns.*` calls (typically `ns.singularity.*`/`ns.gang.*`/`ns.corporation.*`/`ns.bladeburner.*`, ~4GB+ each) — into a cheap resident orchestrator plus transient worker script(s) dispatched via `ns.exec`. (Bucket: Utility)

This is a **refactor of an existing script**, not scaffolding a new one — `new-background-loop` covers that case (a brand-new persistent script chain-launched onto the boot sequence) and `new-worker-script` covers a single minimal ns-call worker (like `hack.ts`). This skill is for the specific "this script got too expensive to keep resident" refactor, which has now recurred five times in this repo (`gang-manager.ts`, `corp-manager.ts`, `bladeburner-manager.ts`, `augment-loop.ts`, `faction-work-loop.ts`) with the same shape each time. The canonical reference implementation is the 2026-08-30 `augment-loop.ts`/`faction-work-loop.ts` split — read `src/scripts/augment-loop.ts`, `src/scripts/augment-agent-status.ts`, `src/scripts/augment-agent-act.ts`, `src/lib/manager-dispatch.ts`, and `src/scripts/controller.ts`'s `AGENT_WORKER_FLEETS`/`agentWorkerReserveGb`/`allAgentWorkerScripts` region before starting — don't design the split from first principles when a working, already-reviewed example exists.

## Arguments

- **Target script** (required) — the `src/scripts/<name>.ts` file to split. The user names it directly or points at a `ram-audit`/`ns-cost-lookup` finding.

## Steps

### 1. Confirm the target actually qualifies

Run `ram-audit` (`node .claude/skills/ram-audit/scripts/ram-audit.mjs`) and check the target's row, or `ns-cost-lookup` on its suspect `ns.*` calls. It qualifies if several distinct RAM-heavy resident calls (typically `ns.singularity.*`/`ns.gang.*`/`ns.corporation.*`/`ns.bladeburner.*`) are inflating its static cost well past what its actual per-tick decision logic needs — the tell in every prior case was a script whose real branching logic is cheap pure computation, but whose *cost* is dominated by a handful of live-read/live-mutate calls it only needs once per tick, not permanently resident.

If the target doesn't show this shape (e.g. its cost comes from one or two calls, or from logic that genuinely needs to run every tick), this isn't the right refactor — say so and stop rather than forcing the pattern.

### 2. Design the split

Three pieces:
- **`<name>-agent-status.ts`** (transient) — does the live reads, writes a JSON report to `/data/<name>-state.json`. Report shape gets a new interface in `src/lib/types.ts` (see Step 4).
- **One or more `<name>-agent-*.ts`** (transient) — does the live mutating call(s).
- **`<name>.ts`** (stays resident, this is the orchestrator) — becomes pure decision logic over the cached report. Zero direct calls into the expensive subsystem; only `ns.exec`/`ns.read`/`ns.fileExists`/`ns.rm`/`ns.print`/`ns.sleep` plus whatever cheap/free calls it needs to gate the loop (e.g. `ns.gang.inGang()`).

**Combine vs. split the action worker(s):** `augment-agent-act.ts` stays one file because its actions (buy → donate → NeuroFlux → install) share a strict same-tick ordering dependency — see that file's own sequencing comment, and `bitburner_augment_loop_nfg_gate` memory for the multi-round history of bugs from getting that sequencing wrong by hand. `gang-manager.ts` instead dispatches 5 separate `gang-agent-*.ts` workers because its actions (task assignment, equipment, recruit, ascend, warfare) are independent per-tick choices with no ordering dependency on each other. Judge the target the same way: order-dependent actions stay in one combined act-worker; independent ones get their own files.

### 3. Reuse the shared dispatch helpers

Import `readJson`, `isStale`, and `dispatchOnce` from `src/lib/manager-dispatch.ts` in the new orchestrator. **Never hand-copy these again** — a 2026-08-30 code review found and fixed exactly that duplication across all five prior splits.

### 4. Define the report/payload shapes

Add new interfaces to `src/lib/types.ts` — mirror `AugmentStateReport`/`AugmentActPayload`'s shape. Every report interface needs a `writtenAt` timestamp field for `isStale()` to check.

### 5. Wire it into `controller.ts`

Add an entry to `AGENT_WORKER_FLEETS` (`{ statusScript, actionScripts }`) so `agentWorkerReserveGb`/`allAgentWorkerScripts` pick it up automatically for RAM reservation. If the orchestrator belongs to a mutually-exclusive work-slot group (like `faction-work-loop.js`/`bladeburner-manager.js`/`company-work-loop.js`/`crime-loop.js`), confirm the existing exclusivity kill-chase loop (which reads `allAgentWorkerScripts()`) covers it — but not every orchestrator needs to be in an exclusivity group (`gang-manager.js` and `augment-loop.js` aren't; their `AGENT_WORKER_FLEETS` entries exist only for the RAM-reserve math). Judge per the target script's own semantics, don't default to adding it to an exclusivity group.

### 6. Verify

Once the split compiles, run:

```bash
.claude/skills/split-manager-loop/scripts/verify-split.sh <orchestrator-name> <worker-name-1> [<worker-name-2> ...]
```

This chains `npm run build` → `activate-check` → `ram-audit` → `sync-verify` (once per touched script) — the exact four-step sequence that used to get assembled by hand after every prior split. It prints one PASS/FAIL per stage plus the full `ram-audit` table; pick out the touched rows yourself to confirm the orchestrator's resident cost actually dropped and each worker's cost looks reasonable — `ram-audit` is informational in this script (it never fails the exit code), since "did the number improve" is a judgment call against the specific before/after numbers, not a fixed threshold. Treat a non-zero exit (build, activate-check, or any sync-verify stage failing) as blocking; fix and re-run before reporting success.

### 7. Update memory

Write or update a project memory entry documenting the before/after RAM numbers — matches every prior split's own memory entry (e.g. `bitburner_gang_manager_ram_split.md`, `bitburner_augment_faction_ram_split.md`). If this is the first time the target's subsystem has been split, note that explicitly; if it's a repeat pattern for an already-documented subsystem, update the existing entry rather than creating a duplicate.

## Scripts

- `scripts/verify-split.sh <script-name> [<script-name> ...]` — Step 6's verification bundle (build → activate-check → ram-audit → sync-verify per script). Exits 0 only if build, activate-check, and every sync-verify call passed. Called directly in Step 6.
