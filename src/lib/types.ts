import type { NS } from "../NetscriptDefinitions";

// FactionName isn't exported from NetscriptDefinitions.d.ts - derive it once here from a
// singularity method's own signature (any of them works, they all share the same parameter type)
// rather than each of the three files that need it (singularity-factions.ts, augment-agent-act.ts,
// faction-agent-work.ts) re-deriving it independently. Safe to share from a file with no runtime
// ns.* usage of its own - unlike the NEUROFLUX_NAME lesson (see singularity-constants.ts), a `type`
// alias is fully erased at compile time and contributes zero RAM regardless of what else lives in
// the file it's imported from, but this repo keeps type-only exports in this already-established
// "just types" file rather than mixing them into a runtime-values file on principle.
export type FactionName = Parameters<NS["singularity"]["getFactionRep"]>[0];

export interface ServerReport {
	hostname: string;
	rooted: boolean;
	requiredHackingLevel: number;
	maxMoney: number;
	minSecurity: number;
	score: number;
}

// Written by controller.ts each retarget cycle, read by server-purchase-manager.ts to avoid
// buying/upgrading servers past the point where the extra RAM has anywhere to go - see
// buildWorkingSet's demand math in controller.ts for how totalDemandGb is derived.
export interface RamDemandReport {
	totalDemandGb: number;
	totalCapacityGb: number;
	writtenAt: number;
}

// Corp report types, written by the corp-agent-status-*.ts / corp-agent-check-unlocks.ts
// worker scripts and read by corp-manager.ts (see src/lib/corp-constants.ts for the shared
// corp constants/types these pair with). City/material/unlock names are kept as plain string
// here rather than importing corp-constants.ts's derived types - matches this file's existing
// style of plain primitives (e.g. ServerReport.hostname), and avoids status-reader code needing
// to import corp-only types just to read a report.
export interface CorpCoreReport {
	name: string;
	funds: number;
	revenue: number;
	expenses: number;
	divisionExists: boolean;
	cities: string[];
	makesProducts: boolean;
	researchPoints: number;
	writtenAt: number;
}

export interface CorpUnlocksReport {
	missing: string[];
	writtenAt: number;
}

// Cached forever once written - the industry-type-level static data (required/produced
// materials) doesn't change once fetched, unlike the other corp-agent-status-*.ts reports.
export interface CorpIndustryReport {
	requiredMaterials: string[];
	producedMaterials: string[];
	makesMaterials: boolean;
	makesProducts: boolean;
	writtenAt: number;
}

export interface CorpOfficeStatus {
	city: string;
	numEmployees: number;
	employeeJobs: Record<string, number>;
	avgEnergyFraction: number;
	avgMoraleFraction: number;
}

export interface CorpOfficeReport {
	offices: CorpOfficeStatus[];
	writtenAt: number;
}

export interface CorpWarehouseStatus {
	city: string;
	// Named warehouseExists, not hasWarehouse: confirmed live (2026-08-03) that the bare
	// property name "hasWarehouse" gets phantom-charged 10GB by the game's static RAM analyzer
	// in any file that merely reads it (e.g. `w.hasWarehouse` in corp-manager.ts), even with zero
	// real ns.corporation.hasWarehouse() calls - it collides with that method's exact name. Same
	// bug class as lib/launch.ts's attemptIndex rename (see [[bitburner_ram_analyzer_bugs]]).
	warehouseExists: boolean;
	smartSupplyEnabled: boolean;
	sizeUsed: number;
	size: number;
}

export interface CorpWarehouseReport {
	warehouses: CorpWarehouseStatus[];
	writtenAt: number;
}

export interface CorpMaterialStatus {
	city: string;
	material: string;
	stored: number;
	actualSellAmount: number;
	desiredSellAmount: string | number;
}

export interface CorpMaterialReport {
	materials: CorpMaterialStatus[];
	writtenAt: number;
}

