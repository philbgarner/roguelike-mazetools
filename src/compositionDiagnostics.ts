// src/compositionDiagnostics.ts

export type CompositionLinkKind =
  | "gate_enables_gate" // A enables B (both are gates)
  | "gate_enables_reward" // A enables a reward-ish circuit/target (future)
  | "foreshadow_then_payoff" // A reveals hint; B is payoff (future)
  | "optional_chain" // chain within optional branch (future)
  | "main_spine_chain"; // chain along main path (future)

export type CompositionAttemptOutcome =
  | "linked"
  | "skipped_no_candidates"
  | "skipped_policy"
  | "rejected_would_cycle"
  | "rejected_same_anchor"
  | "rejected_depth_order"
  | "rejected_distance_order"
  | "rejected_role_incompatible"
  | "rejected_budget_exhausted";

export type CompositionLinkPolicyV1 = {
  enabled: boolean;

  // Desired number of links to attempt per dungeon.
  // The pass is best-effort: may end up with fewer (including 0).
  targetLinksPerDungeon: number; // e.g. 1

  // Hard cap on attempts to find valid links (deterministic retries).
  maxAttempts: number; // e.g. 16

  // Only allow links if B is "after" A by some ordering.
  // These are advisory constraints to prevent nonsense chains.
  requireDepthOrder: boolean; // true
  requireDistanceOrder: boolean; // true

  // Minimum separation (in tiles) between circuit anchors to avoid trivial chains.
  minAnchorSeparation: number; // e.g. 6

  // Do not chain within the same room by default (unless you want it).
  forbidSameRoom: boolean; // e.g. true

  // If true, only link gates (door-affecting circuits) for Phase 2.5.
  gatesOnly: boolean; // true

  // Cycle policy: always prevent cycles (Phase 2.5 should remain acyclic).
  forbidCycles: boolean; // true

  // Soft enforcement strength: if true, try to meet targetLinksPerDungeon
  // by rerolling candidate choices up to maxAttempts. Never abort.
  softEnforceTargetLinks: boolean; // true
};

export type CompositionLinkRecordV1 = {
  kind: CompositionLinkKind;

  // Source circuit → target circuit
  fromCircuitId: number;
  toCircuitId: number;

  // Deterministic anchor/placement context for interpretability
  fromAnchor: { x: number; y: number; regionId: number };
  toAnchor: { x: number; y: number; regionId: number };

  // Order metrics captured at link time
  fromDepth: number; // room graph depth / or distance bucket
  toDepth: number;
  fromDistToEntrance: number; // tile distance or room-graph distance
  toDistToEntrance: number;
  anchorManhattan: number;

  // Optional: roles (if available)
  fromRole?: string;
  toRole?: string;

  // Result flags
  createdSignalEdge: boolean; // should be true if linked
};

export type CompositionAttemptRecordV1 = {
  attemptIndex: number;
  outcome: CompositionAttemptOutcome;

  // Filled when we had concrete candidates in hand
  fromCircuitId?: number;
  toCircuitId?: number;

  // If we rejected, capture why in a stable way for aggregation
  reason?: string;
};

export type CompositionDiagnosticsV1 = {
  version: 1;
  policy: CompositionLinkPolicyV1;

  // Summary
  targetLinks: number;
  linksCreated: number;

  // What we actually did
  links: CompositionLinkRecordV1[];

  // Attempt log for debugging / batch histograms
  attempts: CompositionAttemptRecordV1[];
};

export type CompositionSummaryRow = {
  linksCreated: number;
  attempts: number;
  outcomes: Record<string, number>; // histogram of CompositionAttemptOutcome
  kindCounts: Record<string, number>;
  topoDepthMax: number; // you already compute this in circuit metrics
};

export const DEFAULT_COMPOSITION_POLICY_V1: CompositionLinkPolicyV1 = {
  enabled: true,
  targetLinksPerDungeon: 1,
  maxAttempts: 16,

  requireDepthOrder: true,
  requireDistanceOrder: true,

  minAnchorSeparation: 6,
  forbidSameRoom: true,

  gatesOnly: true,
  forbidCycles: true,

  softEnforceTargetLinks: true,
};
