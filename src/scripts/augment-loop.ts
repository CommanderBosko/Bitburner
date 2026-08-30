import type { NS } from "../NetscriptDefinitions";
import type { AugmentActCandidate, AugmentActDonateTarget, AugmentActPayload, AugmentFactionSnapshot, AugmentStateReport } from "../lib/types";
import { dispatchOnce, isStale, readJson } from "../lib/manager-dispatch";
import { NEUROFLUX_NAME } from "../lib/singularity-constants";

// Split into a cheap orchestrator + transient augment-agent-*.ts workers (2026-08-30, same
// RAM-split shape as gang-manager.ts/corp-manager.ts/bladeburner-manager.ts - see
// [[bitburner_bn4_singularity]]): the previous single-file augment-loop.ts referenced 8 distinct
// ns.singularity.* functions permanently (~31GB native once SF4.3's multiplier is accounted for -
// see [[bitburner_singularity_ram_tier_stale]]). augment-agent-status.ts (transient) bears almost
// the whole read cost; this file makes every decision as pure computation over that cached report
// (see the compute* functions below - none of them touch `ns.singularity.*`) and
// dispatches augment-agent-act.ts (transient) for the handful of live mutating calls each decision
// tick actually needs. This file's own resident cost is now just ns.exec/ns.read/ns.fileExists/
// ns.rm/ns.print/ns.sleep plus the free ns.gang.inGang().
const AUGMENT_AGENT_STATUS_SCRIPT = "scripts/augment-agent-status.js";
const AUGMENT_AGENT_ACT_SCRIPT = "scripts/augment-agent-act.js";

// Sole writer is augment-agent-status.ts - kept in sync by hand, matching gang-manager.ts's
// GANG_STATE_PATH convention (not centralized).
const AUGMENT_STATE_PATH = "/data/augment-state.json";

const AUGMENT_LOOP_INTERVAL_MS = 30000;
// How long a cached augment-state.json report is trusted before re-dispatching
// augment-agent-status.ts - matches gang-manager.ts's STATUS_REFRESH_MS reasoning (same value as
// its own loop interval). Note this does NOT preserve the original monolith's true per-30s decide
// cadence: any tick that dispatches augment-agent-act.ts deletes the report immediately after (see
// main()'s own comment on that ns.rm), so the following tick only refreshes status and makes no
// decision - real-world decide+act cadence after an action is up to ~2x this interval, not this
// interval itself. Matches gang-manager.ts's/bladeburner-manager.ts's identical
// refresh-equals-interval + invalidate-after-acting shape, already running this way without issue.
const STATUS_REFRESH_MS = 30000;
// Only start spending on augmentations once the gang exists (user-directed priority: crime-loop
// grinds karma to gang creation first; installing an augmentation resets hacking/combat stats to
// 1, which would undo Homicide-chance progress mid-grind if this ran any earlier).
const IDLE_BEFORE_GANG_MS = 60000;
// Leave a slice of cash unspent, same pattern as gang-manager.ts's RESERVE_FRACTION.
const RESERVE_FRACTION = 0.1;

interface CandidateComputation {
	candidates: AugmentActCandidate[];
	gatedCount: number;
	donateTarget: AugmentActDonateTarget | null;
	nfgDonateTarget: AugmentActDonateTarget | null;
}

// Single pass over every faction's every augmentation - collecting buyable candidates AND tracking
// rep-gated gaps used to be two separate traversals with slightly different but overlapping filter
// conditions (owned/NEUROFLUX_NAME/gang-faction checks); merged into one so there's exactly one
// place that encodes "what counts as buyable/gated/gang-excluded", not two that have to be kept in
// sync by hand - see [[bitburner_augment_loop_nfg_gate]] for the multi-round history of bugs from
// exactly that kind of drift. Candidates come back sorted highest-price-first: the game's
// per-purchase price multiplier raises the cost of every augmentation not yet bought this session,
// so front-loading the priciest one lets that multiplier apply fewer times to it - minimizes total
// spend across the whole batch. Prices come from the cached report - already stale by the time a
// purchase lands, see AugmentAugSnapshot.price's own comment; that's fine here, only sort order
// depends on it.
function computeCandidatesAndGating(factions: AugmentFactionSnapshot[], owned: Set<string>, gangFaction: string | null): CandidateComputation {
	const candidates: AugmentActCandidate[] = [];
	const priceByName = new Map<string, number>();
	const seen = new Set<string>();
	let gatedCount = 0;
	let donateTarget: AugmentActDonateTarget | null = null;
	let nfgDonateTarget: AugmentActDonateTarget | null = null;

	for (const f of factions) {
		// Can't donate to your own gang's faction (game restriction), and a gang aug's rep gate can
		// never close via this automation either way (rep only grows via gang activity) - excluded
		// from gating/donation tracking below, but NOT from `candidates`: a gang faction's
		// augmentation is still directly buyable once naturally unlocked by rep.
		const isGangFaction = f.faction === gangFaction;

		for (const aug of f.augmentations) {
			priceByName.set(aug.name, aug.price);

			if (aug.name === NEUROFLUX_NAME) {
				if (!isGangFaction) {
					const gap = aug.repReq - f.rep;
					if (gap > 0 && (nfgDonateTarget === null || gap < nfgDonateTarget.gap)) {
						nfgDonateTarget = { faction: f.faction, name: aug.name, gap };
					}
				}
				continue;
			}

			if (owned.has(aug.name)) continue;

			if (f.rep >= aug.repReq) {
				if (!seen.has(aug.name)) {
					candidates.push({ faction: f.faction, name: aug.name });
					seen.add(aug.name);
				}
				continue;
			}

			if (isGangFaction) continue;
			gatedCount++;
			const gap = aug.repReq - f.rep;
			if (donateTarget === null || gap < donateTarget.gap) donateTarget = { faction: f.faction, name: aug.name, gap };
		}
	}

	candidates.sort((a, b) => {
		const priceA = priceByName.get(a.name);
		const priceB = priceByName.get(b.name);
		return (priceB === undefined ? 0 : priceB) - (priceA === undefined ? 0 : priceA);
	});

	return { candidates, gatedCount, donateTarget, nfgDonateTarget };
}

