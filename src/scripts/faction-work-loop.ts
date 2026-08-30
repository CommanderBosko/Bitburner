import type { NS } from "../NetscriptDefinitions";
import type { FactionCandidateSnapshot, FactionWorkPayload, FactionWorkStateReport } from "../lib/types";
import { dispatchOnce, isStale, readJson } from "../lib/manager-dispatch";
import { NEUROFLUX_NAME } from "../lib/singularity-constants";

// Split into a cheap orchestrator + transient faction-agent-*.ts workers (2026-08-30, same
// RAM-split shape as gang-manager.ts/corp-manager.ts/bladeburner-manager.ts/augment-loop.ts - see
// [[bitburner_bn4_singularity]]): the previous single-file faction-work-loop.ts referenced 8
// distinct ns.singularity.* functions permanently (~21GB native once SF4.3's multiplier is
// accounted for - see [[bitburner_singularity_ram_tier_stale]]). faction-agent-status.ts
// (transient) bears almost the whole read cost (plus auto-joining pending invitations, cheap and
// idempotent so it's folded into the same status pass rather than a third worker); this file makes
// every decision as pure computation over that cached report (orderFactionsByAugmentGap below never
// touches `ns.singularity.*`) and dispatches faction-agent-work.ts (transient) for the one live
// workForFaction/stopAction decision each tick actually needs. This file's own resident cost is now
// just ns.exec/ns.read/ns.fileExists/ns.rm/ns.print/ns.sleep.
const FACTION_AGENT_STATUS_SCRIPT = "scripts/faction-agent-status.js";
const FACTION_AGENT_WORK_SCRIPT = "scripts/faction-agent-work.js";

// Sole writer is faction-agent-status.ts - kept in sync by hand, matching gang-manager.ts's
// GANG_STATE_PATH convention (not centralized).
const FACTION_WORK_STATE_PATH = "/data/faction-work-state.json";

const FACTION_WORK_LOOP_INTERVAL_MS = 30000;
// How long a cached faction-work-state.json report is trusted before re-dispatching
// faction-agent-status.ts - set equal to the loop interval, matching augment-loop.ts's identical
// shape (see that file's own comment: a tick that dispatches faction-agent-work.ts deletes the
// report right after, so the following tick only refreshes status - real decide cadence after a
// dispatch is up to ~2x this interval, not this interval itself).
const STATUS_REFRESH_MS = 30000;
// Tie-break only: used when two+ joined factions are equally promising by augment-rep-gap - not a
// fixed default target, see orderFactionsByAugmentGap.
const PREFERRED_FIRST_FACTION = "CyberSec";

// Top-ranked candidate as of the last tick this orchestrator logged a change - null until the
// first decision is made. Restores the original monolithic faction-work-loop.ts's "switching
// target X -> Y" signal (lost when the actual workForFaction call moved into the transient,
// state-free faction-agent-work.ts): this tracks what the orchestrator is now prioritizing, not
// confirmed workForFaction success (that's faction-agent-work.ts's own per-dispatch "target="
// print) - close enough to have been load-bearing for diagnosing this repo's repeated NFG/
// gap-starvation bug class, see [[bitburner_augment_loop_nfg_gate]].
let lastLoggedTarget: string | null = null;

// Ranks joined factions by how close they are to unlocking their next real augmentation -
// ascending reputation gap first. Factions with nothing left to grind rep for (every augment
// either owned or already at sufficient rep, NeuroFlux Governor included) are dropped entirely -
// see the original faction-work-loop.ts history for the multi-round bug this exact exclusion
// fixed (a faction with only NFG left never dropping out of `ordered`, permanently starving
// company-work-loop.js of the work slot).
function orderFactionsByAugmentGap(factions: FactionCandidateSnapshot[], owned: Set<string>): string[] {
	const gapByFaction = new Map<string, number>();

	for (const f of factions) {
		let minGap = Infinity;
		for (const aug of f.augmentations) {
			if (aug.name === NEUROFLUX_NAME || owned.has(aug.name)) continue;
			const gap = aug.repReq - f.rep;
			if (gap > 0 && gap < minGap) minGap = gap;
		}
		gapByFaction.set(f.faction, minGap);
	}

	return factions
		.map((f) => f.faction)
		.filter((f) => {
			const gap = gapByFaction.get(f);
			return gap !== undefined && gap < Infinity;
		})
		.sort((a, b) => {
			// Explicit undefined checks instead of `??` - this project's ram-audit skill has a
			// confirmed finding that the game's own static RAM analyzer sometimes attributes an
			// unrelated ~10GB phantom charge to scripts using the nullish-coalescing operator. Both a
			// and b already passed the finite-gap filter above, so these fallbacks are purely
			// defensive and never actually hit.
			const gaRaw = gapByFaction.get(a);
			const gbRaw = gapByFaction.get(b);
			const ga = gaRaw === undefined ? Infinity : gaRaw;
			const gb = gbRaw === undefined ? Infinity : gbRaw;
			if (ga !== gb) return ga - gb;
			return a === PREFERRED_FIRST_FACTION ? -1 : b === PREFERRED_FIRST_FACTION ? 1 : 0;
		});
}

export async function main(ns: NS): Promise<void> {
	ns.disableLog("ALL");
	ns.print("faction-work-loop: starting");

	while (true) {
		const report = readJson<FactionWorkStateReport>(ns, FACTION_WORK_STATE_PATH);
		if (!report || isStale(report.writtenAt, STATUS_REFRESH_MS)) {
			dispatchOnce(ns, "faction-work-loop", FACTION_AGENT_STATUS_SCRIPT);
			await ns.sleep(FACTION_WORK_LOOP_INTERVAL_MS);
			continue;
		}

		const owned = new Set(report.owned);
		const ordered = orderFactionsByAugmentGap(report.factions, owned);
		const alreadyWorkingFaction = report.currentWork !== null && report.currentWork.type === "FACTION" ? report.currentWork.factionName : null;

		ns.print(`faction-work-loop: ordered=[${ordered.join(", ")}] alreadyWorking=${alreadyWorkingFaction === null ? "(none)" : alreadyWorkingFaction}`);

		const topCandidate = ordered.length > 0 ? ordered[0] : null;
		if (topCandidate !== lastLoggedTarget) {
			ns.print(`faction-work-loop: switching target ${lastLoggedTarget === null ? "(none)" : lastLoggedTarget} -> ${topCandidate === null ? "(none)" : topCandidate}`);
			lastLoggedTarget = topCandidate;
		}

		// Dispatch whenever there's a candidate to try OR a previous tick's work needs releasing
		// (nothing left worth targeting but still marked FACTION) - matches the original monolithic
		// script's unconditional per-tick workForFaction/stopAction pass.
		if (ordered.length > 0 || alreadyWorkingFaction !== null) {
			const payload: FactionWorkPayload = { ordered, alreadyWorkingFaction };
			// Force a fresh status snapshot before deciding again, rather than trusting this report
			// until its own STATUS_REFRESH_MS timer expires - same re-verify-before-repeat protection
			// gang-manager.ts/bladeburner-manager.ts/augment-loop.ts give their own decision ticks.
			if (dispatchOnce(ns, "faction-work-loop", FACTION_AGENT_WORK_SCRIPT, JSON.stringify(payload))) ns.rm(FACTION_WORK_STATE_PATH, "home");
		}

		await ns.sleep(FACTION_WORK_LOOP_INTERVAL_MS);
	}
}
