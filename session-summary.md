## Session: 2026-08-30 — BN4.3 complete, BN6.1 (Bladeburner) started; augment/faction RAM split; bladeburner-loop built

_Older entries are in [session-summary-archive.md](session-summary-archive.md)._

**Focus**: BN4.3 finished for real (SF4.3, permanent) and the save moved into BN6.1. Two feature sessions followed: split the last two monolithic work-loop scripts (`augment-loop.ts`/`faction-work-loop.ts`) into orchestrator+worker pairs, and built `bladeburner-loop` as a 4th work-slot rotation candidate.

### What changed (and why)
- **BitNode transition** — `backdoor-loop.ts`'s `w0r1d_d43m0n` target (wired 2026-08-19) fired for real, destroying BN4 and granting SF4.3 (permanent 1x native Singularity RAM cost forever). Entered BN6.1 same day; researched Bladeburner mechanics via `/research` (8/8 sources) and confirmed Bladeburner is additive to the crime→gang path, not a replacement for it.
- **`7c80a3e`** — split `augment-loop.ts` (500.10GB reported / ~31GB real) and `faction-work-loop.ts` (386.10GB / ~21GB real) into 3.60GB orchestrators + transient workers, matching `gang-manager.ts`. First fixed `ram-costs.json`'s stale 16x singularity-cost tier (permanently wrong post-SF4.3) that was making these numbers look inflated. On request, also extracted the `readJson`/`isStale`/`dispatchOnce` duplication (5 orchestrators) into `src/lib/manager-dispatch.ts`, and centralized `NEUROFLUX_NAME`/`FactionName`. Five rounds of `code-review high` caught and fixed real regressions — most seriously, the new controller.ts kill-chase used `ns.kill(filename, host)` (zero-arg match only) against workers dispatched with JSON args, silently never killing them; replaced with PID-based `killAllInstances()`.
- **`763d8b0`** — built `bladeburner-stat-loop.ts` (gym-trains combat stats to 100) + `bladeburner-manager.ts` orchestrator + 4 transient workers, wired into `controller.ts`'s crime/faction/company work-slot rotation as a 4th candidate. Research's ~2.9GB single-script estimate didn't hold for this game version (`ns-cost-lookup` confirmed ~4GB per `ns.bladeburner.*` call, ~59-63GB for a lean single script) — built the orchestrator/worker split from the start. Bonus: fixed a real crash in `ns-cost-lookup.mjs` (a stray blank line in `gymWorkout`'s JSDoc broke its RAM-cost-line walk).
- **No code, informational** — clarified for the user that a gang's 0% "Territory Clash Chance" (engagement off) and its real 97.479% "Clash Win Chance" are different stats; the 99.5% engage-threshold automation is working as designed.

### Decisions
- Bladeburner is a 4th work-slot rotation candidate, not a gang-path replacement — gang income runs independently of the player's own action slot.
- Declined reconstituting the old monoliths' 5-minute Singularity-error backoff in the new workers (user's call, left at 30s) — it was insurance for a failure mode never observed live.
- Deferred a pre-existing (not introduced by this work) cross-faction candidate/donate-target overlap bug in `augment-loop.ts`'s gating, confirmed by `code-review` to predate the split.

### Issues / surprises
- Self-caught RAM regression mid-task: importing `NEUROFLUX_NAME` from a file that also exported `gatherFactionAugGaps` re-inflated both orchestrators from 3.60GB to 12.10GB — this repo's cost model charges a whole imported file's `ns.*` surface, not just the referenced symbol. Caught immediately via `ram-audit`, fixed with a separate zero-`ns`-import constants file.

### Next session
- Behavioral live confirmation of both the augment/faction split (augmentations bought/donated/installed, faction targets switching) and the bladeburner hand-off (stat-loop → manager) — both blocked on game-state (a gang existing; combat stats reaching 100) that this fresh BN6.1 save doesn't have yet.
- Fix the still-open `wantRespect` member-cap null bug once the gang hits cap again.
- Per `[[bitburner_bitnode_route]]`: BN6+BN7 is the current step; BN10 next after that.

**Commits**: `2956dd8..7c80a3e` (2 commits this session: `763d8b0`, `7c80a3e`)

---

**Focus**: Run all six `/improve-system` sub-skills in one pass — skill-upgrade, skill-suggestion, agent-suggestion, claude-rules, skill-audit, fewer-permission-prompts — auto-applying low-risk additive fixes and confirming structural ones.

