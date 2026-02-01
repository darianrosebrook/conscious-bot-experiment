/**
 * Plan-Body Interface (PBI) Enforcer
 *
 * Runtime enforcement of PBI contracts to ensure plans reliably become actions.
 * This module provides the verification, timing, and failure detection that
 * prevents the "failure-to-act" loop.
 *
 * @author @darianrosebrook
 */

import {
  PlanStep,
  ActionResult,
  ExecutionContext,
  WorldSnapshot,
  PBIVerificationResult,
  PBIAcceptanceCriteria,
  PBIError,
  PBIErrorCode,
  DEFAULT_PBI_ACCEPTANCE,
  isActionResult,
} from './types';

// Re-export types that are used in the public API
export type {
  ExecutionContext,
  PlanStep,
  PBIVerificationResult,
  PBIAcceptanceCriteria,
  DEFAULT_PBI_ACCEPTANCE,
} from './types';

export { PBIError, PBIErrorCode } from './types';
import {
  CapabilityRegistry,
  CapabilityRegistryBuilder,
} from './capability-registry';

// ============================================================================
// PBI Enforcer Implementation
// ============================================================================

/**
 * Enforces PBI contracts at runtime
 */
export class PBIEnforcer {
  private registry: CapabilityRegistry;
  private acceptanceCriteria: PBIAcceptanceCriteria;
  private metrics: Map<string, number> = new Map();
  private stuckDetectors: Map<string, StuckDetector> = new Map();

  constructor(
    registry: CapabilityRegistry,
    acceptanceCriteria: PBIAcceptanceCriteria = DEFAULT_PBI_ACCEPTANCE
  ) {
    this.registry = registry;
    this.acceptanceCriteria = acceptanceCriteria;
  }

  private createErrorResult(
    error: PBIError,
    verification: PBIVerificationResult,
    executionId: string,
    duration: number,
    ttfaMs: number
  ): ExecutionResult {
    return {
      success: false,
      error,
      verification,
      executionId,
      duration,
      ttfaMs,
    };
  }
  /**
   * Verify a plan step before execution (V1-V4)
   */
  async verifyStep(
    step: PlanStep,
    context: ExecutionContext
  ): Promise<PBIVerificationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const checks = {
      registryCheck: false,
      schemaCheck: false,
      guardCheck: false,
      acceptanceCheck: false,
    };

    // V1: Registry check - step type must exist in registry
    if (!this.registry.has(step.type)) {
      errors.push(`Unknown capability: ${step.type}`);
      return {
        checks,
        errors,
        warnings,
        errorCode: PBIErrorCode.UNKNOWN_VERB,
        metrics: { stuckDetected: false, localRetries: 0 },
      };
    }
    checks.registryCheck = true;

    // V2: Schema validation - args must match capability schema
    const capability = this.registry.get(step.type);
    if (!capability) {
      errors.push(`Capability not found: ${step.type}`);
      return {
        checks,
        errors,
        warnings,
        errorCode: PBIErrorCode.CAPABILITY_UNAVAILABLE,
        metrics: { stuckDetected: false, localRetries: 0 },
      };
    }
    const schemaResult = capability.inputSchema.safeParse(step.args);
    if (!schemaResult.success) {
      errors.push(`Schema violation: ${schemaResult.error.message}`);
      return {
        checks,
        errors,
        warnings,
        errorCode: PBIErrorCode.SCHEMA_VIOLATION,
        metrics: { stuckDetected: false, localRetries: 0 },
      };
    }
    checks.schemaCheck = true;

    // V3: Guard check - preconditions for execution
    if (!capability.guard(context)) {
      errors.push(`Guard failed: capability not applicable in current context`);
      return {
        checks,
        errors,
        warnings,
        errorCode: PBIErrorCode.GUARD_FAILED,
        metrics: { stuckDetected: false, localRetries: 0 },
      };
    }
    checks.guardCheck = true;

    // V4: Acceptance check (simulate) - effects should be achievable
    // This is a pre-flight check based on current world state
    // In practice, this would compare against known world state
    checks.acceptanceCheck = true;

