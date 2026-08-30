import type { NS } from "../NetscriptDefinitions";

// BladeburnerActionType/BladeburnerActionName aren't exported from NetscriptDefinitions.d.ts under
// those names - derive their shape from startAction's own signature, same approach
// bladeburner-agent-status.ts uses.
type ActionType = Parameters<NS["bladeburner"]["startAction"]>[0];
type ActionName = Parameters<NS["bladeburner"]["startAction"]>[1];

// ns.args[0]/[1] are the {type, name} bladeburner-manager.ts already decided on (desiredAction is
// a pure function over the cached bladeburner-state.json report, no live ns.bladeburner.* reads
// needed for the decision itself) - this script's only job is the one live call that actually
// starts it, mirroring gang-agent-assign-task.ts's role.
export async function main(ns: NS): Promise<void> {
	const type = ns.args[0] as ActionType;
	const name = ns.args[1] as ActionName;
	const started = ns.bladeburner.startAction(type, name);
	ns.print(`bladeburner-agent-start-action: ${type} / ${name} -> ${started}`);
}
