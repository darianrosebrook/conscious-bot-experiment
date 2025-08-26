/**
 * Capability Registry - Central management of all available capabilities
 *
 * Provides discovery, validation, execution coordination, and monitoring
 * for all registered capabilities in the MCP system.
 *
 * @author @darianrosebrook
 */
import { EventEmitter } from 'events';
import { CapabilitySpec, CapabilityQuery, CapabilityMatch, ExecutionRequest, ExecutionContext, ExecutionResult, ValidationResult, RegistrationResult, CapabilityExecutor, CapabilityValidator, CapabilityMetrics } from './types';
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
export declare class CapabilityRegistry extends EventEmitter<CapabilityRegistryEvents> {
    private capabilities;
    private executors;
    private validators;
    private metrics;
    private activeExecutions;
    private executionHistory;
    private lastUsed;
    constructor();
    /**
     * Initialize with default Minecraft capabilities
     */
    private initializeDefaultCapabilities;
    /**
     * Register new capability with full specification
     *
     * @param spec - Complete capability specification
     * @returns Registration confirmation and assigned ID
     */
    registerCapability(spec: CapabilitySpec): RegistrationResult;
    /**
     * Register executor for a capability
     *
     * @param capabilityId - ID of capability
     * @param executor - Executor implementation
     */
    registerExecutor(capabilityId: string, executor: CapabilityExecutor): void;
    /**
     * Register validator for a capability
     *
     * @param capabilityId - ID of capability
     * @param validator - Validator implementation
     */
    registerValidator(capabilityId: string, validator: CapabilityValidator): void;
    /**
     * Discover capabilities matching query criteria
     *
     * @param query - Search criteria for capability discovery
     * @returns Matching capabilities with current availability
     */
    discoverCapabilities(query: CapabilityQuery): CapabilityMatch[];
    /**
     * Check if capability is currently available
     *
     * @param capabilityId - ID of capability to check
     * @returns Whether capability is available for execution
     */
    private isCapabilityAvailable;
    /**
     * Validate capability execution request against constraints
     *
     * @param request - Execution request to validate
     * @param context - Current environmental and agent context
     * @returns Validation result with approval/rejection reasons
     */
    validateExecution(request: ExecutionRequest, context: ExecutionContext): Promise<ValidationResult>;
    /**
     * Execute validated capability with full monitoring
     *
     * @param request - Pre-validated execution request
     * @returns Execution result with effects and telemetry
     */
    executeCapability(request: ExecutionRequest, context: ExecutionContext): Promise<ExecutionResult>;
    /**
     * Update metrics for capability execution
     */
    private updateMetrics;
    /**
     * Get capability by ID
     *
     * @param capabilityId - ID of capability
     * @returns Capability specification or undefined
     */
    getCapability(capabilityId: string): CapabilitySpec | undefined;
    /**
     * Get all registered capabilities
     *
     * @returns Array of all capability specifications
     */
    getAllCapabilities(): CapabilitySpec[];
    /**
     * Get metrics for a capability
     *
     * @param capabilityId - ID of capability
     * @returns Capability metrics or undefined
     */
    getCapabilityMetrics(capabilityId: string): CapabilityMetrics | undefined;
    /**
     * Get all capability metrics
     *
     * @returns Map of capability ID to metrics
     */
    getAllMetrics(): Map<string, CapabilityMetrics>;
    /**
     * Get active executions
     *
     * @returns Array of currently executing requests
     */
    getActiveExecutions(): ExecutionRequest[];
    /**
     * Get execution history
     *
     * @param limit - Maximum number of results to return
     * @returns Recent execution results
     */
    getExecutionHistory(limit?: number): ExecutionResult[];
    /**
     * Cancel an active execution
     *
     * @param executionId - ID of execution to cancel
     * @returns Whether cancellation was successful
     */
    cancelExecution(executionId: string): Promise<boolean>;
    /**
     * Enable or disable a capability
     *
     * @param capabilityId - ID of capability
     * @param enabled - Whether to enable or disable
     */
    setCapabilityEnabled(capabilityId: string, enabled: boolean): boolean;
    /**
     * Clear all metrics and history
     */
    clearMetrics(): void;
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
    };
}
//# sourceMappingURL=capability-registry.d.ts.map