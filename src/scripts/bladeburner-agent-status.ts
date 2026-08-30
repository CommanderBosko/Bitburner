import type { NS } from "../NetscriptDefinitions";
import type { BladeburnerActionCandidate, BladeburnerSkillSnapshot, BladeburnerStateReport } from "../lib/types";

// BladeburnerActionType/BladeburnerActionName aren't exported from NetscriptDefinitions.d.ts under
// those names, so derive their shape from startAction's own signature instead - same approach
// faction-work-loop.ts uses for FactionName via getPlayer()'s return type.
type ActionType = Parameters<NS["bladeburner"]["startAction"]>[0];
type ActionName = Parameters<NS["bladeburner"]["startAction"]>[1];

// Sole writer of this path - see lib/types.ts's BladeburnerStateReport comment. Kept as a local
// literal (not centralized), matching gang-agent-status.ts's GANG_STATE_PATH convention.
const BLADEBURNER_STATE_PATH = "/data/bladeburner-state.json";

// getContractNames/getOperationNames/getSkillNames are all 0GB (see ns-cost-lookup) - looping
// over their results to call the real (4GB-each) per-action/per-skill functions below doesn't add
// to this script's static cost beyond those functions' own single reference, same principle as
// gang-agent-status.ts looping over getTaskNames()/getEquipmentNames().
function readContractsOrOps(ns: NS, type: ActionType, names: ActionName[]): BladeburnerActionCandidate[] {
	return names.map((name) => {
		const [successChanceMin, successChanceMax] = ns.bladeburner.getActionEstimatedSuccessChance(type, name);
		return {
			name,
			successChanceMin,
			successChanceMax,
			countRemaining: ns.bladeburner.getActionCountRemaining(type, name),
		};
	});
}

export async function main(ns: NS): Promise<void> {
	const rank = ns.bladeburner.getRank();
	const [staminaCurrent, staminaMax] = ns.bladeburner.getStamina();
	const city = ns.bladeburner.getCity();
	const cityChaos = ns.bladeburner.getCityChaos(city);

	const currentAction = ns.bladeburner.getCurrentAction();

	const nextBlackOp = ns.bladeburner.getNextBlackOp();
	const nextBlackOpSuccessChanceMin = nextBlackOp
		? ns.bladeburner.getActionEstimatedSuccessChance("Black Operations", nextBlackOp.name)[0]
		: null;

	const contracts = readContractsOrOps(ns, "Contracts", ns.bladeburner.getContractNames());
	const operations = readContractsOrOps(ns, "Operations", ns.bladeburner.getOperationNames());

	const skills: BladeburnerSkillSnapshot[] = ns.bladeburner.getSkillNames().map((name) => ({
		name,
		level: ns.bladeburner.getSkillLevel(name),
		upgradeCost: ns.bladeburner.getSkillUpgradeCost(name),
	}));

	const report: BladeburnerStateReport = {
		rank,
		skillPoints: ns.bladeburner.getSkillPoints(),
		staminaCurrent,
		staminaMax,
		city,
		cityChaos,
		currentAction: currentAction ? { type: currentAction.type, name: currentAction.name } : null,
		nextBlackOp,
		nextBlackOpSuccessChanceMin,
		contracts,
		operations,
		skills,
		writtenAt: Date.now(),
	};
	ns.write(BLADEBURNER_STATE_PATH, JSON.stringify(report, null, 2), "w");
	ns.print(`bladeburner-agent-status: rank=${rank.toFixed(0)}, stamina=${staminaCurrent.toFixed(0)}/${staminaMax.toFixed(0)}, city=${city} (chaos ${cityChaos.toFixed(1)})`);
}
