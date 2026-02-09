/**
 * P09 Reference Adapter — Portable Contingency Planning Implementation
 *
 * Satisfies all 5 P09 invariants:
 *   1. forced_transition_application      — forced transitions fire at declared times, cannot be skipped
 *   2. deterministic_policy_branching     — same state + triggers → same policy branch
 *   3. safety_under_forced_transitions    — safety verified at every reachable node
 *   4. bounded_contingency_plan           — MAX_HORIZON, MAX_BRANCH_FACTOR, MAX_POLICY_NODES enforced
 *   5. deterministic_trigger_evaluation   — same state → same trigger set
 *
 * Key semantic: chosen actions are non-interruptible but the world continues
 * to evolve during their duration. applyChosenAction simulates tick-by-tick
 * advancement, applying forced transitions at every intermediate tick.
 * This guarantees that forced transitions cannot be skipped even when a
 * chosen action spans over their scheduled tick.
 *
 * Zero Minecraft imports. Zero vitest imports.
 */

import type {
  P09ActionResultV1,
  P09ChosenActionEdgeV1,
  P09ContingencyAdapter,
  P09ContingencyPolicyV1,
  P09ForcedTransitionEdgeV1,
  P09PlanningResultV1,
  P09PolicyBranchV1,
  P09PolicyNodeV1,
  P09SafetyInvariantV1,
  P09TimeIndexedStateV1,
  P09TriggerConditionV1,
} from './p09-capsule-types.js';
import {
  MAX_BRANCH_FACTOR,
  MAX_HORIZON,
  MAX_POLICY_NODES,
} from './p09-capsule-types.js';

export class P09ReferenceAdapter implements P09ContingencyAdapter {
  readonly maxHorizon = MAX_HORIZON;
  readonly maxBranchFactor = MAX_BRANCH_FACTOR;
  readonly maxPolicyNodes = MAX_POLICY_NODES;

  applyChosenAction(
    state: P09TimeIndexedStateV1,
    action: P09ChosenActionEdgeV1,
    triggers: readonly P09TriggerConditionV1[],
    transitions: readonly P09ForcedTransitionEdgeV1[],
    safetyInvariants: readonly P09SafetyInvariantV1[],
  ): P09ActionResultV1 | null {
    // Check preconditions at start tick
    for (const [prop, minValue] of Object.entries(action.preconditions)) {
      if ((state.properties[prop] ?? 0) < minValue) {
        return null; // Precondition not met
      }
    }

    // Build trigger → transition lookup
    const transitionByTrigger = new Map<string, P09ForcedTransitionEdgeV1>();
    for (const t of transitions) {
      transitionByTrigger.set(t.triggerId, t);
    }

    // Simulate tick-by-tick advancement during the action's duration.
    // The action's own effects are applied at the END (after all intermediate
    // forced transitions). This models "non-interruptible action, world evolves."
    let currentState = state;
    const intermediateForced: { transitionId: string; triggerId: string; atTick: number }[] = [];
    const allViolated = new Set<string>();

    for (let t = state.tick + 1; t <= state.tick + action.durationTicks; t++) {
      // Advance tick
      currentState = { tick: t, properties: { ...currentState.properties } };

      // Evaluate triggers at this intermediate tick
      const firedIds = this.evaluateTriggers(currentState, triggers);
      for (const triggerId of firedIds) {
        const transition = transitionByTrigger.get(triggerId);
        if (transition) {
          currentState = this.applyForcedTransition(currentState, transition);
          intermediateForced.push({
            transitionId: transition.id,
            triggerId,
            atTick: t,
          });
        }
      }

      // Check safety at this intermediate tick
      const violated = this.checkAllSafety(currentState, safetyInvariants);
      for (const v of violated) allViolated.add(v);
    }

    // Apply the action's own effects at the end
    const finalProps: Record<string, number> = { ...currentState.properties };
    for (const [prop, delta] of Object.entries(action.effects)) {
      finalProps[prop] = (finalProps[prop] ?? 0) + delta;
    }
    const finalState: P09TimeIndexedStateV1 = {
      tick: currentState.tick,
      properties: finalProps,
    };

    // Check safety after action effects
    const postActionViolated = this.checkAllSafety(finalState, safetyInvariants);
    for (const v of postActionViolated) allViolated.add(v);

    return {
      finalState,
      intermediateForced,
      safetyViolatedDuringAction: allViolated.size > 0,
      violatedInvariantIds: [...allViolated].sort(),
    };
  }