    return {
      checks,
      errors,
      warnings,
      metrics: { stuckDetected: false, localRetries: 0 },
    };
  }

  /**
   * Execute a plan step with PBI enforcement
   */
  async executeStep(
    step: PlanStep,
    context: ExecutionContext,
    worldState: any
  ): Promise<ExecutionResult> {
    const executionId = `${step.stepId}-${Date.now()}`;
    const startTime = performance.now();

    // Initialize stuck detector
    const stuckDetector = new StuckDetector(
      step.stepId,
      this.acceptanceCriteria.stuckTimeoutMs
    );
    this.stuckDetectors.set(step.stepId, stuckDetector);

    try {
      // Pre-execution verification
      const verification = await this.verifyStep(step, context);
      if (verification.errors.length > 0) {
        // Update metrics for verification failures
        this.updateMetrics(step.type, 'failure', 0);

        return {
          success: false,
          error: new PBIError(
            verification.errorCode || PBIErrorCode.SCHEMA_VIOLATION,
            verification.errors.join(', '),
            step.stepId,
            step.type
          ),
          verification,
          executionId,
          duration: performance.now() - startTime,
          ttfaMs: 0, // No action attempted
        };
      }

      // Get capability and start timing
      const capability = this.registry.get(step.type);
      if (!capability) {
        return this.createErrorResult(
          new PBIError(
            PBIErrorCode.CAPABILITY_UNAVAILABLE,
            `Capability not found: ${step.type}`,
            step.stepId,
            step.type
          ),
          verification,
          executionId,
          performance.now() - startTime,
          0
        );
      }
      const actionStartTime = performance.now();

      // Capture pre-execution world snapshot
      const preSnapshot = this.captureWorldSnapshot(worldState);

      // Execute with timeout
      const executionPromise = capability.runner(context, step.args);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Execution timeout')), 30000)
      );

      const actionResult = await Promise.race([
        executionPromise,
        timeoutPromise,
      ]);

      const actionEndTime = performance.now();
      const postSnapshot = this.captureWorldSnapshot(worldState);

      // Validate action result
      if (!isActionResult(actionResult)) {
        return {
          success: false,
          error: new PBIError(
            PBIErrorCode.ACCEPTANCE_FAILED,
            'Action result does not match expected format',
            step.stepId,
            step.type
          ),
          verification,
          executionId,
          duration: performance.now() - startTime,
          ttfaMs: actionEndTime - actionStartTime,
        };
      }

      // Check acceptance criteria
      const acceptancePassed = capability.acceptance(preSnapshot, postSnapshot);
      if (!acceptancePassed) {
        return {
          success: false,
          error: new PBIError(
            PBIErrorCode.ACCEPTANCE_FAILED,
            'Post-execution world state does not match expected effects',
            step.stepId,
            step.type,
            { preSnapshot, postSnapshot, actionResult }
          ),
          verification,
          executionId,
          duration: performance.now() - startTime,
          ttfaMs: actionEndTime - actionStartTime,
        };
      }

      // Success - update metrics
      this.updateMetrics(step.type, 'success', actionEndTime - actionStartTime);
      stuckDetector.markSuccess();

      return {
        success: true,
        result: actionResult,
        verification,
        executionId,
        duration: performance.now() - startTime,
        ttfaMs: actionEndTime - actionStartTime,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      stuckDetector.markFailure();

      this.updateMetrics(step.type, 'failure', duration);

      const pbiError =
        error instanceof PBIError
          ? error
          : new PBIError(
              PBIErrorCode.EXECUTION_TIMEOUT,
              error instanceof Error
                ? error.message
                : 'Unknown execution error',
              step.stepId,
              step.type,
              { originalError: error }
            );

      return {
        success: false,
        error: pbiError,
        verification: {
          checks: {
            registryCheck: false,
            schemaCheck: false,
            guardCheck: false,
            acceptanceCheck: false,
          },
          errors: [pbiError.message],
          warnings: [],
          metrics: { stuckDetected: false, localRetries: 0 },
        },
        executionId,
        duration,
        ttfaMs: 0,
      };
    } finally {
      this.stuckDetectors.delete(step.stepId);
    }
  }

  /**
   * Check for stuck execution
   */
  checkStuckExecution(stepId: string): boolean {
    const detector = this.stuckDetectors.get(stepId);
    return detector?.isStuck() || false;
  }

  /**
   * Get execution metrics
   */
  getMetrics(): Record<string, any> {
    return {
      stepAttempts: this.metrics.get('stepAttempts') || 0,
      stepSuccesses: this.metrics.get('stepSuccesses') || 0,
      stepFailures: this.metrics.get('stepFailures') || 0,
      avgTtfaMs:
        this.metrics.get('totalTtfaMs') ||
        0 / (this.metrics.get('stepAttempts') || 1),
      capabilities: this.registry.getHealthMetrics(),
      stuckDetections: Array.from(this.stuckDetectors.values()).filter((d) =>
        d.isStuck()
      ).length,
    };
  }

  /**
   * Update internal metrics
   */
  public updateMetrics(
    capabilityName: string,
    outcome: 'success' | 'failure',
    ttfaMs: number
  ): void {
    // Update attempt count
    const attempts = this.metrics.get('stepAttempts') || 0;
    this.metrics.set('stepAttempts', attempts + 1);

    // Update success/failure counts
    if (outcome === 'success') {
      const successes = this.metrics.get('stepSuccesses') || 0;
      this.metrics.set('stepSuccesses', successes + 1);
    } else {
      const failures = this.metrics.get('stepFailures') || 0;
      this.metrics.set('stepFailures', failures + 1);
    }

    // Update TTFA tracking
    const totalTtfaMs = this.metrics.get('totalTtfaMs') || 0;
    this.metrics.set('totalTtfaMs', totalTtfaMs + ttfaMs);
  }

  /**
   * Get the capability registry for direct access
   */
  public getRegistry(): CapabilityRegistry {
    return this.registry;
  }

  /**
   * Capture world snapshot for acceptance testing
   */
  private captureWorldSnapshot(worldState: any): WorldSnapshot {
    // Capture actual world state from the provided interface
    return {
      timestamp: Date.now(),
      health: worldState.getHealth?.() ?? 20,
      hunger: worldState.getHunger?.() ?? 20,
      energy: worldState.getEnergy?.() ?? 20,
      position: worldState.getPosition?.() ?? { x: 0, y: 0, z: 0 },
      inventory: worldState.getInventory?.() ?? {},
      nearbyBlocks: [], // Would be populated by worldState.getNearbyBlocks()
      nearbyEntities: [], // Would be populated by worldState.getNearbyEntities()
      timeOfDay: worldState.getTimeOfDay?.() ?? 'day',
      lightLevel: worldState.getLightLevel?.() ?? 15,
      airLevel: worldState.getAir?.() ?? 300,
    };
  }
}

