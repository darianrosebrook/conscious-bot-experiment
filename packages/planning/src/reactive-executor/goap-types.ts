/**
 * Minimal GOAP-era type stubs retained for reactive-executor compatibility.
 *
 * The full GOAP planner implementation has been retired.
 * These interfaces are kept only because reactive-executor.ts references them.
 *
 * Safety reflexes are now in safety-reflexes.ts (standalone, no GOAP dependency).
 *
 * @author @darianrosebrook
 */

import { Resource, Goal, Precondition } from '../types';

export interface ExecutionContext {
  threatLevel: number;
  hostileCount: number;
  nearLava: boolean;
  lavaDistance: number;
  nearestResource?: Resource;
  resourceValue: number;
  detourDistance: number;
  subgoalUrgency: number;
  estimatedTimeToSubgoal: number;
  commitmentStrength: number;
  nearestLightDistance?: number;
  timeOfDay?: 'day' | 'night';
  lightLevel?: number;
  airLevel?: number;
}

export interface WorldState {
  getHealth(): number;
  getHunger(): number;
  getEnergy(): number;
  getPosition(): { x: number; y: number; z: number };
  getLightLevel(): number;
  getAir(): number;
  getTimeOfDay(): 'day' | 'night';
  hasItem(item: string, quantity?: number): boolean;
  distanceTo(target: { x: number; y: number; z: number }): number;
  getThreatLevel(): number;
  getInventory(): Record<string, number>;
  getNearbyResources(): Resource[];
  getNearbyHostiles(): any[];
}

export interface MCPBus {
  mineflayer: {
    consume: (foodType: string) => Promise<any>;
    dig: (block: any) => Promise<any>;
    pathfinder: any;
  };
  navigation: {
    pathTo: (position: any, options?: any) => Promise<any>;
    swimToSurface: () => Promise<any>;
  };
  state: {
    position: { x: number; y: number; z: number };
  };
}

export interface ActionParams {
  [key: string]: any;
}

export interface ActionResult {
  success: boolean;
  duration: number;
  resourcesConsumed: Record<string, number>;
  resourcesGained: Record<string, number>;
  error?: string;
}

export interface GOAPPlan {
  actions: any[];
  goal: Goal;
  estimatedCost: number;
  estimatedDuration: number;
  successProbability: number;
  containsAction(actionName: string): boolean;
  remainsOnRoute(): boolean;
}

export interface ReactiveExecutorMetrics {
  goapPlanLatency: { p50: number; p95: number };
  plansPerHour: number;
  planCacheHitRate: number;
  repairToReplanRatio: number;
  averageEditDistance: number;
  planStabilityIndex: number;
  actionSuccessRate: number;
  interruptCost: number;
  opportunisticGains: number;
  reflexActivations: number;
  threatResponseTime: number;
  survivalRate: number;
  isExecuting: boolean;
  currentAction: any;
  actionQueue: any[];
}

export type { SafetyAction, ExecutionSnapshot, ReflexMCPBus } from './safety-reflexes';
export { SafetyReflexes } from './safety-reflexes';

// Static import for SafetyReflexes (avoids CJS require resolution issues in vitest/ESM)
import { SafetyReflexes as _SafetyReflexes, type SafetyAction as _SafetyAction } from './safety-reflexes';

/**
 * Stub for GOAPPlanner — provides safety reflex passthrough only.
 * All planning methods are no-ops. Use Sterling solvers for real planning.
 */
export class GOAPPlanner {
  private safetyReflexes: _SafetyReflexes;
  private metrics: ReactiveExecutorMetrics;

  constructor() {
    this.safetyReflexes = new _SafetyReflexes();
    this.metrics = {
      goapPlanLatency: { p50: 0, p95: 0 },
      plansPerHour: 0,
      planCacheHitRate: 0,
      repairToReplanRatio: 0,
      averageEditDistance: 0,
      planStabilityIndex: 0,
      actionSuccessRate: 0,
      interruptCost: 0,
      opportunisticGains: 0,
      reflexActivations: 0,
      threatResponseTime: Infinity,
      survivalRate: 1,
      isExecuting: false,
      currentAction: null,
      actionQueue: [],
    };
  }

  /** Safety reflex passthrough — delegates to standalone SafetyReflexes. */
  checkSafetyReflexes(state: WorldState, context: ExecutionContext): _SafetyAction | null {
    return this.safetyReflexes.checkReflexes({
      health: state.getHealth(),
      hunger: state.getHunger(),
      threatLevel: context.threatLevel,
      hostileCount: context.hostileCount,
      nearLava: context.nearLava,
      lavaDistance: context.lavaDistance,
      lightLevel: context.lightLevel ?? state.getLightLevel(),
      airLevel: context.airLevel ?? state.getAir(),
      position: state.getPosition(),
      hasFood: state.hasItem('food', 1),
    });
  }

  /** Safety reflex passthrough. */
  async executeSafetyReflex(reflex: _SafetyAction, mcp: MCPBus): Promise<ActionResult> {
    this.metrics.reflexActivations++;
    const startTime = performance.now();
    try {
      await this.safetyReflexes.executeReflex(reflex, mcp as any);
      return { success: true, duration: performance.now() - startTime, resourcesConsumed: {}, resourcesGained: {} };
    } catch (err) {
      return { success: false, duration: performance.now() - startTime, resourcesConsumed: {}, resourcesGained: {}, error: (err as Error).message };
    }
  }

  /** No-op — GOAP planning is retired. Returns null. */
  planTo(_goal: Goal, _state: WorldState, _context: ExecutionContext): GOAPPlan | null {
    return null;
  }

  getMetrics(): ReactiveExecutorMetrics { return this.metrics; }
  getCurrentAction(): any { return this.metrics.currentAction || null; }
  getActionQueue(): any[] { return this.metrics.actionQueue || []; }

  /** No-op stub — GOAP execution is retired. */
  isExecuting(): boolean { return this.metrics.isExecuting; }
  /** No-op stub — returns empty result. */
  async executeNextAction(): Promise<ActionResult> {
    return { success: false, duration: 0, resourcesConsumed: {}, resourcesGained: {}, error: 'GOAP execution retired' };
  }
}

/**
 * Stub for PlanRepair — no-op replacement.
 * Plan repair is now handled by Sterling re-solve (modular-server.ts repair gate).
 */
export class PlanRepair {
  /** No-op stub — repair is now handled by Sterling re-solve. */
  handleFailure(_plan: GOAPPlan, _failedAction: any, _state: WorldState, _context: ExecutionContext, _planner?: any): { type: 'repaired' | 'replanned' | 'failed'; plan?: GOAPPlan; editDistance?: number } {
    return { type: 'failed' };
  }
  /** No-op stub — returns empty metrics. */
  getMetrics(): Record<string, any> {
    return { repairAttempts: 0, repairSuccesses: 0, avgEditDistance: 0 };
  }
  attemptRepair(_plan: GOAPPlan, _state: WorldState, _context: ExecutionContext): { type: 'failed'; plan?: undefined } {
    return { type: 'failed' };
  }
}
