/**
 * Rate Limiter - Prevents capability abuse through sophisticated rate limiting
 *
 * Implements sliding window rate limiting with burst allowance, adaptive limits,
 * and capability-specific controls to prevent abuse while allowing legitimate usage.
 *
 * @author @darianrosebrook
 */
import { EventEmitter } from 'events';
import { RateLimitConfig, RateLimitStatus, ExecutionRequest, ExecutionContext, CapabilitySpec } from './types';
export interface RateLimiterEvents {
    'rate-limit-exceeded': [string, RateLimitStatus];
    'burst-allowance-used': [string, number];
    'rate-limit-violation': [string, number];
    'adaptive-limit-changed': [string, RateLimitConfig];
}
/**
 * Sophisticated rate limiting system that prevents capability abuse
 * while allowing legitimate high-frequency actions when appropriate.
 */
export declare class CapabilityRateLimiter extends EventEmitter<RateLimiterEvents> {
    private globalConfig;
    private defaultCapabilityConfig;
    private globalBucket;
    private capabilityBuckets;
    private userBuckets;
    private adaptiveConfigs;
    private violationHistory;
    constructor(globalConfig?: RateLimitConfig, defaultCapabilityConfig?: RateLimitConfig);
    /**
     * Create a new rate limit bucket
     */
    private createBucket;
    /**
     * Check if capability execution is within rate limits
     *
     * @param capability - Capability being requested
     * @param request - Execution request
     * @param context - Current execution context
     * @returns Rate limit status and time until next allowable execution
     */
    checkRateLimit(capability: CapabilitySpec, request: ExecutionRequest, context: ExecutionContext): RateLimitStatus;
    /**
     * Check rate limit for a specific bucket
     */
    private checkBucketLimit;
    /**
     * Record capability execution for rate limit tracking
     *
     * @param capability - Executed capability
     * @param request - Execution request
     * @param timestamp - Execution timestamp
     */
    recordExecution(capability: CapabilitySpec, request: ExecutionRequest, timestamp?: number): void;
    /**
     * Calculate cost for a request (can be overridden for different cost models)
     */
    private calculateRequestCost;
    /**
     * Get or create capability-specific bucket
     */
    private getOrCreateCapabilityBucket;
    /**
     * Get or create user-specific bucket
     */
    private getOrCreateUserBucket;
    /**
     * Clean old entries from bucket
     */
    private cleanBucket;
    /**
     * Record a rate limit violation
     */
    private recordViolation;
    /**
     * Get violation count for identifier
     */
    private getViolationCount;
    /**
     * Implement adaptive rate limiting based on context
     *
     * @param capabilityId - Capability to adjust limits for
     * @param baseLimit - Base rate limit configuration
     * @param context - Current context that may modify limits
     * @returns Adjusted rate limit for current situation
     */
    calculateAdaptiveLimit(capabilityId: string, baseLimit: RateLimitConfig, context: ExecutionContext): RateLimitConfig;
    /**
     * Set adaptive configuration for a capability
     *
     * @param capabilityId - Capability ID
     * @param config - New configuration
     */
    setAdaptiveConfig(capabilityId: string, config: RateLimitConfig): void;
    /**
     * Start cleanup timer to remove old entries periodically
     */
    private startCleanupTimer;
    /**
     * Get current rate limit statistics
     *
     * @returns Statistics about rate limiting
     */
    getStatistics(): {
        globalRequests: number;
        activeCapabilityBuckets: number;
        activeUserBuckets: number;
        totalViolations: number;
        recentViolations: number;
        topViolatedCapabilities: Array<{
            capabilityId: string;
            violations: number;
        }>;
    };
    /**
     * Reset rate limits for a specific capability
     *
     * @param capabilityId - Capability to reset
     */
    resetCapabilityLimits(capabilityId: string): void;
    /**
     * Reset all rate limits
     */
    resetAllLimits(): void;
    /**
     * Get rate limit status for a capability without checking
     *
     * @param capabilityId - Capability ID
     * @returns Current status information
     */
    getCapabilityStatus(capabilityId: string): {
        currentRequests: number;
        maxRequests: number;
        windowMs: number;
        violationCount: number;
        inCooldown: boolean;
    };
}
//# sourceMappingURL=rate-limiter.d.ts.map