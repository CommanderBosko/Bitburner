import type { NS } from "../NetscriptDefinitions";
import type { AugmentActCandidate, AugmentActDonateTarget, AugmentActPayload, FactionName } from "../lib/types";
import { NEUROFLUX_NAME } from "../lib/singularity-constants";

// installAugmentations' cbScript re-enters the existing chain-launch bootstrap after the reset -
// see the original augment-loop.ts history for why this is hardcoded rather than read from args.
const SCAN_ROOT_SCRIPT = "scripts/scan-root.js";
// Safety valve on the leftover-budget NeuroFlux spend loop below - its price climbs every
// purchase, so this is just a bound on iteration count, not expected to ever bind in practice.
const NEUROFLUX_MAX_PURCHASES_PER_TICK = 100;
// Rep-per-dollar formula from bitburner-src's Faction/formulas/donation.ts - see the original
// augment-loop.ts history for the full derivation and the FactionWorkRepGain-drop tradeoff.
const DONATE_MONEY_TO_REP_DIVISOR = 1e6;

// augment-loop.ts already ran every read-only decision (which augmentations are buyable, which
// faction's rep gap is worth donating toward, which faction can fund NeuroFlux Governor right now,
// whether there's nothing real left to save budget for) as pure computation over its cached
// augment-state.json report - none of that needs to be redone here with live calls. This script is
// the one place that actually spends money, and it stays a single combined worker (not five
// separate ones like gang-manager.ts's action fleet) because buy -> donate -> NeuroFlux -> install
// share one sequential, same-tick budget and must run in that exact order - see
// [[bitburner_augment_loop_nfg_gate]] for the multi-round history of bugs from getting that
// sequencing wrong. Splitting this into independently-dispatched workers would either lose the
// "spend this tick's leftover budget on NeuroFlux immediately" behavior or require polling another
// process to finish before dispatching the next - not worth it for one script's RAM. The payload
// shape itself (AugmentActPayload) lives in lib/types.ts, shared with augment-loop.ts on the other
// side of this ns.exec/JSON boundary - see that file's own comment for why.

// Re-checks live price - an earlier purchase this same pass raises everyone's cost, so the
// candidate list's cached price (from the last augment-state.json snapshot) can already be stale
// by the time a given candidate is tried.
function buyCandidates(ns: NS, candidates: AugmentActCandidate[], budget: number): { spent: number; purchasedAny: boolean } {
	let spent = 0;
	let purchasedAny = false;

	for (const candidate of candidates) {
		const price = ns.singularity.getAugmentationPrice(candidate.name);
		if (price > budget - spent) continue;
		if (ns.singularity.purchaseAugmentation(candidate.faction as FactionName, candidate.name)) {
			spent += price;
			purchasedAny = true;
			ns.print(`augment-agent-act: purchased ${candidate.name} from ${candidate.faction} ($${Math.round(price).toLocaleString()})`);
		}
	}

	return { spent, purchasedAny };
}

function donationCostForRep(repNeeded: number, factionRepMult: number): number {
	return (repNeeded * DONATE_MONEY_TO_REP_DIVISOR) / factionRepMult;
}

function buyDonation(ns: NS, target: AugmentActDonateTarget, factionRepMult: number, budget: number): { spent: number; donatedAny: boolean } {
	const amount = Math.min(donationCostForRep(target.gap, factionRepMult), budget);
	if (amount <= 0) return { spent: 0, donatedAny: false };

	if (!ns.singularity.donateToFaction(target.faction as FactionName, amount)) return { spent: 0, donatedAny: false };

	ns.print(
		`augment-agent-act: donated $${Math.round(amount).toLocaleString()} to ${target.faction} (toward ${target.name}, needed ~${Math.round(target.gap).toLocaleString()} rep)`,
	);
	return { spent: amount, donatedAny: true };
}

// NeuroFlux Governor is repeatable with an infinitely-scaling price - dumps whatever budget it's
// given into repeat purchases against the one faction augment-loop.ts already confirmed can sell it
// at sufficient rep (see nfgFaction's own comment in augment-loop.ts).
function buyNeuroFlux(ns: NS, faction: string, remainingBudget: number): { spent: number; purchasedAny: boolean } {
	let spent = 0;
	let purchasedAny = false;
	for (let i = 0; i < NEUROFLUX_MAX_PURCHASES_PER_TICK; i++) {
		const price = ns.singularity.getAugmentationPrice(NEUROFLUX_NAME);
		if (price > remainingBudget - spent) break;
		if (!ns.singularity.purchaseAugmentation(faction as FactionName, NEUROFLUX_NAME)) break;
		spent += price;
		purchasedAny = true;
		ns.print(`augment-agent-act: purchased ${NEUROFLUX_NAME} from ${faction} ($${Math.round(price).toLocaleString()})`);
	}

	return { spent, purchasedAny };
}

export async function main(ns: NS): Promise<void> {
	try {
		// Parsing inside the try too - a malformed/stale-build payload should hit the same catch as
		// a thrown singularity call, not crash uncaught before any diagnostic prints.
		const payload = JSON.parse(ns.args[0] as string) as AugmentActPayload;

		const real = buyCandidates(ns, payload.candidates, payload.budget);
		const donation =
			payload.donateTarget !== null ? buyDonation(ns, payload.donateTarget, payload.factionRepMult, payload.budget - real.spent) : { spent: 0, donatedAny: false };

		// Only spend on NeuroFlux once a real augmentation is already queued (this tick's purchase
		// above, or an earlier tick's) or there's nothing real left to save toward at all - see
		// augment-loop.ts's canBuyNfg comment for why (otherwise NFG's always-affordable price drains
		// the budget every tick before it can reach a pricier real augment).
		const canBuyNfg = payload.nfgFaction !== null && (real.purchasedAny || payload.queuedHasReal || payload.nothingRealLeft);
		const nfg = canBuyNfg && payload.nfgFaction !== null ? buyNeuroFlux(ns, payload.nfgFaction, payload.budget - real.spent - donation.spent) : { spent: 0, purchasedAny: false };
		const purchasedAny = real.purchasedAny || nfg.purchasedAny || donation.donatedAny;

		// Read fresh, after this tick's own purchases above - getOwnedAugmentations(true) already
		// reflects anything just bought in this same process, which is exactly what decides whether
		// there's a queued batch worth installing right now.
		const queuedCount = ns.singularity.getOwnedAugmentations(true).length - ns.singularity.getOwnedAugmentations(false).length;
		if (!purchasedAny && queuedCount > 0) {
			ns.print(`augment-agent-act: installing ${queuedCount} queued augmentation(s)`);
			ns.singularity.installAugmentations(SCAN_ROOT_SCRIPT);
		}
	} catch (error) {
		ns.print(`augment-agent-act: error (${String(error)})`);
	}
}
