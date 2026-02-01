/**
 * Goal Binding Types
 *
 * Defines the binding layer between Goal (strategic intent) and Task (execution).
 * A GoalBinding on task.metadata.goalBinding is the join key.
 *
 * Design: Task is canonical for execution state; Goal is canonical for strategic
 * intent. The synchronization reducer (goal-task-sync.ts, future commit) maps
 * Task transitions to Goal status changes deterministically.
 *
 * @see docs/internal/goal-binding-protocol.md
 */

/**
 * Hold reasons. manual_pause is a hard wall: only explicit user action can resume.
 * All other reasons are eligible for automatic reactivation by the activation reactor.
 */
export type GoalHoldReason =
  | 'preempted'
  | 'unsafe'
  | 'materials_missing'
  | 'manual_pause'
  | (string & {});  // extensible but the known values above get autocomplete

/**
 * Minimal metadata captured during emergency hold (preemption budget exceeded).
 * verified=false means the resume algorithm must run a conservative rescan.
 */
export interface HoldWitness {
  lastStepId?: string;
  moduleCursor?: number;
  /** false = safe-stop timed out; resume must re-verify module N-1 */
  verified: boolean;
}

export interface GoalHold {
  reason: GoalHoldReason;
  heldAt: number;
  resumeHints: string[];
  /** Hysteresis: don't re-evaluate before this timestamp */
  nextReviewAt: number;
  holdWitness?: HoldWitness;
}

export interface GoalCompletionResult {
  done: boolean;
  score?: number;
  blockers?: string[];
  evidence?: string[];
}

export interface GoalCompletion {
  /** Verifier function name (registered in verifier registry) */
  verifier: string;
  /** Version of the completion definition */
  definitionVersion: number;
  lastVerifiedAt?: number;
  /** Number of consecutive verification passes (stability window) */
  consecutivePasses: number;
  lastResult?: GoalCompletionResult;
}

export interface GoalAnchors {
  siteSignature?: {
    position: { x: number; y: number; z: number };
    facing: 'N' | 'S' | 'E' | 'W';
    refCorner: { x: number; y: number; z: number };
    footprintBounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
  };
  regionHint?: { x: number; y: number; z: number; r: number };
}

/**
 * The binding between a Goal instance and a Task.
 * Lives at task.metadata.goalBinding.
 */
export interface GoalBinding {
  /**
   * Immutable instance ID (random UUID). Never changes after creation.
   * All internal references (parent/child links, event payloads, logs) use this.
   */
  goalInstanceId: string;

  /**
   * Deterministic lookup key for dedup. May change once (Phase A → Phase B).
   * Used only by the resolver for matching incoming intent to existing tasks.
   */
  goalKey: string;

  /**
   * Previous goalKey values from before anchoring.
   * Resolver checks these as aliases during lookup.
   */
  goalKeyAliases: string[];

  /** Which Goal type this task serves */
  goalType: string;

  /** Reference to the Goal.id that spawned this task (if goal-driven) */
  goalId?: string;

  /** Anchors that lock identity once committed */
  anchors: GoalAnchors;

  /** Hold state — present iff task.status === 'paused' */
  hold?: GoalHold;

  /** Completion verifier reference */
  completion: GoalCompletion;

  /** If this task supersedes an older goal instance */
  supersedesInstanceId?: string;
}
