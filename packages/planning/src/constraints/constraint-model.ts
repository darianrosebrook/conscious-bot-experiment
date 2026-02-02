/**
 * Constraint Model — Dependency, Reachability, and Support
 *
 * Defines constraint types for feasibility checking:
 * - Dependency: "module X requires module Y completed first"
 * - Reachability: "bot must be within reach distance"
 * - Support: "module X requires structural support from module Y"
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

/**
 * Support constraint: module X requires structural support from module Y.
 * A wall needs a foundation, a roof needs walls, etc.
 */
export interface SupportConstraint {
  readonly type: 'support';
  /** Module that needs support */
  readonly dependentModuleId: string;
  /** Module providing structural support */
  readonly supportModuleId: string;
}

export type PlanConstraint =
  | DependencyConstraint
  | ReachabilityConstraint
  | SupportConstraint;

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

// ============================================================================
// Support Requirement Types
// ============================================================================

/** Support requirement declared on a building module. */
export interface SupportRequirement {
  /** Module ID that provides structural support. */
  readonly supportModuleId: string;
}

/**
 * Extract support constraints from building modules with supportRequirements.
 */
export function extractSupportConstraints(
  modules: ReadonlyArray<{
    moduleId: string;
    supportRequirements?: readonly SupportRequirement[];
  }>
): SupportConstraint[] {
  const constraints: SupportConstraint[] = [];
  for (const mod of modules) {
    if (!mod.supportRequirements) continue;
    for (const req of mod.supportRequirements) {
      constraints.push({
        type: 'support',
        dependentModuleId: mod.moduleId,
        supportModuleId: req.supportModuleId,
      });
    }
  }
  return constraints;
}

// ============================================================================
// Reachability Extraction
// ============================================================================

/** Reachability zone declared on a building module. */
export interface ReachabilityZone {
  /** Maximum height the bot can reach from ground. */
  readonly maxHeight: number;
  /** Optional access requirement (e.g., 'scaffold'). */
  readonly requiresAccess?: string;
}

/**
 * Extract reachability constraints from building modules with reachabilityZone.
 *
 * @param modules - Modules with optional reachabilityZone
 * @param botReachHeight - Bot's maximum reach height from ground
 */
export function extractReachabilityConstraints(
  modules: ReadonlyArray<{
    moduleId: string;
    reachabilityZone?: ReachabilityZone;
  }>,
  botReachHeight: number,
): ReachabilityConstraint[] {
  const constraints: ReachabilityConstraint[] = [];
  for (const mod of modules) {
    if (!mod.reachabilityZone) continue;
    constraints.push({
      type: 'reachability',
      moduleId: mod.moduleId,
      maxDistance: mod.reachabilityZone.maxHeight,
      currentDistance: botReachHeight < mod.reachabilityZone.maxHeight
        ? mod.reachabilityZone.maxHeight
        : 0,
    });
  }
  return constraints;
}
