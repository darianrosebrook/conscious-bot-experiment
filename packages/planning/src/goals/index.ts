/**
 * Goal Binding Protocol — Public API
 *
 * Exports the full goal-binding subsystem for use by other packages.
 *
 * @see docs/internal/goal-binding-protocol.md
 */

// Types
export type { GoalBinding, GoalAnchors, GoalHold, GoalHoldReason, HoldWitness, GoalCompletion, GoalCompletionResult } from './goal-binding-types';

// Identity
export { hashGoalKey, coarseRegion, computeProvisionalKey, computeAnchoredKey, anchorGoalIdentity, createGoalBinding } from './goal-identity';
export type { ProvisionalKeyInput, AnchoredKeyInput, AnchorTransitionInput } from './goal-identity';

// Normalization + illegal state detection
export { detectIllegalStates, assertConsistentGoalState, syncHoldToTaskFields, applyHold, clearHold, recordVerificationResult } from './goal-binding-normalize';
export type { StateViolation } from './goal-binding-normalize';

// Keyed mutex
export { KeyedMutex, withKeyLock } from './keyed-mutex';

// Resolver
export { GoalResolver, resolveGoalDry, findCandidates, scoreCandidate, isWithinSatisfactionScope } from './goal-resolver';
export type { ResolveCandidate, ScoreBreakdown, ResolveOutcome, ResolveInput, AtomicResolveOutcome, GoalResolverDeps } from './goal-resolver';

// Sync reducer
export { taskStatusToGoalStatus, reduceTaskEvent, reduceGoalEvent, detectGoalTaskDrift, resolveDrift } from './goal-task-sync';
export type { TaskEvent, GoalEvent, SyncEffect, DriftReport } from './goal-task-sync';

// Hold manager
export { requestHold, requestClearHold, isHoldDueForReview, isManuallyPaused, extendHoldReview, isKnownHoldReason } from './goal-hold-manager';
export type { HoldOutcome, ClearOutcome } from './goal-hold-manager';

// Preemption budget
export { PreemptionCoordinator, createPreemptionBudget, consumeStep, checkBudget, buildHoldWitness, isValidWitness } from './preemption-budget';
export type { PreemptionBudget, BudgetCheckResult } from './preemption-budget';

// Activation reactor
export { ActivationReactor, computeRelevance } from './activation-reactor';
export type { ActivationContext, ActivationCandidate, ActivationDecision, ReactorTickResult } from './activation-reactor';

// Periodic review
export { runPeriodicReview } from './periodic-review';
export type { StaleHoldReport, ReviewResult } from './periodic-review';

// Verifier registry
export { VerifierRegistry, verifyShelterV0, createDefaultVerifierRegistry } from './verifier-registry';
export type { VerifierFn, VerificationWorldState } from './verifier-registry';

// Completion checker
export { checkCompletion, applyCompletionOutcome, STABILITY_THRESHOLD } from './completion-checker';
export type { CompletionCheckOutcome } from './completion-checker';

// Lifecycle hooks
export { onTaskStatusChanged, onGoalAction, onTaskProgressUpdated, applySyncEffects } from './goal-lifecycle-hooks';
export type { LifecycleHookResult, EffectApplierDeps } from './goal-lifecycle-hooks';

// Lifecycle events (observability)
export { GoalLifecycleCollector, goalCreatedEvent, goalResolvedEvent, goalVerificationEvent, goalCompletedEvent, goalRegressionEvent } from './goal-lifecycle-events';
export type { GoalLifecycleEvent, GoalCreatedEvent, GoalResolvedEvent, GoalAnchoredEvent, GoalHoldAppliedEvent, GoalHoldClearedEvent, GoalActivatedEvent, GoalPreemptedEvent, GoalVerificationEvent, GoalCompletedEvent, GoalRegressionEvent, GoalDriftDetectedEvent, GoalSyncEffectEvent } from './goal-lifecycle-events';