// Gang report types, written by gang-agent-status.ts and read by gang-manager.ts (2026-08-10,
// user-directed RAM split - see [[bitburner_bn4_singularity]]): gang-manager.ts used to reference
// every ns.gang.* read+write function directly and cost 36.10GB permanently resident, which
// starved it out of a 64GB home alongside the other always-on managers. Splitting it into this
// cheap orchestrator (reads this cached report + dispatches small, transient gang-agent-*.ts
// workers for the handful of live ns.gang.* calls each decision actually needs) mirrors the
// existing corp-manager.ts/corp-agent-*.ts pattern in this same repo.
//
// hackSkill, not hack: a bare `.hack` property read gets phantom-charged by the game's static RAM
// analyzer as if ns.hack() were called, even on a plain JSON-parsed field wholly unrelated to the
// hacking worker function - same collision class as CorpWarehouseStatus.warehouseExists above and
// the original gang-manager.ts's own `member["hack"]` bracket-notation workaround (see
// [[bitburner_ram_analyzer_bugs]]). str/def/dex/agi/cha don't collide with any ns.* method name,
// confirmed by the original file's own comment, so those are kept as plain names.
export interface GangMemberSnapshot {
	name: string;
	task: string;
	hackSkill: number;
	str: number;
	def: number;
	dex: number;
	agi: number;
	cha: number;
	// Combat: average of str/def/dex/agi ascension mult; hacking: hack ascension mult - see
	// primaryAscMult in the original gang-manager.ts for why this single number, not all six, is
	// tracked and compared against EARN_ASC_MULT_TARGET/ASCENSION_MULT_THRESHOLD.
	primaryAscMult: number;
	// Predicted primary-stat ascension gain from ascending right now (getAscensionResult) -
	// undefined if ascension isn't currently possible for this member.
	ascensionGain: number | undefined;
	upgrades: string[];
	augmentations: string[];
}

export interface GangTaskSnapshot {
	name: string;
	isHacking: boolean;
	isCombat: boolean;
	baseMoney: number;
	baseRespect: number;
	hackWeight: number;
	strWeight: number;
	defWeight: number;
	dexWeight: number;
	agiWeight: number;
	chaWeight: number;
	difficulty: number;
	// Flattened from GangTaskStats.territory.{money,respect} - avoids importing the nested
	// GangTerritory shape just for a report field, matching this file's existing plain-primitives
	// style (see the CorpCoreReport comment above).
	territoryMoneyExp: number;
	territoryRespectExp: number;
}

export interface GangEquipmentSnapshot {
	name: string;
	cost: number;
	isHacking: boolean;
	isCombat: boolean;
}

export interface GangRivalSnapshot {
	name: string;
	winChance: number;
}

export interface GangStateReport {
	isHacking: boolean;
	respect: number;
	respectForNextRecruitThreshold: number;
	territory: number;
	territoryWarfareEngaged: boolean;
	canRecruit: boolean;
	playerMoney: number;
	members: GangMemberSnapshot[];
	tasks: GangTaskSnapshot[];
	equipment: GangEquipmentSnapshot[];
	// Other gangs currently holding territory (own gang excluded) - empty until territory warfare
	// is even relevant.
	rivals: GangRivalSnapshot[];
	writtenAt: number;
}

export type DarknetServerStatus = "probed" | "cracking" | "cracked" | "unresolvable";

export interface CrackCandidate {
	candidate: string;
	// Set only for tier-2/dictionary candidates - which learned transform produced this guess.
	transformId?: string;
}

export interface DarknetCrackState {
	tier: "bruteforce" | "dictionary";
	// Tier "bruteforce": charset + cursorIndex (resumable index into the charset^length keyspace).
	charset?: string;
	cursorIndex?: number;
	// Tier "dictionary": a ranked candidate queue mined from hints/logs/patterns, plus a cursor into it.
	candidateQueue?: CrackCandidate[];
	candidateCursor?: number;
}

