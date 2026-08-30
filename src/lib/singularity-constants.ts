// Plain literals only - deliberately zero ns.* references and zero imports from any file that has
// any. This repo's RAM cost model charges a script for every ns.* method its whole transitive
// import closure references, per FILE, not per named export - importing anything at all from a
// file that also happens to reference ns.singularity.* pulls that entire cost onto the importer
// even if the imported symbol itself never touches ns (confirmed the hard way: NEUROFLUX_NAME used
// to live in singularity-factions.ts, and merely importing it alongside gatherFactionAugGaps from
// that same file inflated augment-loop.ts/faction-work-loop.ts from 3.60GB back up to 12.10GB each -
// caught via ram-audit immediately after a 2026-08-30 dispatchOnce/isStale/readJson dedup pass).
// Anything added here must stay import-free itself, or this file becomes exactly the trap it exists
// to avoid.

// Shared by every augment/faction-work file that needs to recognize the one augmentation with
// special-cased handling everywhere else in this pattern (repeatable/ever-scaling price, excluded
// from normal candidate/gap tracking) - previously hand-declared identically in augment-loop.ts,
// augment-agent-act.ts, and faction-work-loop.ts.
export const NEUROFLUX_NAME = "NeuroFlux Governor";
