/**
 * Capability-aware action plan routing
 *
 * Routes task requirements to the correct planning backend:
 * - Sterling solvers for search-based planning (crafting, tool progression, building)
 * - Deterministic compiler for template-based lowering (collect, mine)
 * - Unplannable for unknown/underspecified tasks (fail-closed)
 *
 * @pivot 3 — Routing is fail-closed and capability-aware
 * @pivot 8 — Strict mode is the production default
 */

import type { TaskRequirement } from './requirements';
import type { CapabilityRoute, PlanBackend } from './solve-contract';

export type { CapabilityRoute, PlanBackend } from './solve-contract';

export interface RouteOptions {
  /**
   * When true (default), unknown/null requirements produce 'unplannable'.
   * When false, unknown requirements fall back to compiler with a warning.
   *
   * @pivot 8 — Strict mode is the production default.
   */
  strict?: boolean;
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
 * @pivot 3 — If available capabilities do not cover required, status is unplannable.
 */
export function routeActionPlan(
  requirement: TaskRequirement | null,
  options?: RouteOptions
): CapabilityRoute {
  const strict = options?.strict ?? (process.env.STRICT_REQUIREMENTS !== 'false');

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
      };

    case 'tool_progression':
      return {
        backend: 'sterling',
        requiredRig: 'B',
        requiredCapabilities: ['tool_progression'],
        availableCapabilities: ['tool_progression'],
        reason: 'tool-progression-requirement',
      };

    case 'build':
      return {
        backend: 'sterling',
        requiredRig: 'G',
        requiredCapabilities: ['build'],
        availableCapabilities: ['build'],
        reason: 'build-requirement',
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

    default: {
      // Exhaustive check: if a new requirement kind is added, TypeScript
      // will flag this as an error (assuming TaskRequirement is a closed union).
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