export interface DarknetServerEntry {
	hostname: string;
	// "home" for the depth-0 server directly connected to home.
	parentHost: string;
	depth: number;
	// The real key to cracking strategy, per the game's own darknet docs ("similar models have
	// similar vulnerabilities") - e.g. "ZeroLogon" always has an empty password. passwordFormat/
	// Length still matter for brute-force/dictionary fallback when a model's exploit is unknown.
	modelId: string;
	passwordFormat: string;
	passwordLength: number;
	passwordHint: string;
	// Combines getServerDetails().data, any `data` field authenticate() has returned so far, and
	// heartbleed()-scraped log lines - all documented as intentionally-undocumented hint material
	// for the same mining logic, refreshed as failed attempts yield new logs.
	data: string;
	logs: string[];
	status: DarknetServerStatus;
	// undefined = not yet cracked. A real string = a cracked password, used with
	// connectToSession() when hopping through this server. null = confirmed session-exempt
	// (e.g. darkweb itself: getServerDetails().hasSession is true for a script that never
	// called authenticate/connectToSession at all, and authenticate("", ...) against it was
	// empirically confirmed to fail) - hop-walking skips connectToSession entirely for these.
	password?: string | null;
	crackState?: DarknetCrackState;
	attemptCount: number;
	lastAttemptCycle: number;
	lastValueCheckCycle: number;
	lastReconCycle: number;
	childrenProbed: boolean;
	unresolvableReason?: string;
	// Snapshot of the pattern table's total transform count when this server was marked
	// unresolvable, so it only becomes re-eligible once real learning has happened since -
	// not a blind retry.
	patternsSnapshotCount?: number;
}

export interface DarknetPatternTransform {
	id: string;
	successCount: number;
	failureCount: number;
}

export interface DarknetLearnedPattern {
	hintShapeKey: string;
	transforms: DarknetPatternTransform[];
}

export interface DarknetRollingAttempt {
	candidate: string;
	success: boolean;
	via: "bruteforce" | "pattern";
}

export interface DarknetMetrics {
	crackAttempts: number;
	crackSuccesses: number;
	bruteforceSuccesses: number;
	patternSuccesses: number;
	// Trimmed to a fixed window (see MAX_ROLLING_ATTEMPTS in lib/darknet-candidates.ts) -
	// this is the falsifiable "is it learning" signal logged each manager cycle.
	rollingAttempts: DarknetRollingAttempt[];
}

export interface DarknetKnowledgeBase {
	version: number;
	servers: Record<string, DarknetServerEntry>;
	patterns: DarknetLearnedPattern[];
	metrics: DarknetMetrics;
}

// Bladeburner report types, written by bladeburner-agent-status.ts and read by
// bladeburner-manager.ts (2026-08-30) - mirrors the gang-manager.ts/gang-agent-status.ts split
// (see GangStateReport above): almost every ns.bladeburner.* read costs 4GB each, which would put
// a monolithic script in the same ~60GB+ range gang-manager.ts hit before its 2026-08-10 split, so
// this repo goes straight to the orchestrator+worker shape instead of discovering the same
// RAM-starvation bug a third time. bladeburner-manager.ts's own decisions are pure functions over
// this cached report - no ns.bladeburner.* calls in that file itself.
export interface BladeburnerActionCandidate {
	name: string;
	// [min, max] from getActionEstimatedSuccessChance - kept as two fields (not a tuple) since this
	// gets JSON round-tripped through a file, same flattening approach as GangTaskSnapshot's
	// territoryMoneyExp/territoryRespectExp above.
	successChanceMin: number;
	successChanceMax: number;
	countRemaining: number;
}

export interface BladeburnerSkillSnapshot {
	name: string;
	level: number;
	upgradeCost: number;
}

export interface BladeburnerCurrentAction {
	type: string;
	name: string;
}

