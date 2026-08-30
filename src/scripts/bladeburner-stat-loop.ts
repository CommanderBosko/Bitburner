import type { NS } from "../NetscriptDefinitions";

// GymLocationName/GymType aren't exported from NetscriptDefinitions.d.ts under those names -
// derive their shape from gymWorkout's own signature, same approach faction-work-loop.ts uses for
// FactionName.
type GymLocationName = Parameters<NS["singularity"]["gymWorkout"]>[0];
type GymStat = Parameters<NS["singularity"]["gymWorkout"]>[1];

// Part of controller.ts's crime/faction/company/bladeburner work-slot exclusivity group (see
// decideActiveWorkScript there), selected in place of bladeburner-manager.ts specifically while
// combat stats are still below joinBladeburnerDivision()'s own requirement (all four >= 100).
// Once every stat clears the target, controller.ts stops selecting this script and hands the work
// slot to bladeburner-manager.ts instead - see hasBladeburnerCombatStats in controller.ts, the
// single source of truth for that threshold (kept in sync with BLADEBURNER_STAT_TARGET below).
const SINGULARITY_UNAVAILABLE_RETRY_MS = 300000;
const BLADEBURNER_LOOP_INTERVAL_MS = 5000;
// Matches joinBladeburnerDivision()'s documented requirement exactly.
const BLADEBURNER_STAT_TARGET = 100;
// Sector-12's gym - this repo doesn't handle city travel for any work-loop script (crime-loop.ts/
// company-work-loop.ts don't either), so training only actually progresses while the player's
// current city is already Sector-12 (the default starting city for this save's automation).
const GYM_NAME: GymLocationName = "Powerhouse Gym";

interface StatSnapshot {
	stat: GymStat;
	value: number;
}

// Trains whichever of the four combat stats is currently lowest - naturally balances all four
// toward BLADEBURNER_STAT_TARGET together rather than maxing one before starting the next.
function pickLowestStat(ns: NS): StatSnapshot | undefined {
	const skills = ns.getPlayer().skills;
	const candidates: StatSnapshot[] = [
		{ stat: "str", value: skills.strength },
		{ stat: "def", value: skills.defense },
		{ stat: "dex", value: skills.dexterity },
		{ stat: "agi", value: skills.agility },
	];
	return candidates.filter((c) => c.value < BLADEBURNER_STAT_TARGET).sort((a, b) => a.value - b.value)[0];
}

export async function main(ns: NS): Promise<void> {
	ns.disableLog("ALL");
	ns.print("bladeburner-stat-loop: starting");

	while (true) {
		try {
			const lowest = pickLowestStat(ns);
			if (!lowest) {
				// All four already at/above target - controller.ts should stop selecting this script
				// on its next decision tick; idle rather than exit so a brief lag in that hand-off
				// doesn't leave nothing running in the work slot.
				ns.print("bladeburner-stat-loop: all combat stats at target, idling for hand-off to bladeburner-manager.js");
				await ns.sleep(BLADEBURNER_LOOP_INTERVAL_MS);
				continue;
			}

			ns.singularity.gymWorkout(GYM_NAME, lowest.stat, false);
			ns.print(`bladeburner-stat-loop: training ${lowest.stat} (${lowest.value.toFixed(0)}/${BLADEBURNER_STAT_TARGET})`);
			await ns.sleep(BLADEBURNER_LOOP_INTERVAL_MS);
		} catch (error) {
			ns.print(`bladeburner-stat-loop: singularity unavailable (${String(error)}) - backing off`);
			await ns.sleep(SINGULARITY_UNAVAILABLE_RETRY_MS);
		}
	}
}
