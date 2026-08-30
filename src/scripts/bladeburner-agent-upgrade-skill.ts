import type { NS } from "../NetscriptDefinitions";

// BladeburnerSkillName isn't exported from NetscriptDefinitions.d.ts under that name - derive its
// shape from upgradeSkill's own signature, same approach the sibling agent scripts use for
// BladeburnerActionType/BladeburnerActionName.
type SkillName = Parameters<NS["bladeburner"]["upgradeSkill"]>[0];

// ns.args[0] is the skill name bladeburner-manager.ts already picked (pickSkillToUpgrade is a
// pure function over the cached report) - this script's only job is the one live write call.
export async function main(ns: NS): Promise<void> {
	const skillName = ns.args[0] as SkillName;
	const upgraded = ns.bladeburner.upgradeSkill(skillName);
	ns.print(`bladeburner-agent-upgrade-skill: ${skillName} -> ${upgraded}`);
}