export interface BladeburnerStateReport {
	rank: number;
	skillPoints: number;
	staminaCurrent: number;
	staminaMax: number;
	city: string;
	cityChaos: number;
	currentAction: BladeburnerCurrentAction | null;
	nextBlackOp: { name: string; rank: number } | null;
	// null if nextBlackOp itself is null (nothing left to compute a chance for).
	nextBlackOpSuccessChanceMin: number | null;
	contracts: BladeburnerActionCandidate[];
	operations: BladeburnerActionCandidate[];
	skills: BladeburnerSkillSnapshot[];
	writtenAt: number;
}

// Augment report types, written by augment-agent-status.ts and read by augment-loop.ts
// (2026-08-30 RAM split - see [[bitburner_bn4_singularity]]/[[bitburner_augment_loop_nfg_gate]]):
// augment-loop.ts used to reference 8 distinct ns.singularity.* functions permanently (~31GB
// native, once SF4.3's multiplier is accounted for - see
// [[bitburner_singularity_ram_tier_stale]]), mirroring the same shape gang-manager.ts/
// corp-manager.ts/bladeburner-manager.ts already fixed for their own subsystems. Faction names are
// kept as plain string here (not the derived FactionName type augment-loop.ts uses internally) -
// matches this file's existing plain-primitives convention for JSON-round-tripped report fields.
export interface AugmentAugSnapshot {
	name: string;
	repReq: number;
	// Live price at the moment of this status snapshot - already stale by the time a purchase
	// actually lands (each purchase raises every remaining augmentation's price), so
	// augment-agent-act.ts re-reads the live price immediately before every purchase rather than
	// trusting this field for anything but candidate sort order and rough budget planning.
	price: number;
}

export interface AugmentFactionSnapshot {
	faction: string;
	rep: number;
	augmentations: AugmentAugSnapshot[];
}

export interface AugmentStateReport {
	playerMoney: number;
	factionRepMult: number;
	// null if not in a gang yet - augment-loop.ts only ever runs once ns.gang.inGang() is true (see
	// its own bootstrap gate), but the report shape stays defined either way.
	gangFaction: string | null;
	installedList: string[];
	ownedList: string[];
	factions: AugmentFactionSnapshot[];
	writtenAt: number;
}

// Faction-work report types, written by faction-agent-status.ts and read by
// faction-work-loop.ts (2026-08-30 RAM split, same shape/rationale as AugmentStateReport above).
export interface FactionAugSnapshot {
	name: string;
	repReq: number;
}

export interface FactionCandidateSnapshot {
	faction: string;
	rep: number;
	augmentations: FactionAugSnapshot[];
}

export interface FactionCurrentWork {
	type: string;
	// Only meaningful when type === "FACTION" - null otherwise (e.g. type "COMPANY" or "CLASS").
	factionName: string | null;
}

export interface FactionWorkStateReport {
	currentWork: FactionCurrentWork | null;
	owned: string[];
	factions: FactionCandidateSnapshot[];
	writtenAt: number;
}

// Payload shapes crossing the ns.exec JSON boundary between augment-loop.ts and
// augment-agent-act.ts - centralized here rather than independently declared on each side, since
// JSON.stringify/JSON.parse gives no compile-time link across that boundary otherwise (a field
// added/renamed on one side without mirroring the other would compile fine on both ends and only
// fail silently at runtime).
export interface AugmentActCandidate {
	faction: string;
	name: string;
}

export interface AugmentActDonateTarget extends AugmentActCandidate {
	gap: number;
}

export interface AugmentActPayload {
	candidates: AugmentActCandidate[];
	budget: number;
	donateTarget: AugmentActDonateTarget | null;
	factionRepMult: number;
	nfgFaction: string | null;
	queuedHasReal: boolean;
	nothingRealLeft: boolean;
}

// Payload shape crossing the ns.exec JSON boundary between faction-work-loop.ts and
// faction-agent-work.ts - same centralization rationale as AugmentActPayload above.
export interface FactionWorkPayload {
	ordered: string[];
	// currentWork's factionName if type === "FACTION", else null.
	alreadyWorkingFaction: string | null;
}
