import type { NS } from "../NetscriptDefinitions";

// Shared by every orchestrator in the report-cache + transient-worker pattern (gang-manager.ts,
// bladeburner-manager.ts, corp-manager.ts, augment-loop.ts, faction-work-loop.ts) - each used to
// declare its own byte-identical copy of these three helpers (`readReport`/`readJson`, `isStale`,
// `dispatchOnce`), found during the 2026-08-30 augment/faction RAM-split code review. Extracting
// costs nothing in RAM: this repo's cost model charges per distinct ns.* method an entry file's
// whole transitive import closure references, not per file the code is textually written in
// (confirmed via ram-audit before/after this extraction - every caller's total was unchanged). The
// only downside of the old per-file copies was a bugfix (e.g. dispatchOnce's own history below)
// having to be applied by hand in five places instead of one.

export function readJson<T>(ns: NS, path: string): T | undefined {
	if (!ns.fileExists(path, "home")) return undefined;
	const raw = ns.read(path);
	if (!raw) return undefined;
	try {
		return JSON.parse(raw) as T;
	} catch (error) {
		// A truncated/corrupted write (e.g. the writer got killed mid-ns.write) should look like "no
		// report yet" to the caller, not crash the orchestrator's while(true) loop - every caller
		// already treats undefined as "dispatch a fresh status refresh," which self-heals this case.
		// Still printed (not silently swallowed): a transient race self-heals on the very next
		// refresh, but a *systematic* writer bug that always emits invalid JSON would otherwise look
		// identical to ordinary staleness forever - this keeps that distinguishable from the tail.
		ns.print(`readJson: ${path} failed to parse (${String(error)}) - treating as no report`);
		return undefined;
	}
}

export function isStale(writtenAt: number, thresholdMs: number): boolean {
	return Date.now() - writtenAt > thresholdMs;
}

// `label` reproduces each caller's own print prefix (e.g. "gang-manager", "augment-loop") so this
// shared version doesn't flatten every orchestrator's log lines into one indistinguishable source.
// Logs every dispatch, not just failures - confirmed live (2026-08-04, corp-manager.ts) that a
// print-only-on-failure design left no visibility into what an orchestrator was actually
// dispatching tick to tick, which made a real stuck-loop symptom (materials never getting sell
// orders set) impossible to diagnose from the tail alone.
export function dispatchOnce(ns: NS, label: string, script: string, ...args: string[]): boolean {
	const pid = ns.exec(script, "home", { threads: 1, preventDuplicates: true }, ...args);
	if (pid === 0) {
		ns.print(`${label}: couldn't dispatch ${script} - check RAM, or a same-args instance is still running`);
		return false;
	}
	ns.print(`${label}: dispatched ${script} (pid ${pid})`);
	return true;
}