  applyForcedTransition(
    state: P09TimeIndexedStateV1,
    transition: P09ForcedTransitionEdgeV1,
  ): P09TimeIndexedStateV1 {
    // Forced transitions always apply — no precondition check, no null return.
    const newProps: Record<string, number> = { ...state.properties };
    for (const [prop, delta] of Object.entries(transition.effects)) {
      newProps[prop] = (newProps[prop] ?? 0) + delta;
    }

    // Forced transitions don't advance tick (they fire AT a tick)
    return {
      tick: state.tick,
      properties: newProps,
    };
  }

  evaluateTriggers(
    state: P09TimeIndexedStateV1,
    triggers: readonly P09TriggerConditionV1[],
  ): readonly string[] {
    const fired: string[] = [];

    for (const trigger of triggers) {
      if (trigger.mode === 'tick_interval') {
        // Fires if (tick - offset) is a non-negative multiple of interval
        if (trigger.intervalTicks > 0) {
          const adjusted = state.tick - trigger.offsetTicks;
          if (adjusted >= 0 && adjusted % trigger.intervalTicks === 0) {
            fired.push(trigger.id);
          }
        }
      } else if (trigger.mode === 'threshold') {
        // Fires if the watched property crosses below the threshold
        const value = state.properties[trigger.watchProperty] ?? 0;
        if (value <= trigger.thresholdValue) {
          fired.push(trigger.id);
        }
      }
    }

    // Sorted lexicographically for determinism
    fired.sort();
    return fired;
  }

  checkSafety(
    state: P09TimeIndexedStateV1,
    invariant: P09SafetyInvariantV1,
  ): boolean {
    for (const [prop, minimum] of Object.entries(invariant.minimums)) {
      if ((state.properties[prop] ?? 0) < minimum) {
        return false;
      }
    }
    return true;
  }

  checkAllSafety(
    state: P09TimeIndexedStateV1,
    invariants: readonly P09SafetyInvariantV1[],
  ): readonly string[] {
    const violated: string[] = [];
    for (const inv of invariants) {
      if (!this.checkSafety(state, inv)) {
        violated.push(inv.id);
      }
    }
    // Sorted for determinism
    violated.sort();
    return violated;
  }

