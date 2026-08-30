import type { NS } from "../NetscriptDefinitions";
import type { AugmentFactionSnapshot, AugmentStateReport } from "../lib/types";
import { gatherFactionAugGaps } from "../lib/singularity-factions";

// Sole writer of this path - see lib/types.ts's AugmentStateReport comment.
const AUGMENT_STATE_PATH = "/data/augment-state.json";

export async function main(ns: NS): Promise<void> {
	// try/catch + no report write on failure, matching augment-agent-act.ts and the original
	// monolithic augment-loop.ts's own singularity-unavailable guard (see that file's
	// SINGULARITY_UNAVAILABLE_RETRY_MS history) - without this, a thrown ns.singularity.* call here
	// would crash this one-shot worker silently and leave the report stale with no diagnostic,
	// instead of just skipping this refresh and letting augment-loop.ts retry next tick.
	try {
		const player = ns.getPlayer();
		// gang.inGang()/getGangInformation() are 0/2GB respectively (see ram-costs.json) - trivial
		// next to the singularity.* calls below, and augment-loop.ts only ever dispatches this
		// script once already in a gang, but the report shape stays defined either way.
		const gangFaction = ns.gang.inGang() ? ns.gang.getGangInformation().faction : null;

		// gatherFactionAugGaps covers the rep/repReq scan shared with faction-agent-status.ts; price
		// is enriched separately here since it's an augment-loop.ts-only need (see that helper's own
		// comment for why it isn't baked into the shared function).
		const factions: AugmentFactionSnapshot[] = gatherFactionAugGaps(ns, player.factions).map((f) => ({
			faction: f.faction,
			rep: f.rep,
			augmentations: f.augmentations.map((a) => ({ ...a, price: ns.singularity.getAugmentationPrice(a.name) })),
		}));

		const report: AugmentStateReport = {
			playerMoney: player.money,
			factionRepMult: player.mults.faction_rep,
			gangFaction,
			installedList: ns.singularity.getOwnedAugmentations(false),
			ownedList: ns.singularity.getOwnedAugmentations(true),
			factions,
			writtenAt: Date.now(),
		};
		ns.write(AUGMENT_STATE_PATH, JSON.stringify(report, null, 2), "w");
		ns.print(`augment-agent-status: ${factions.length} faction(s), $${Math.round(player.money).toLocaleString()}`);
	} catch (error) {
		ns.print(`augment-agent-status: singularity unavailable (${String(error)})`);
	}
}