### What changed (and why)
- **skill-upgrade** — new Gotcha on `diagnose-loop-bug` (Step 7's memory-file update can chain two stale `Edit`s: a body edit succeeds, then a frontmatter `modified:`-timestamp edit fails because its `old_string` predates the first edit). Traced from two real "String to replace not found" failures via full tool-call sequencing, not just the error string.
- **skill-suggestion** — full-history transcript mining (3 parallel `transcript-scanner` agents) found two real reuse candidates, both built: `sync-verify` (confirms a specific edited script's compiled output actually synced into the game, closing a gap `build-check`'s shallow liveness check doesn't cover) and `ship-fix` (chains `build-check` → `commit-and-push` for ordinary source fixes). Both smoke-tested live before the commit.
- **fewer-permission-prompts** — 6 verified read-only patterns added to a new `.claude/settings.json`; `ssh`/`virsh`/interpreters explicitly excluded despite high frequency (see Decisions).
- **agent-suggestion, claude-rules, skill-audit** — all three came back clean (full 130-transcript agent-spawn tally, all 5 standing rules present, 14/14 skills audited with 0 findings).

### Decisions
- Built `sync-verify` as a standalone companion to `build-check` rather than extending `build-check` itself — different cost/depth trade-off (cheap liveness check vs. deep per-file forensic check), better kept separate.
- Classified `ship-fix` as judgment-tier (no pinned `model:`), unlike `commit-and-push`'s `haiku` pin — it has a genuine judgment step (memory-doc-needed decision) `commit-and-push` doesn't.
- Excluded `ssh`/`virsh` from the permission allowlist despite 53x/33x transcript frequency — `ssh` is explicitly named as a shell-exec-equivalent in the skill's own rules; `virsh`'s uses mixed read-only and mutating subcommands (and came from a different project's transcripts).

### Issues / surprises
- None — a genuinely clean sweep on 3 of 6 sub-skills, and the other three completed without any blocking issues.

### Next session
- Reach for `ship-fix` when shipping an ordinary source fix instead of invoking `build-check`+`commit-and-push` separately; reach for `sync-verify` instead of the ad-hoc sync.log-grep-plus-mtime-compare dance when doubting whether a specific fix actually synced.
- Everything here is project-local — no NixOS rebuild needed, all live immediately.
- Gameplay/BitNode state (BN4.3, gang RAM-starvation fix, member-cap respect bug) unchanged this session — see the 2026-08-25 entry below for where that stands.

**Commits**: `c3de00a..ee2b1bb` (1 commit this session: `ee2b1bb`)

---

## Session: 2026-08-25 — real root cause of the "equipment gate not working" symptom: RAM starvation, not the gate

**Focus**: Two `diagnose-loop-bug` runs chasing gang-manager Territory Warfare complaints — the first was a false alarm, the second found and fixed a real RAM-starvation bug hiding behind yesterday's equipment-gate change.

### What changed (and why)
- **False alarm (no commit)** — user reported Territory Warfare not resuming after full equipment purchase. Traced `wantPowerGrowth`'s four gates against user-reported respect/equipment state: both `!wantRespect` and `!hasUnownedEquipment` were legitimately still unsatisfied (respect below threshold, Augmentation tab specifically not yet checked). Correct behavior, not a bug — documented as a false-alarm precedent in memory.
- **`2f69601`** — very next report was the opposite symptom: members stuck on Territory Warfare *despite owning no equipment*. Hand-traced a live `gang-state.json` paste against the gate logic and confirmed it computes correctly — the bug wasn't there. Root cause: `controller.ts`'s `currentReserveGb()` never reserved RAM for the *transient* `gang-agent-*.js` workers `gang-manager.ts` dispatches once running, so `gang-agent-status.js` (~21GB, the largest) permanently failed to dispatch, wedging the loop in its stale-report branch before it ever reached the decision code. Added `gangAgentWorkerReserveGb()`, reserving `max(status-alone, every action-worker summed)` — the two dispatch shapes the loop actually produces per tick.
- **Found, not fixed**: `report.respectForNextRecruitThreshold` is `null` once a gang hits its member cap, so `wantRespect`'s comparison (`respect < threshold`) evaluates `1 < null` → `false` via JS coercion, sticking `wantRespect` permanently false at cap regardless of real respect.

### Decisions
- Required a live `gang-state.json` paste before patching a second time, rather than guessing again from static code — hand-tracing real data is what separated "gate logic bug" from "gate logic never runs."
- Reserved `max(status, action-workers-summed)`, not the sum of all six worker scripts — only one of two dispatch shapes ever fires per tick, so summing everything would over-reserve.
- Deferred the member-cap respect bug rather than patching it mid-diagnosis — no researched at-cap respect target exists yet, and it wasn't this session's active symptom.

### Issues / surprises
- The equipment-gate fix from yesterday (`c8fc5ab`) was correct all along; the visible symptom two sessions in a row was actually the same underlying RAM-starvation bug class as the earlier `scan-root.js` fix, just never extended to gang-manager's own worker fleet after its 2026-08-10 orchestrator/worker split.

### Next session
- Confirm members actually switch off Territory Warfare onto a money task now (dispatch itself is confirmed fixed; task reassignment wasn't directly re-checked).
- Fix the `respectForNextRecruitThreshold === null` member-cap bug — needs a real at-cap respect target first.
- BN4.3 items carried forward unchanged (karma HUD window position, backdoor-loop `w0r1d_d43m0n` trigger, territory-warfare threshold, NFG-donation branch — all still unconfirmed live).

**Commits**: `d398077..2f69601` (1 commit this session: `2f69601`)

---

## Session: 2026-08-24 — gang-manager earns money for equipment before committing to Territory Warfare

**Focus**: User-directed fix — the gang should keep working money-earning tasks until every current member is fully equipped, only then switch to Territory Warfare, instead of jumping to territory the moment respect is capped.

### What changed (and why)
- **`c8fc5ab`** — `gang-manager.ts`: added a new "earn money" phase to `computeTaskAssignments`'s per-member priority chain, between respect-grinding and Territory Warfare. Previously, hitting the respect target sent members straight to Territory Warfare because rivals are almost always present — the existing "earn money" fallback branch was effectively dead code, so equipment/augmentations rarely got bought before territory play began (which pays $0/$0, so money growth stops right after the switch). Added `hasUnownedEquipment()`, gating the new phase (and `wantPowerGrowth`) on ownership rather than affordability, so an expensive item can't strand the gang mid-switch. Factored out `relevantEquipment()` so the gate shares its filter with the existing (unconditional, every-tick) `computeEquipmentPurchases()`.
- Also explained the gang-manager's full operation order to the user this session (per-tick dispatch order vs. per-member task-priority order) — informational only, no code change.

### Decisions
- Gate the new phase on equipment *ownership*, not current affordability — affordability-gating could permanently strand a pricier item the gang would never out-earn once territory's $0/$0 tasks take over.
- Self-correcting by design: a freshly recruited (unequipped) member flips `hasUnownedEquipment` true again, dropping the whole gang back to earning until they're geared up too — no special-casing needed for new recruits.

### Issues / surprises
- None — build-checked clean (`npm run build` exit 0), confirmed the compiled `dist/scripts/gang-manager.js` carries the new logic, `dev-watch` synced it in live.

### Next session
- Confirm the new phase actually holds in-game — watch a gang cycle with real unowned equipment to see it stay on earning tasks (not jump straight to territory), and confirm a new recruit re-triggers it.
- BN4.3 items carried forward unchanged (karma HUD window position, backdoor-loop `w0r1d_d43m0n` trigger, territory-warfare threshold, NFG-donation branch — all still unconfirmed live).

**Commits**: `0bcabd8..c8fc5ab` (1 commit this session: `c8fc5ab`)

---

## Session: 2026-08-20 — karma.ts gets a live HUD tail window; redundant tprint prefix dropped

**Focus**: Two small polish fixes, no BitNode progress — replace `karma.ts`'s one-shot karma print with a live HUD (karma + karma/minute), and drop a doubled-up `tprint` prefix in `gang-agent-found.ts`.

### What changed (and why)
- **`17cbd5f`** — `karma.ts`: replaced the one-shot `ns.tprint` of current karma with a persistent tail window (`ns.ui.openTail`/`resizeTail`/`moveTail`, following `battlestation.ts`'s existing pattern), showing current karma and karma/minute. Started at a 60s refresh, then tightened to 5s in the same session on request — the rate formula (`(karma - startKarma) / elapsedMinutesSinceStart`) is anchored to script-start time, not a per-poll delta, so the faster refresh only makes the karma number fresher without adding jitter to the rate.
- **`676046f`** — `gang-agent-found.ts`: dropped the manual `gang-agent-found: ` prefix from its `ns.tprint` call — Bitburner already prepends the calling script's filename to `tprint` output, so the printout was doubling up. Confirmed it was the only self-prefixing `tprint` call in the repo; left the sibling `ns.print` (tail-window output, no auto-prefix) alone.
- Aside, unrelated to this repo: also root-caused and fixed a global Claude Code annoyance (Remote Control auto-enabling every session start) by setting `remoteControlAtStartup: false` in `~/.claude/settings.json` — outside version control, no bitburner commit.

### Decisions
- Kept the karma rate keyed to script-start time rather than a rolling per-poll delta, specifically so refresh-interval tuning (60s → 5s) is free to change independently of rate smoothness.
- Skipped the full `/interview` ceremony for the karma HUD ask — a single, already-scoped request with an existing pattern (`battlestation.ts`) to follow and an obvious success criterion.

### Issues / surprises
- None — both fixes were straightforward, confirmed via `build-check`'s compile + sync-log verification.

### Next session
- Confirm `karma.ts`'s new tail window actually lands top-left as sized (300×120) — not yet visually checked in-game.
- BN4.3 items carried forward unchanged from the 2026-08-19 close below (backdoor-loop `w0r1d_d43m0n` trigger, territory-warfare threshold, NFG-donation branch — all still unconfirmed live).

**Commits**: `9e15d50..676046f` (2 commits this session: `17cbd5f`, `676046f`)

---

## Session: 2026-08-19 — backdoor-loop auto-completes the BitNode via w0r1d_d43m0n; BN4.2 done, BN4.3 started

**Focus**: Add `w0r1d_d43m0n` to `backdoor-loop.ts`'s target list so the BitNode gets destroyed automatically once reachable, then update memory to reflect BN4.2's completion (SF4.2 obtained) and the start of BN4.3.

### What changed (and why)
- **`2c41d2f`** — `backdoor-loop.ts`: added `w0r1d_d43m0n` to `TARGET_HOSTS`. The game's own `destroyW0r1dD43m0n()` doc says the hacking route can destroy the BitNode more cheaply via a plain `installBackdoor()` call on `w0r1d_d43m0n` itself — this repo's existing comment claimed the opposite (deliberately excluded, destroyed via `ns.hack()` instead), which was wrong. The Red Pill aug requirement that route needs is already covered by the loop's existing `The-Cave` gate, so no new code path was needed — just adding the host to the existing allowlist. Corrected the stale comment in the same commit. Build-checked clean, synced live; not yet exercised (no `w0r1d_d43m0n` reachable this session).
- Memory updates only, no further code: `[[bitburner_bn4_singularity]]`, `[[bitburner_singularity_locked]]`, `[[bitburner_bitnode_route]]`, and `MEMORY.md` all updated to reflect BN4.2 completed (SF4.2 obtained, outside-BN4 RAM multiplier 16x→4x) and BN4.3 (final clear toward SF4.3) now in progress.

### Decisions
- Used the existing generic install-backdoor-on-rooted-target loop rather than a dedicated destroy-BitNode script or a direct `destroyW0r1dD43m0n()` call — cheaper, and leaves the player on the BitVerse selection screen (no `nextBN` param on `installBackdoor`) so picking the next BitNode stays a manual choice per the researched route.

### Issues / surprises
- The repo's own `backdoor-loop.ts` comment about `w0r1d_d43m0n` turned out to be factually wrong (claimed `ns.hack()`-based destruction) — caught by reading the game's own type-definition doc comment rather than trusting the existing comment at face value.

### Next session
- Watch `backdoor-loop.ts` actually reach and backdoor `w0r1d_d43m0n` to confirm it destroys the BitNode as the docs describe — first real test whenever BN4.3 gets there.
- BN4.2's endgame specifics (territory-warfare threshold, NFG-donation branch, backdoor-loop allowlist, pre-NFG augment donations) were never explicitly confirmed before the transition — re-watch all of them fresh in BN4.3.
- After BN4.3 lands (SF4.3), move on to BN6+BN7 per `[[bitburner_bitnode_route]]`.

**Commits**: `eef195e..2c41d2f` (1 commit this session: `2c41d2f`)

---