  planContingency(
    initialState: P09TimeIndexedStateV1,
    actions: readonly P09ChosenActionEdgeV1[],
    transitions: readonly P09ForcedTransitionEdgeV1[],
    triggers: readonly P09TriggerConditionV1[],
    safetyInvariants: readonly P09SafetyInvariantV1[],
    goalPredicate: (state: P09TimeIndexedStateV1) => boolean,
    horizonTicks: number,
    now?: () => number,
  ): P09PlanningResultV1 {
    const startTime = now ? now() : 0;
    const effectiveHorizon = Math.min(horizonTicks, MAX_HORIZON);
    const endTick = initialState.tick + effectiveHorizon;

    const nodes: Record<string, P09PolicyNodeV1> = {};
    const branches: P09PolicyBranchV1[] = [];
    const forcedApplied: { transitionId: string; atTick: number; atNodeId: string }[] = [];
    let nodeCounter = 0;
    let statesExpanded = 0;

    // Build lookup: triggerId → forced transition
    const transitionByTrigger = new Map<string, P09ForcedTransitionEdgeV1>();
    for (const t of transitions) {
      transitionByTrigger.set(t.triggerId, t);
    }

    // BFS queue: [nodeId, depth]
    const queue: [string, number][] = [];

    // Evaluate triggers at root to populate forcedAppliedAtTick
    const rootFired = this.evaluateTriggers(initialState, triggers);

    // Create root node
    const rootId = `n${nodeCounter++}`;
    const rootViolations = this.checkAllSafety(initialState, safetyInvariants);
    nodes[rootId] = {
      nodeId: rootId,
      state: initialState,
      prescribedActionId: null,
      isTerminal: false,
      isGoalReached: goalPredicate(initialState),
      isSafe: rootViolations.length === 0,
      forcedAppliedAtTick: [], // Root: no forced transitions applied yet
    };
    queue.push([rootId, 0]);

    // Track all violated invariants
    const allViolated = new Set<string>(rootViolations);

    while (queue.length > 0 && nodeCounter < MAX_POLICY_NODES) {
      const [currentId, depth] = queue.shift()!;
      const currentNode = nodes[currentId];
      const currentState = currentNode.state;
      statesExpanded++;

      // Terminal conditions: goal reached, past horizon, or unsafe
      if (currentNode.isGoalReached || currentState.tick >= endTick || !currentNode.isSafe) {
        nodes[currentId] = { ...currentNode, isTerminal: true, prescribedActionId: null };
        continue;
      }

      // Step 1: Evaluate triggers at current state
      const firedTriggerIds = this.evaluateTriggers(currentState, triggers);

      // Step 2: If triggers fired, apply ALL forced transitions first (mandatory)
      if (firedTriggerIds.length > 0) {
        let postForceState = currentState;
        const appliedIds: string[] = [];
        for (const triggerId of firedTriggerIds) {
          const transition = transitionByTrigger.get(triggerId);
          if (transition) {
            postForceState = this.applyForcedTransition(postForceState, transition);
            appliedIds.push(transition.id);
            forcedApplied.push({
              transitionId: transition.id,
              atTick: currentState.tick,
              atNodeId: currentId,
            });
          }
        }

        // Create a node for the post-forced state
        const postForceId = `n${nodeCounter++}`;
        const postViolations = this.checkAllSafety(postForceState, safetyInvariants);
        for (const v of postViolations) allViolated.add(v);

        nodes[postForceId] = {
          nodeId: postForceId,
          state: postForceState,
          prescribedActionId: null,
          isTerminal: false,
          isGoalReached: goalPredicate(postForceState),
          isSafe: postViolations.length === 0,
          forcedAppliedAtTick: appliedIds,
        };

        // Branch: forced edges from current → post-force
        for (const triggerId of firedTriggerIds) {
          const transition = transitionByTrigger.get(triggerId);
          if (transition) {
            branches.push({
              fromNodeId: currentId,
              toNodeId: postForceId,
              edge: transition,
              triggeredBy: triggerId,
            });
          }
        }

        // Mark current node as non-terminal
        nodes[currentId] = { ...currentNode, isTerminal: false, prescribedActionId: null };

        if (nodeCounter < MAX_POLICY_NODES) {
          queue.push([postForceId, depth + 1]);
        }
        continue; // Don't expand chosen actions from a node where forced transitions fire
      }

      // Step 3: No forced transitions at decision node — try each applicable chosen action.
      // Each chosen action simulates tick-by-tick advancement, applying all forced
      // transitions at intermediate ticks. This is the core P09 guarantee.
      let branchCount = 0;
      let bestActionId: string | null = null;
      let bestActionCost = Infinity;

      // Sort actions by cost then ID for determinism
      const sortedActions = [...actions].sort((a, b) =>
        a.cost !== b.cost ? a.cost - b.cost : a.id.localeCompare(b.id),
      );

      for (const action of sortedActions) {
        if (branchCount >= MAX_BRANCH_FACTOR || nodeCounter >= MAX_POLICY_NODES) break;

        const actionResult = this.applyChosenAction(
          currentState,
          action,
          triggers,
          transitions,
          safetyInvariants,
        );
        if (actionResult === null) continue; // Precondition not met

        // Record any forced transitions that fired during this action
        for (const f of actionResult.intermediateForced) {
          forcedApplied.push({
            transitionId: f.transitionId,
            atTick: f.atTick,
            atNodeId: currentId,
          });
        }

        const childId = `n${nodeCounter++}`;
        const childViolations = this.checkAllSafety(actionResult.finalState, safetyInvariants);
        // Merge violations from intermediate ticks and final state
        const allChildViolated = new Set([
          ...actionResult.violatedInvariantIds,
          ...childViolations,
        ]);
        for (const v of allChildViolated) allViolated.add(v);

        nodes[childId] = {
          nodeId: childId,
          state: actionResult.finalState,
          prescribedActionId: null,
          isTerminal: false,
          isGoalReached: goalPredicate(actionResult.finalState),
          isSafe: allChildViolated.size === 0,
          forcedAppliedAtTick: actionResult.intermediateForced.map((f) => f.transitionId),
        };

        branches.push({
          fromNodeId: currentId,
          toNodeId: childId,
          edge: action,
          triggeredBy: null,
        });

        branchCount++;

        // Track best (lowest cost) safe action
        if (allChildViolated.size === 0 && action.cost < bestActionCost) {
          bestActionCost = action.cost;
          bestActionId = action.id;
        }

        if (nodeCounter < MAX_POLICY_NODES) {
          queue.push([childId, depth + 1]);
        }
      }

      // If no actions were applicable, this is terminal
      if (branchCount === 0) {
        nodes[currentId] = { ...currentNode, isTerminal: true, prescribedActionId: null };
      } else {
        // Prescribe the best safe action at this node
        nodes[currentId] = { ...currentNode, prescribedActionId: bestActionId };
      }
    }

    // Mark any remaining queued nodes as terminal (hit node cap)
    for (const [queuedId] of queue) {
      if (nodes[queuedId]) {
        nodes[queuedId] = { ...nodes[queuedId], isTerminal: true };
      }
    }

    // Compute policy metrics
    const totalNodes = Object.keys(nodes).length;
    const maxDepthVal = this.computeMaxDepth(rootId, branches);
    const maxBranchVal = this.computeMaxBranchingFactor(branches);
    const allTerminalsSafe = Object.values(nodes)
      .filter((n) => n.isTerminal)
      .every((n) => n.isSafe);
    const goalReachable = Object.values(nodes).some((n) => n.isGoalReached);

    const policy: P09ContingencyPolicyV1 = {
      rootNodeId: rootId,
      nodes,
      branches,
      totalNodes,
      maxDepth: maxDepthVal,
      maxBranchingFactor: maxBranchVal,
      allTerminalsSafe,
      goalReachable,
    };

    return {
      policy,
      safetyVerified: allViolated.size === 0,
      violatedInvariants: [...allViolated].sort(),
      durationMs: now ? now() - startTime : 0,
      statesExpanded,
      forcedTransitionsApplied: forcedApplied,
    };
  }

  // -- Private helpers -------------------------------------------------------

  private computeMaxDepth(
    rootId: string,
    branches: readonly P09PolicyBranchV1[],
  ): number {
    const childMap = new Map<string, string[]>();
    for (const b of branches) {
      if (!childMap.has(b.fromNodeId)) childMap.set(b.fromNodeId, []);
      childMap.get(b.fromNodeId)!.push(b.toNodeId);
    }

    let maxDepth = 0;
    const depthQueue: [string, number][] = [[rootId, 0]];
    const visited = new Set<string>();

    while (depthQueue.length > 0) {
      const [nodeId, d] = depthQueue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      maxDepth = Math.max(maxDepth, d);
      const children = childMap.get(nodeId) ?? [];
      for (const child of children) {
        depthQueue.push([child, d + 1]);
      }
    }

    return maxDepth;
  }

  private computeMaxBranchingFactor(branches: readonly P09PolicyBranchV1[]): number {
    const childCounts = new Map<string, number>();
    for (const b of branches) {
      childCounts.set(b.fromNodeId, (childCounts.get(b.fromNodeId) ?? 0) + 1);
    }
    return childCounts.size > 0 ? Math.max(...childCounts.values()) : 0;
  }
}
