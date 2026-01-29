/**
 * @conscious-bot/executor-contracts
 *
 * Plan-Body Interface (PBI) contracts and runtime guards for reliable plan execution.
 *
 * This package provides the "capability discipline" that ensures plans reliably become
 * actions by enforcing strict contracts between planning and execution systems.
 *
 * @author @darianrosebrook
 */

// ============================================================================
// Core Types and Interfaces
// ============================================================================

export type {
  Intent,
  PlanStep,
  ActionResult,
  CapabilitySpec,
  ExecutionContext,
  WorldSnapshot,
  WorldState,
  PBIVerificationResult,
  PBIAcceptanceCriteria,
  ExecutionHealthMetrics,
  CanonicalVerb,
} from './types';

export {
  PBIError,
  PBIErrorCode,
  DEFAULT_PBI_ACCEPTANCE,
  CANONICAL_VERBS,
  isIntent,
  isPlanStep,
  isActionResult,
  isPBIError,
} from './types';

// ============================================================================
// Capability Registry
// ============================================================================

export {
  CapabilityRegistry,
  BUILT_IN_CAPABILITIES,
  CapabilityRegistryBuilder,
  createDefaultRegistry,
} from './capability-registry';

// ============================================================================
// PBI Enforcer
// ============================================================================

export {
  PBIEnforcer,
  createPBIEnforcer,
  createCustomPBIEnforcer,
} from './pbi-enforcer';

export type { ExecutionResult } from './pbi-enforcer';

// Re-export StuckDetector as it's used in types
export { StuckDetector } from './pbi-enforcer';

// ============================================================================
// Leaf Implementation Interfaces
// ============================================================================

export type {
  LeafImpl,
  LeafContext,
  LeafResult,
  LeafRunOptions,
  LeafSpec,
  RegistrationResult,
  LeafStatus,
  ExecError,
  LeafMetrics,
  LeafPermission,
} from './leaf-interfaces';

export {
  createLeafContext,
  validateLeafImpl,
  createExecError,
  ExecErrorCode,
  verifyPostconditions,
  LeafContextSchema,
  LeafResultSchema,
  LeafRunOptionsSchema,
} from './leaf-interfaces';

export { LeafFactory, createLeafFactory } from './leaf-factory';

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

export { IntentSchema, PlanStepSchema, ActionResultSchema } from './types';

// ============================================================================
// Constants and Utilities
// ============================================================================

/**
 * Create a fully configured PBI enforcer with all built-in capabilities
 *
 * This is the main entry point for most use cases. It provides a PBI enforcer
 * with the default capability registry and acceptance criteria.
 *
 * @example
 * ```ts
 * import { createPBIEnforcer } from '@conscious-bot/executor-contracts';
 *
 * const enforcer = createPBIEnforcer();
 * const result = await enforcer.executeStep(planStep, context, worldState);
 * ```
 */
// Factory functions are re-exported from pbi-enforcer.ts to avoid duplication

// ============================================================================
// Quick Start Example
// ============================================================================

/**
 * Quick start example showing how to use the PBI enforcer
 *
 * @example
 * ```ts
 * import { createPBIEnforcer, PBIError } from '@conscious-bot/executor-contracts';
 *
 * // Create enforcer with default capabilities
 * const enforcer = createPBIEnforcer();
 *
 * // Execute a plan step with PBI enforcement
 * const planStep = {
 *   stepId: 'step-1',
 *   type: 'navigate',
 *   args: { x: 100, y: 65, z: 200 }
 * };
 *
 * const context = {
 *   threatLevel: 0.1,
 *   hostileCount: 0,
 *   nearLava: false,
 *   // ... other context fields
 * };
 *
 * try {
 *   const result = await enforcer.executeStep(planStep, context, worldState);
 *
 *   if (result.success) {
 *     console.log(`Step executed successfully in ${result.ttfaMs}ms`);
 *   } else {
 *     console.error('Step failed:', result.error?.message);
 *   }
 * } catch (error) {
 *   if (error instanceof PBIError) {
 *     console.error('PBI Error:', error.code, error.message);
 *   }
 * }
 * ```
 */

// ============================================================================
// Package Information
// ============================================================================

export const VERSION = '1.0.0';
export const DESCRIPTION =
  'Plan-Body Interface (PBI) contracts and runtime guards for reliable plan execution';

/**
 * Health check function for the package
 */
export function healthCheck(): {
  status: 'ok' | 'error';
  version: string;
  description: string;
} {
  try {
    // Try to create a registry to verify the package is working
    new (require('./capability-registry').CapabilityRegistryBuilder)()
      .addBuiltIn('navigate')
      .build();

    return {
      status: 'ok',
      version: VERSION,
      description: DESCRIPTION,
    };
  } catch (error) {
    return {
      status: 'error',
      version: VERSION,
      description: `Package error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
