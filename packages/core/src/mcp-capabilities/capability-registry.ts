/**
 * Enhanced Registry - Shadow runs, separate registration paths, and health checks
 *
 * Implements separate registration paths for leaves (signed human builds) vs options (LLM-authored),
 * shadow promotion pipeline with CI gates, quota management, and health monitoring.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { performance } from 'node:perf_hooks';
import { v4 as uuidv4 } from 'uuid';
import { WorkingLeafFactory } from './working-leaf-factory';
import {
  LeafImpl,
  RegistrationResult,
  LeafContext,
  ExecError,
  createExecError,
} from './leaf-contracts';
import { BTDSLParser, CompiledBTNode } from './bt-dsl-parser';
import {
  CapabilitySpec,
  ExecutionResult,
  ExecutionRequest,
  ValidationResult,
  CapabilityExecutor,
  CapabilityValidator,
  CapabilityMetrics,
  RiskLevel,
  CapabilityQuery,
  CapabilityMatch,
  RegistryStatus,
  validateCapabilitySpec,
  validateExecutionRequest,
  validateExecutionContext,
  ExecutionContext,
} from './types';

// ============================================================================
// Registry Status and Versioning (C0)
// ============================================================================

/**
 * Provenance information for tracking authorship and lineage
 */
export interface Provenance {
  author: string;
  parentLineage?: string[]; // Chain of parent versions
  codeHash: string; // SHA-256 of implementation
  signature?: string; // Cryptographic signature
  createdAt: string;
  metadata?: Record<string, any>;
}

/**
 * Enhanced leaf/option specification with governance
 */
export interface EnhancedSpec {
  name: string;
  version: string;
  status: RegistryStatus;
  provenance: Provenance;
  permissions: string[];
  rateLimitPerMin?: number;
  maxConcurrent?: number;
  healthCheck?: {
    endpoint?: string;
    timeoutMs?: number;
    expectedResponse?: any;
  };
  shadowConfig?: {
    successThreshold: number; // Success rate threshold (0-1)
    maxShadowRuns: number; // Max runs before auto-promotion/retirement
    failureThreshold: number; // Failure rate threshold (0-1)
    minShadowRuns?: number; // Min runs before auto-promotion/retirement
  };
}

import {
  ALL_CAPABILITIES,
  CAPABILITY_EXECUTORS,
  CAPABILITY_VALIDATORS,
} from './capability-specs';

export interface CapabilityRegistryEvents {
  'capability-registered': [CapabilitySpec];
  'capability-executed': [ExecutionResult];
  'execution-started': [ExecutionRequest];
  'execution-completed': [ExecutionResult];
  'execution-failed': [ExecutionResult];
  'validation-failed': [ExecutionRequest, ValidationResult];
}

/**
 * Central registry managing all available capabilities, their specifications,
 * and runtime state. Provides discovery, validation, and execution coordination.
 */
export class CapabilityRegistry extends EventEmitter<CapabilityRegistryEvents> {
  private capabilities = new Map<string, CapabilitySpec>();
  private executors = new Map<string, CapabilityExecutor>();
  private validators = new Map<string, CapabilityValidator>();
  private metrics = new Map<string, CapabilityMetrics>();
  private activeExecutions = new Map<string, ExecutionRequest>();
  private executionHistory: ExecutionResult[] = [];
  private lastUsed = new Map<string, number>();

  constructor() {
    super();
    this.initializeDefaultCapabilities();
  }

  /**
   * Initialize with default Minecraft capabilities
   */
  private initializeDefaultCapabilities(): void {
    for (const capability of ALL_CAPABILITIES) {
      this.registerCapability(capability);
    }

    // Register executors
    for (const [capabilityId, executor] of Object.entries(
      CAPABILITY_EXECUTORS
    )) {
      this.executors.set(capabilityId, executor);
    }

    // Register validators
    for (const [capabilityId, validator] of Object.entries(
      CAPABILITY_VALIDATORS
    )) {
      this.validators.set(capabilityId, validator);
    }
  }

