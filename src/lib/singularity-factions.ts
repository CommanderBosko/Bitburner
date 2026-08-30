import type { NS } from "../NetscriptDefinitions";
import type { FactionCandidateSnapshot, FactionName } from "./types";

// Shared by augment-agent-status.ts/faction-agent-status.ts - both scan the same per-faction
// rep + per-augmentation rep-requirement data (getFactionRep/getAugmentationsFromFaction/
// getAugmentationRepReq), just over a different faction list. augment-agent-status.ts additionally
// enriches each entry with a live price afterward (see its own call site) - kept out of this
// shared helper since faction-agent-status.ts has no use for it, and adding it here would give
// faction-agent-status.ts a reason to reference ns.singularity.getAugmentationPrice it never
// otherwise needs (this repo's RAM cost model charges per distinct ns.* method an entry file's
// whole transitive import closure references, regardless of which file textually calls it).
export function gatherFactionAugGaps(ns: NS, factions: string[]): FactionCandidateSnapshot[] {
	return factions.map((faction) => {
		const rep = ns.singularity.getFactionRep(faction as FactionName);
		const augmentations = ns.singularity.getAugmentationsFromFaction(faction as FactionName).map((name) => ({
			name,
			repReq: ns.singularity.getAugmentationRepReq(name),
		}));
		return { faction, rep, augmentations };
	});
}