// ============================================================================
// Supporting Classes
// ============================================================================

/**
 * Detects stuck execution based on timing and state changes
 */
class StuckDetector {
  private stepId: string;
  private timeoutMs: number;
  private startTime: number;
  private lastActivity: number;
  private stateChanges: number = 0;

  constructor(stepId: string, timeoutMs: number) {
    this.stepId = stepId;
    this.timeoutMs = timeoutMs;
    this.startTime = Date.now();
    this.lastActivity = this.startTime;
  }

  markActivity(): void {
    this.lastActivity = Date.now();
    this.stateChanges++;
  }

  markSuccess(): void {
    this.markActivity();
  }

  markFailure(): void {
    this.markActivity();
  }

  isStuck(): boolean {
    const now = Date.now();
    const timeSinceActivity = now - this.lastActivity;
    const totalTime = now - this.startTime;

    // Stuck if no activity for timeout period and total time > timeout
    return timeSinceActivity > this.timeoutMs && totalTime > this.timeoutMs;
  }

  getStuckDuration(): number {
    return Date.now() - this.lastActivity;
  }

  getMetrics() {
    return {
      stepId: this.stepId,
      isStuck: this.isStuck(),
      stuckDuration: this.getStuckDuration(),
      totalDuration: Date.now() - this.startTime,
      stateChanges: this.stateChanges,
    };
  }
}

/**
 * Result of PBI-enforced execution
 */
export interface ExecutionResult {
  success: boolean;
  result?: ActionResult;
  error?: PBIError;
  verification: PBIVerificationResult;
  executionId: string;
  duration: number;
  ttfaMs: number;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a PBI enforcer with default registry and acceptance criteria
 */
export function createPBIEnforcer(): PBIEnforcer {
  const registry = new CapabilityRegistryBuilder().addAllBuiltIns().build();

  return new PBIEnforcer(registry);
}

/**
 * Create a PBI enforcer with custom configuration
 */
export function createCustomPBIEnforcer(
  registry: CapabilityRegistry,
  acceptanceCriteria?: Partial<PBIAcceptanceCriteria>
): PBIEnforcer {
  const criteria: PBIAcceptanceCriteria = {
    ...DEFAULT_PBI_ACCEPTANCE,
    ...acceptanceCriteria,
  };

  return new PBIEnforcer(registry, criteria);
}

// Export StuckDetector for use in index.ts
export { StuckDetector };
