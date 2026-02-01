/**
 * Constraint Model — Dependency and Reachability
 *
 * Defines constraint types for feasibility checking. Phase G2 checks:
 * - Dependency: "module X requires module Y completed first"
 * - Reachability: "bot must be within reach distance"
 *
 * No SupportConstraint — deferred until geometric occupancy exists.
 *
 * @author @darianrosebrook
 */

// ============================================================================
// Constraint Types
// ============================================================================

export interface DependencyConstraint {
  readonly type: 'dependency';
  /** Module that depends on another */
  readonly dependentModuleId: string;
  /** Module that must be completed first */
  readonly requiredModuleId: string;
}

export interface ReachabilityConstraint {
  readonly type: 'reachability';
  /** Module that requires bot proximity */
  readonly moduleId: string;
  /** Maximum distance the bot can be from the module's location */
  readonly maxDistance: number;
  /** Current distance (if known; undefined means unknown/not checked) */
  readonly currentDistance?: number;
}

export type PlanConstraint = DependencyConstraint | ReachabilityConstraint;

// ============================================================================
// Constraint Extraction
// ============================================================================

/**
 * Extract dependency constraints from building modules.
 */
export function extractDependencyConstraints(
  modules: ReadonlyArray<{
    moduleId: string;
    requiresModules: string[];
  }>
): DependencyConstraint[] {
  const constraints: DependencyConstraint[] = [];
  for (const mod of modules) {
    for (const reqId of mod.requiresModules) {
      constraints.push({
        type: 'dependency',
        dependentModuleId: mod.moduleId,
        requiredModuleId: reqId,
      });
    }
  }
  return constraints;
}
