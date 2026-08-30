import type { NS } from "../NetscriptDefinitions";

// Division first, then faction: joinBladeburnerDivision() requires all combat stats >= 100 (see
// controller.ts's decideActiveWorkScript, which only ever launches bladeburner-manager.ts once
// bladeburner-stat-loop.ts has already gotten there); joinBladeburnerFaction() additionally
// requires Bladeburner Rank >= 25, only reachable well after the division is joined and real
// actions have been run. Both calls are safe to attempt unconditionally - each just returns false
// (or true if already a member) when its own prerequisite isn't met yet, no side effect on
// failure - so bladeburner-manager.ts re-dispatches this every tick until the faction join
// succeeds, even though division membership is usually already settled by then.
export async function main(ns: NS): Promise<void> {
	const joinedDivision = ns.bladeburner.joinBladeburnerDivision();
	const joinedFaction = ns.bladeburner.joinBladeburnerFaction();
	ns.print(`bladeburner-agent-join: division=${joinedDivision} faction=${joinedFaction}`);
}
