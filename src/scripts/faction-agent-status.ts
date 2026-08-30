import type { NS } from "../NetscriptDefinitions";
import type { FactionCurrentWork, FactionWorkStateReport } from "../lib/types";
import { gatherFactionAugGaps } from "../lib/singularity-factions";

// Sole writer of this path - see lib/types.ts's FactionWorkStateReport comment.
const FACTION_WORK_STATE_PATH = "/data/faction-work-state.json";

export async function main(ns: NS): Promise<void> {
	// try/catch + no report write on failure, matching faction-agent-work.ts and the original
	// monolithic faction-work-loop.ts's own singularity-unavailable guard (see that file's
	// SINGULARITY_UNAVAILABLE_RETRY_MS history) - without this, a thrown ns.singularity.* call here
	// would crash this one-shot worker silently and leave the report stale with no diagnostic,
	// instead of just skipping this refresh and letting faction-work-loop.ts retry next tick.
	try {
		// Auto-join any pending invitations before gathering the rest of the report, same order the
		// original monolithic faction-work-loop.ts used - a faction joined this same pass is already
		// included in ns.getPlayer().factions below.
		for (const faction of ns.singularity.checkFactionInvitations()) {
			if (ns.singularity.joinFaction(faction)) {
				ns.print(`faction-agent-status: joined ${faction}`);
			}
		}

		const rawCurrentWork = ns.singularity.getCurrentWork();
		const currentWork: FactionCurrentWork | null =
			rawCurrentWork === null
				? null
				: { type: rawCurrentWork.type, factionName: rawCurrentWork.type === "FACTION" ? rawCurrentWork.factionName : null };

		const factions = gatherFactionAugGaps(ns, ns.getPlayer().factions);

		const report: FactionWorkStateReport = {
			currentWork,
			owned: ns.singularity.getOwnedAugmentations(true),
			factions,
			writtenAt: Date.now(),
		};
		ns.write(FACTION_WORK_STATE_PATH, JSON.stringify(report, null, 2), "w");
		ns.print(`faction-agent-status: ${factions.length} joined faction(s)`);
	} catch (error) {
		ns.print(`faction-agent-status: singularity unavailable (${String(error)})`);
	}
}
