import type { NS } from "../NetscriptDefinitions";
import type { FactionName, FactionWorkPayload } from "../lib/types";

// "Hacking Contracts" - per jobs.md's researched faction-work comparison: 2x Field Work's hacking
// XP, 4x Security Work's, and the only one of the three whose reputation formula is dominated by
// hacking skill rather than combat stats.
const WORK_TYPE = "hacking";

// faction-work-loop.ts already ranked candidates by augment-rep-gap (orderFactionsByAugmentGap,
// a pure function over its cached faction-work-state.json report) - this script is just the live
// workForFaction/stopAction calls that decision needs. The payload shape itself
// (FactionWorkPayload) lives in lib/types.ts, shared with faction-work-loop.ts on the other side
// of this ns.exec/JSON boundary - see that file's own comment for why.

export async function main(ns: NS): Promise<void> {
	try {
		// Parsing inside the try too - a malformed/stale-build payload should hit the same catch as
		// a thrown singularity call, not crash uncaught before any diagnostic prints.
		const payload = JSON.parse(ns.args[0] as string) as FactionWorkPayload;

		let newTarget: string | null = null;
		for (const candidate of payload.ordered) {
			const alreadyWorkingHere = payload.alreadyWorkingFaction === candidate;
			if (alreadyWorkingHere || ns.singularity.workForFaction(candidate as FactionName, WORK_TYPE, false)) {
				newTarget = candidate;
				break;
			}
		}

		// Nothing worth targeting (every candidate's workForFaction attempt failed, or `ordered` was
		// empty) but a previous tick's faction work may still be running - release it so
		// getCurrentWork() stops reporting type "FACTION", which is the signal controller.ts's
		// decideActiveWorkScript polls for to hand the work slot to bladeburner/company instead.
		if (newTarget === null && payload.alreadyWorkingFaction !== null) {
			ns.singularity.stopAction();
		}

		ns.print(`faction-agent-work: target=${newTarget === null ? "(none)" : newTarget}`);
	} catch (error) {
		ns.print(`faction-agent-work: error (${String(error)})`);
	}
}