  /**
   * Register new capability with full specification
   *
   * @param spec - Complete capability specification
   * @returns Registration confirmation and assigned ID
   */
  registerCapability(spec: CapabilitySpec): RegistrationResult {
    try {
      // Validate specification
      const validatedSpec = validateCapabilitySpec(spec);

      // Check for conflicts
      if (this.capabilities.has(validatedSpec.id)) {
        return {
          ok: false,
          error: `Capability ${validatedSpec.id} already exists`,
        };
      }

      // Register capability
      this.capabilities.set(validatedSpec.id, validatedSpec);

      // Initialize metrics
      this.metrics.set(validatedSpec.id, {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageLatency: 0,
        p95Latency: 0,
        maxLatency: 0,
        rateLimitViolations: 0,
        constitutionalViolations: 0,
        riskEventsTriggered: 0,
        firstUsed: 0,
        lastUsed: 0,
      });

      this.emit('capability-registered', validatedSpec);

      return {
        ok: true,
        id: validatedSpec.id,
        detail: `Successfully registered capability: ${validatedSpec.name}`,
      };
    } catch (error) {
      return {
        ok: false,
        error: `Failed to register capability: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Register executor for a capability
   *
   * @param capabilityId - ID of capability
   * @param executor - Executor implementation
   */
  registerExecutor(capabilityId: string, executor: CapabilityExecutor): void {
    this.executors.set(capabilityId, executor);
  }

  /**
   * Register validator for a capability
   *
   * @param capabilityId - ID of capability
   * @param validator - Validator implementation
   */
  registerValidator(
    capabilityId: string,
    validator: CapabilityValidator
  ): void {
    this.validators.set(capabilityId, validator);
  }

  /**
   * Discover capabilities matching query criteria
   *
   * @param query - Search criteria for capability discovery
   * @returns Matching capabilities with current availability
   */
  discoverCapabilities(query: CapabilityQuery): CapabilityMatch[] {
    const matches: CapabilityMatch[] = [];

    for (const [id, capability] of this.capabilities) {
      if (!capability.enabled) continue;

      let score = 0;
      const reasons: string[] = [];

      // Category filter
      if (query.category && capability.category === query.category) {
        score += 0.3;
        reasons.push(`matches category: ${query.category}`);
      }

      // Risk level filter
      if (
        query.riskLevel !== undefined &&
        capability.riskLevel <= query.riskLevel
      ) {
        score += 0.2;
        reasons.push(
          `risk level acceptable: ${capability.riskLevel} <= ${query.riskLevel}`
        );
      }

      // Safety tags filter
      if (query.safetyTags && query.safetyTags.length > 0) {
        const matchingTags = query.safetyTags.filter((tag) =>
          capability.safetyTags.includes(tag)
        );
        if (matchingTags.length > 0) {
          score += 0.2 * (matchingTags.length / query.safetyTags.length);
          reasons.push(`matching safety tags: ${matchingTags.join(', ')}`);
        }
      }

      // Duration filter
      if (
        query.maxDuration !== undefined &&
        capability.durationMs <= query.maxDuration
      ) {
        score += 0.15;
        reasons.push(
          `duration within limit: ${capability.durationMs}ms <= ${query.maxDuration}ms`
        );
      }

      // Cost filter
      if (query.maxCost !== undefined && capability.costHint <= query.maxCost) {
        score += 0.15;
        reasons.push(
          `cost within limit: ${capability.costHint} <= ${query.maxCost}`
        );
      }

      // Text search
      if (query.searchText) {
        const searchLower = query.searchText.toLowerCase();
        if (
          capability.name.toLowerCase().includes(searchLower) ||
          capability.description.toLowerCase().includes(searchLower)
        ) {
          score += 0.1;
          reasons.push(`matches search text: "${query.searchText}"`);
        }
      }

      // Only include if there's some match
      if (score > 0 || Object.keys(query).length === 0) {
        matches.push({
          capability,
          matchScore: score,
          matchReasons: reasons,
          available: this.isCapabilityAvailable(id),
          estimatedCost: capability.costHint,
          lastUsed: this.lastUsed.get(id),
        });
      }
    }

    // Sort by match score (descending)
    return matches.sort((a, b) => b.matchScore - a.matchScore);
  }

  /**
   * Check if capability is currently available
   *
   * @param capabilityId - ID of capability to check
   * @returns Whether capability is available for execution
   */
  private isCapabilityAvailable(capabilityId: string): boolean {
    const capability = this.capabilities.get(capabilityId);
    if (!capability || !capability.enabled) return false;

    // Check concurrent execution limit
    const activeCount = Array.from(this.activeExecutions.values()).filter(
      (req) => req.capabilityId === capabilityId
    ).length;

    if (activeCount >= capability.maxConcurrent) return false;

    // Check cooldown
    const lastUsed = this.lastUsed.get(capabilityId);
    if (lastUsed && Date.now() - lastUsed < capability.cooldownMs) return false;

    return true;
  }

  /**
   * Validate capability execution request against constraints
   *
   * @param request - Execution request to validate
   * @param context - Current environmental and agent context
   * @returns Validation result with approval/rejection reasons
   */
  async validateExecution(
    request: ExecutionRequest,
    context: ExecutionContext
  ): Promise<ValidationResult> {
    try {
      validateExecutionRequest(request);
      validateExecutionContext(context);
    } catch (error) {
      return {
        approved: false,
        reasons: [
          `Invalid request or context: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
        preconditionsPassed: false,
        constitutionalApproval: false,
        rateLimitApproval: false,
        riskAssessment: {
          level: RiskLevel.HIGH,
          factors: ['validation_failed'],
        },
        timestamp: Date.now(),
      };
    }

    const capability = this.capabilities.get(request.capabilityId);
    if (!capability) {
      return {
        approved: false,
        reasons: [`Unknown capability: ${request.capabilityId}`],
        preconditionsPassed: false,
        constitutionalApproval: false,
        rateLimitApproval: false,
        riskAssessment: {
          level: RiskLevel.HIGH,
          factors: ['unknown_capability'],
        },
        timestamp: Date.now(),
      };
    }

    if (!capability.enabled) {
      return {
        approved: false,
        reasons: [`Capability disabled: ${request.capabilityId}`],
        preconditionsPassed: false,
        constitutionalApproval: false,
        rateLimitApproval: false,
        riskAssessment: {
          level: RiskLevel.MEDIUM,
          factors: ['capability_disabled'],
        },
        timestamp: Date.now(),
      };
    }

    const reasons: string[] = [];
    let preconditionsPassed = true;
    let constitutionalApproval = true;
    let rateLimitApproval = true;

    // Check availability
    if (!this.isCapabilityAvailable(request.capabilityId)) {
      rateLimitApproval = false;
      reasons.push(
        'Capability not available (cooldown, concurrent limit, or disabled)'
      );
    }

    // Check preconditions with validator
    const validator = this.validators.get(request.capabilityId);
    if (validator) {
      try {
        preconditionsPassed = await validator.validatePreconditions(
          request,
          context
        );
        if (!preconditionsPassed) {
          reasons.push('Preconditions not met');
        }
      } catch (error) {
        preconditionsPassed = false;
        reasons.push(
          `Precondition validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    // Basic constitutional check (simplified)
    if (capability.riskLevel >= RiskLevel.HIGH && !request.metadata?.approved) {
      constitutionalApproval = false;
      reasons.push('High risk capability requires approval');
    }

    // Check context safety
    if (context.dangerLevel > 0.8 && capability.riskLevel >= RiskLevel.MEDIUM) {
      constitutionalApproval = false;
      reasons.push('Dangerous context prohibits medium+ risk actions');
    }

    const approved =
      preconditionsPassed && constitutionalApproval && rateLimitApproval;

    if (approved) {
      reasons.push('All validation checks passed');
    }

    return {
      approved,
      reasons,
      preconditionsPassed,
      constitutionalApproval,
      rateLimitApproval,
      riskAssessment: {
        level: capability.riskLevel,
        factors:
          capability.riskLevel >= RiskLevel.MEDIUM
            ? ['inherent_capability_risk']
            : [],
        mitigation: approved ? ['validation_passed'] : undefined,
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Execute validated capability with full monitoring
   *
   * @param request - Pre-validated execution request
   * @returns Execution result with effects and telemetry
   */
  async executeCapability(
    request: ExecutionRequest,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const executionId = uuidv4();
    const requestWithId = { ...request, id: executionId };

    // Track active execution
    this.activeExecutions.set(executionId, requestWithId);
    this.emit('execution-started', requestWithId);

    try {
      const executor = this.executors.get(request.capabilityId);
      if (!executor) {
        throw new Error(
          `No executor found for capability: ${request.capabilityId}`
        );
      }

      // Execute capability
      const result = await executor.execute(requestWithId, context);

      // Update tracking
      this.lastUsed.set(request.capabilityId, Date.now());
      this.updateMetrics(request.capabilityId, result);
      this.executionHistory.push(result);

      // Cleanup
      this.activeExecutions.delete(executionId);

      if (result.success) {
        this.emit('execution-completed', result);
      } else {
        this.emit('execution-failed', result);
      }

      this.emit('capability-executed', result);

      return result;
    } catch (error) {
      const errorResult: ExecutionResult = {
        id: executionId,
        requestId: request.id,
        capabilityId: request.capabilityId,
        success: false,
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
        effects: [],
        error:
          error instanceof Error ? error.message : 'Unknown execution error',
        retryCount: 0,
      };

      this.updateMetrics(request.capabilityId, errorResult);
      this.executionHistory.push(errorResult);
      this.activeExecutions.delete(executionId);

      this.emit('execution-failed', errorResult);
      this.emit('capability-executed', errorResult);

      return errorResult;
    }
  }

  /**
   * Update metrics for capability execution
   */
  private updateMetrics(capabilityId: string, result: ExecutionResult): void {
    const metrics = this.metrics.get(capabilityId);
    if (!metrics) return;

    metrics.totalExecutions++;
    if (result.success) {
      metrics.successfulExecutions++;
    } else {
      metrics.failedExecutions++;
    }

    // Update latency statistics
    const latency = result.duration;
    if (metrics.totalExecutions === 1) {
      metrics.averageLatency = latency;
      metrics.p95Latency = latency;
      metrics.maxLatency = latency;
      metrics.firstUsed = result.startTime;
    } else {
      // Update running average
      metrics.averageLatency =
        (metrics.averageLatency * (metrics.totalExecutions - 1) + latency) /
        metrics.totalExecutions;

      // Update max
      metrics.maxLatency = Math.max(metrics.maxLatency, latency);

      // Simplified P95 calculation (would use proper percentile calculation in production)
      metrics.p95Latency = Math.max(metrics.p95Latency, latency * 0.95);
    }

    metrics.lastUsed = result.endTime;
  }

  /**
   * Get capability by ID
   *
   * @param capabilityId - ID of capability
   * @returns Capability specification or undefined
   */
  getCapability(capabilityId: string): CapabilitySpec | undefined {
    return this.capabilities.get(capabilityId);
  }

  /**
   * Get all registered capabilities
   *
   * @returns Array of all capability specifications
   */
  getAllCapabilities(): CapabilitySpec[] {
    return Array.from(this.capabilities.values());
  }

  /**
   * Get metrics for a capability
   *
   * @param capabilityId - ID of capability
   * @returns Capability metrics or undefined
   */
  getCapabilityMetrics(capabilityId: string): CapabilityMetrics | undefined {
    return this.metrics.get(capabilityId);
  }

  /**
   * Get all capability metrics
   *
   * @returns Map of capability ID to metrics
   */
  getAllMetrics(): Map<string, CapabilityMetrics> {
    return new Map(this.metrics);
  }

  /**
   * Get active executions
   *
   * @returns Array of currently executing requests
   */
  getActiveExecutions(): ExecutionRequest[] {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Get execution history
   *
   * @param limit - Maximum number of results to return
   * @returns Recent execution results
   */
  getExecutionHistory(limit: number = 100): ExecutionResult[] {
    return this.executionHistory.slice(-limit);
  }

  /**
   * Cancel an active execution
   *
   * @param executionId - ID of execution to cancel
   * @returns Whether cancellation was successful
   */
  async cancelExecution(executionId: string): Promise<boolean> {
    const request = this.activeExecutions.get(executionId);
    if (!request) return false;

    const executor = this.executors.get(request.capabilityId);
    if (executor?.cancel) {
      const cancelled = await executor.cancel(executionId);
      if (cancelled) {
        this.activeExecutions.delete(executionId);
      }
      return cancelled;
    }

    return false;
  }

  /**
   * Enable or disable a capability
   *
   * @param capabilityId - ID of capability
   * @param enabled - Whether to enable or disable
   */
  setCapabilityEnabled(capabilityId: string, enabled: boolean): boolean {
    const capability = this.capabilities.get(capabilityId);
    if (!capability) return false;

    capability.enabled = enabled;
    return true;
  }

  /**
   * Clear all metrics and history
   */
  clearMetrics(): void {
    for (const [capabilityId] of this.metrics) {
      this.metrics.set(capabilityId, {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageLatency: 0,
        p95Latency: 0,
        maxLatency: 0,
        rateLimitViolations: 0,
        constitutionalViolations: 0,
        riskEventsTriggered: 0,
        firstUsed: 0,
        lastUsed: 0,
      });
    }
    this.executionHistory = [];
    this.lastUsed.clear();
  }

  /**
   * Get system statistics
   *
   * @returns System-wide statistics
   */
  getSystemStats(): {
    totalCapabilities: number;
    enabledCapabilities: number;
    activeExecutions: number;
    totalExecutions: number;
    successRate: number;
  } {
    const capabilities = Array.from(this.capabilities.values());
    const allMetrics = Array.from(this.metrics.values());

    const totalExecutions = allMetrics.reduce(
      (sum, m) => sum + m.totalExecutions,
      0
    );
    const successfulExecutions = allMetrics.reduce(
      (sum, m) => sum + m.successfulExecutions,
      0
    );

    return {
      totalCapabilities: capabilities.length,
      enabledCapabilities: capabilities.filter((c) => c.enabled).length,
      activeExecutions: this.activeExecutions.size,
      totalExecutions,
      successRate:
        totalExecutions > 0 ? successfulExecutions / totalExecutions : 1,
    };
  }
}