// The one faction augment-agent-act.ts should spend leftover budget on NeuroFlux Governor
// through, if any - mirrors the original augment-loop.ts's buyNeuroFlux() faction search exactly,
// just over the cached report instead of a live call.
function findNfgFaction(factions: AugmentFactionSnapshot[]): string | null {
	for (const f of factions) {
		const nfg = f.augmentations.find((a) => a.name === NEUROFLUX_NAME);
		if (nfg !== undefined && f.rep >= nfg.repReq) return f.faction;
	}
	return null;
}

export async function main(ns: NS): Promise<void> {
	ns.disableLog("ALL");
	ns.print("augment-loop: starting");

	while (true) {
		if (!ns.gang.inGang()) {
			await ns.sleep(IDLE_BEFORE_GANG_MS);
			continue;
		}

		const report = readJson<AugmentStateReport>(ns, AUGMENT_STATE_PATH);
		if (!report || isStale(report.writtenAt, STATUS_REFRESH_MS)) {
			dispatchOnce(ns, "augment-loop", AUGMENT_AGENT_STATUS_SCRIPT);
			await ns.sleep(AUGMENT_LOOP_INTERVAL_MS);
			continue;
		}

		const installedBefore = new Set(report.installedList);
		const owned = new Set(report.ownedList);
		// A non-NFG augmentation already sitting in the queue (purchased an earlier tick, not yet
		// installed) - see augment-agent-act.ts's canBuyNfg gate.
		const queuedHasReal = report.ownedList.some((name) => name !== NEUROFLUX_NAME && !installedBefore.has(name));
		const queuedCount = report.ownedList.length - report.installedList.length;

		const { candidates, gatedCount, donateTarget, nfgDonateTarget } = computeCandidatesAndGating(report.factions, owned, report.gangFaction);
		// True once there's no real augmentation left to buy (candidates) or save rep toward.
		// Derived from donateTarget rather than gatedCount - computeCandidatesAndGating only ever
		// increments gatedCount in the same branch that sets donateTarget, so the two are always
		// equal to null/0 together; deriving from donateTarget directly means this condition can
		// never drift out of sync with the very value it's actually gating (effectiveDonateTarget's
		// fallback below). gatedCount is kept only for the diagnostic print line - see the original
		// augment-loop.ts history for the multi-round NFG-starvation bugs this condition fixed.
		const nothingRealLeft = candidates.length === 0 && donateTarget === null;
		const effectiveDonateTarget = donateTarget !== null ? donateTarget : nothingRealLeft ? nfgDonateTarget : null;
		const nfgFaction = findNfgFaction(report.factions);

		const budget = report.playerMoney * (1 - RESERVE_FRACTION);

		ns.print(
			`augment-loop: candidates=${candidates.length} gated=${gatedCount} queuedHasReal=${queuedHasReal} nothingRealLeft=${nothingRealLeft} budget=$${Math.round(budget).toLocaleString()}`,
		);

		// queuedHasReal isn't checked here on its own - it always implies queuedCount > 0 (already
		// covered below), since a "real" queued augmentation is by definition owned-but-uninstalled.
		const hasSomethingToDo = candidates.length > 0 || effectiveDonateTarget !== null || queuedCount > 0 || (nfgFaction !== null && nothingRealLeft);
		if (hasSomethingToDo) {
			const payload: AugmentActPayload = {
				candidates,
				budget,
				donateTarget: effectiveDonateTarget,
				factionRepMult: report.factionRepMult,
				nfgFaction,
				queuedHasReal,
				nothingRealLeft,
			};
			// Force a fresh status snapshot before deciding again, rather than trusting this report
			// until its own STATUS_REFRESH_MS timer expires - same re-verify-before-repeat protection
			// gang-manager.ts/bladeburner-manager.ts give their own decision ticks.
			if (dispatchOnce(ns, "augment-loop", AUGMENT_AGENT_ACT_SCRIPT, JSON.stringify(payload))) ns.rm(AUGMENT_STATE_PATH, "home");
		}

		await ns.sleep(AUGMENT_LOOP_INTERVAL_MS);
	}
}
