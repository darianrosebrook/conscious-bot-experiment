/**
 * Capability-aware action plan routing
 *
 * Routes task requirements to the correct planning backend:
 * - Sterling solvers for search-based planning (crafting, tool progression, building)
 * - Deterministic compiler for template-based lowering (collect, mine)
 * - Unplannable for unknown/underspecified tasks (fail-closed)
 *
 * M2: Declaration-backed routing. When a DeclarationLookup is provided,
 * every route decision produces a CapabilityDecisionRecord with declaration
 * digest, proof status, and required primitives. Warning mode by default.
 *
 * @pivot 3 — Routing is fail-closed and capability-aware
 * @pivot 8 — Strict mode is the production default
 */

import type { TaskRequirement } from './requirements';
import type { CapabilityRoute, PlanBackend, CapabilityDecisionRecord, ProofStatus } from './solve-contract';
import type { DomainDeclarationV1 } from '../sterling/domain-declaration';
import { computeRegistrationDigest } from '../sterling/domain-declaration';

export type { CapabilityRoute, PlanBackend, CapabilityDecisionRecord, ProofStatus } from './solve-contract';

/**
 * M2: Lookup interface for solver declarations.
 *
 * The router needs to know: for a given rig, what declaration exists and
 * whether it has been registered with Sterling. This decouples the router
 * from the solver registry and base-domain-solver internals.
 */
export interface DeclarationLookup {
  /** Get the declaration for a rig ID. Returns null if solver has no declaration. */
  getDeclarationForRig(rigId: string): DomainDeclarationV1 | null;
  /** Check if a declaration digest has been registered with Sterling. */
  isRegistered(digest: string): boolean;
}

export interface RouteOptions {
  /**
   * When true (default), unknown/null requirements produce 'unplannable'.
   * When false, unknown requirements fall back to compiler with a warning.
   *
   * @pivot 8 — Strict mode is the production default.
   */
  strict?: boolean;
  /**
   * M2: Declaration lookup for proof-backed routing.
   * When provided, routes include a CapabilityDecisionRecord with
   * declaration digest, proof status, and warnings.
   */
  declarations?: DeclarationLookup;
}

/**
 * Build a CapabilityDecisionRecord for a route that targets a rig.
 * Returns undefined if no declaration lookup is available.
 */
function buildDecisionRecord(
  rigId: string | null,
  declarations: DeclarationLookup | undefined,
): CapabilityDecisionRecord | undefined {
  if (!declarations || !rigId) return undefined;

  const decl = declarations.getDeclarationForRig(rigId);
  if (!decl) {
    return {
      declarationDigest: null,
      solverId: null,
      proofStatus: 'undeclared',
      requiredPrimitives: [],
      warnings: [`Rig ${rigId}: solver has no DomainDeclarationV1 — capability is not declaration-backed`],
    };
  }

  const digest = computeRegistrationDigest(decl);
  const registered = declarations.isRegistered(digest);

  const proofStatus: ProofStatus = registered ? 'structural' : 'declared';
  const warnings: string[] = [];

  if (!registered) {
    warnings.push(
      `Rig ${rigId}: declaration ${digest.slice(0, 8)}… (${decl.solverId}) exists but is not registered with Sterling`
    );
  }

  // Future: check if primitives have proof evidence → 'verified'
  // For now, highest reachable status is 'structural'

  return {
    declarationDigest: digest,
    solverId: decl.solverId,
    proofStatus,
    requiredPrimitives: decl.implementsPrimitives,
    warnings,
  };
}

/**
 * Route a task requirement to the appropriate planning backend.
 *
 * Routing rules (fail-closed):
 * - craft            -> sterling (Rig A)
 * - tool_progression -> sterling (Rig B)
 * - build            -> sterling (Rig G)
 * - collect, mine    -> compiler (deterministic lowering, no search)
 * - null/unknown     -> unplannable (strict) or compiler (permissive)
 *
 * M2: When options.declarations is provided, every sterling-backed route
 * includes a CapabilityDecisionRecord with declaration digest, proof status,
 * and required primitives. Warning mode: decision.warnings may be non-empty
 * but routing proceeds. Future strict mode will reject undeclared routes.
 *
 * @pivot 3 — If available capabilities do not cover required, status is unplannable.
 */
export function routeActionPlan(
  requirement: TaskRequirement | null,
  options?: RouteOptions
): CapabilityRoute {
  const strict = options?.strict ?? (process.env.STRICT_REQUIREMENTS !== 'false');
  const declarations = options?.declarations;

  if (!requirement) {
    if (strict) {
      return {
        backend: 'unplannable',
        requiredRig: null,
        requiredCapabilities: [],
        availableCapabilities: [],
        reason: 'no-requirement',
      };
    }
    return {
      backend: 'compiler',
      requiredRig: null,
      requiredCapabilities: [],
      availableCapabilities: [],
      reason: 'permissive-fallback',
    };
  }

  switch (requirement.kind) {
    case 'craft':
      return {
        backend: 'sterling',
        requiredRig: 'A',
        requiredCapabilities: ['craft'],
        availableCapabilities: ['craft'],
        reason: 'craft-requirement',
        decision: buildDecisionRecord('A', declarations),
      };

    case 'tool_progression':
      return {
        backend: 'sterling',
        requiredRig: 'B',
        requiredCapabilities: ['tool_progression'],
        availableCapabilities: ['tool_progression'],
        reason: 'tool-progression-requirement',
        decision: buildDecisionRecord('B', declarations),
      };

    case 'build':
      return {
        backend: 'sterling',
        requiredRig: 'G',
        requiredCapabilities: ['build'],
        availableCapabilities: ['build'],
        reason: 'build-requirement',
        decision: buildDecisionRecord('G', declarations),
      };

    case 'collect':
      return {
        backend: 'compiler',
        requiredRig: null,
        requiredCapabilities: ['collect'],
        availableCapabilities: ['collect'],
        reason: 'collect-requirement',
      };

    case 'mine':
      return {
        backend: 'compiler',
        requiredRig: null,
        requiredCapabilities: ['mine'],
        availableCapabilities: ['mine'],
        reason: 'mine-requirement',
      };

    case 'navigate':
      return {
        backend: 'sterling',
        requiredRig: 'E',
        requiredCapabilities: ['navigate'],
        availableCapabilities: ['navigate'],
        reason: 'navigate-requirement',
        decision: buildDecisionRecord('E', declarations),
      };

    case 'explore':
      return {
        backend: 'sterling',
        requiredRig: 'E',
        requiredCapabilities: ['explore'],
        availableCapabilities: ['explore'],
        reason: 'explore-requirement',
        decision: buildDecisionRecord('E', declarations),
      };

    case 'find':
      return {
        backend: 'sterling',
        requiredRig: 'E',
        requiredCapabilities: ['find'],
        availableCapabilities: ['find'],
        reason: 'find-requirement',
        decision: buildDecisionRecord('E', declarations),
      };

    default: {
      const _exhaustive: never = requirement;
      return {
        backend: 'unplannable',
        requiredRig: null,
        requiredCapabilities: [],
        availableCapabilities: [],
        reason: `unknown-requirement-kind: ${(_exhaustive as any)?.kind}`,
      };
    }
  }
}
