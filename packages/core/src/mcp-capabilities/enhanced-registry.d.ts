/**
 * Enhanced Registry - Shadow runs, separate registration paths, and health checks
 *
 * Implements separate registration paths for leaves (signed human builds) vs options (LLM-authored),
 * shadow promotion pipeline with CI gates, quota management, and health monitoring.
 *
 * @author @darianrosebrook
 */
import { LeafFactory, LeafImpl, RegistrationResult } from './leaf-factory';
import { LeafContext, ExecError } from './leaf-contracts';
import { BTDSLParser } from './bt-dsl-parser';
/**
 * Registry status for leaves and options
 */
export type RegistryStatus = 'shadow' | 'active' | 'retired' | 'revoked';
/**
 * Provenance information for tracking authorship and lineage
 */
export interface Provenance {
    author: string;
    parentLineage?: string[];
    codeHash: string;
    signature?: string;
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
        successThreshold: number;
        maxShadowRuns: number;
        failureThreshold: number;
        minShadowRuns?: number;
    };
}
/**
 * Shadow run result
 */
export interface ShadowRunResult {
    id: string;
    timestamp: number;
    status: 'success' | 'failure' | 'timeout';
    durationMs: number;
    error?: ExecError;
    metrics?: Record<string, number>;
    context?: Record<string, any>;
}
/**
 * Shadow run statistics
 */
export interface ShadowStats {
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    timeoutRuns: number;
    averageDurationMs: number;
    successRate: number;
    lastRunTimestamp: number;
}
/**
 * Enhanced registry with shadow runs and governance
 */
export declare class EnhancedRegistry {
    private leafFactory;
    private btParser;
    private enhancedSpecs;
    private shadowRuns;
    private healthChecks;
    private quotas;
    private optionDefs;
    private cb;
    private audit;
    private compiled;
    private veto;
    private maxShadowActive;
    constructor();
    /**
     * Register a leaf (signed human build) with provenance
     */
    registerLeaf(leaf: LeafImpl, provenance: Provenance, status?: RegistryStatus): RegistrationResult;
    /**
     * Register an option (LLM-authored) with shadow configuration
     */
    registerOption(btDslJson: any, provenance: Provenance, shadowConfig: {
        successThreshold: number;
        maxShadowRuns: number;
        failureThreshold: number;
        minShadowRuns?: number;
    }): RegistrationResult;
    /**
     * Execute a shadow run for an option
     */
    executeShadowRun(optionId: string, leafContext: LeafContext, abortSignal?: AbortSignal): Promise<ShadowRunResult>;
    /**
     * Check if an option should be promoted or retired based on shadow run statistics
     */
    private checkShadowPromotion;
    /**
     * Manually promote an option from shadow to active
     */
    promoteOption(optionId: string, reason: string): Promise<boolean>;
    /**
     * Retire an option
     */
    retireOption(optionId: string, reason: string): Promise<boolean>;
    /**
     * Register a health check for an option
     */
    registerHealthCheck(optionId: string, checkFn: () => Promise<boolean>): void;
    /**
     * Perform health check for an option
     */
    performHealthCheck(optionId: string): Promise<boolean>;
    /**
     * Set quota for an option
     */
    setQuota(optionId: string, limit: number, resetIntervalMs?: number): void;
    /**
     * Check and update quota
     */
    checkQuota(optionId: string): boolean;
    /**
     * Get shadow run statistics for an option
     */
    getShadowStats(optionId: string): ShadowStats;
    /**
     * Get all shadow options
     */
    getShadowOptions(): string[];
    /**
     * Get all active options
     */
    getActiveOptions(): string[];
    /**
     * Secondary improvement #13: Make status queries return structured objects
     */
    getActiveOptionsDetailed(): {
        id: string;
        spec: EnhancedSpec;
        stats: ShadowStats;
    }[];
    /**
     * Secondary improvement #15: Revoke an option (sticky status)
     */
    revokeOption(optionId: string, reason: string): Promise<boolean>;
    /**
     * Secondary improvement: Add option to veto list
     */
    addToVetoList(optionId: string): void;
    /**
     * Secondary improvement: Remove option from veto list
     */
    removeFromVetoList(optionId: string): void;
    /**
     * Secondary improvement: Get audit log
     */
    getAuditLog(): Array<{
        ts: number;
        op: string;
        id: string;
        who: string;
        detail?: any;
    }>;
    /**
     * Validate provenance information
     */
    private validateProvenance;
    /**
     * Critical fix #2: Enforce immutable versioning and legal status transitions
     */
    private legalTransition;
    /**
     * Secondary improvement: Audit logging
     */
    private log;
    /**
     * Critical fix #2: Circuit breaker for failing streaks
     */
    private failingStreak;
    /**
     * Critical fix #2: Check if option is in cooldown
     */
    private inCooldown;
    /**
     * Secondary improvement: Ensure compiled BT is cached
     */
    private ensureCompiled;
    /**
     * Critical fix #3: Compute real permissions for an option based on its leaf composition
     */
    private computeOptionPermissions;
    /**
     * Critical fix #1: Get option definition from stored definitions
     */
    private getOptionDefinition;
    /**
     * Get leaf factory for direct access
     */
    getLeafFactory(): LeafFactory;
    /**
     * Get BT parser for direct access
     */
    getBTParser(): BTDSLParser;
    /**
     * Clear all data (for testing)
     */
    clear(): void;
    /**
     * Promote a capability from shadow to active
     */
    promoteCapability(capabilityId: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Retire a capability
     */
    retireCapability(capabilityId: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Get capability details
     */
    getCapability(capabilityId: string): Promise<any>;
    /**
     * List capabilities with optional filtering
     */
    listCapabilities(filters?: {
        status?: string;
        type?: string;
    }): Promise<any[]>;
    /**
     * Get registry statistics
     */
    getStatistics(): Promise<any>;
}
//# sourceMappingURL=enhanced-registry.d.ts.map