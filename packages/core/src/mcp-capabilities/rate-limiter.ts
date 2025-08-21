/**
 * Rate Limiter - Prevents capability abuse through sophisticated rate limiting
 *
 * Implements sliding window rate limiting with burst allowance, adaptive limits,
 * and capability-specific controls to prevent abuse while allowing legitimate usage.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';

import {
  RateLimitConfig,
  RateLimitStatus,
  ExecutionRequest,
  ExecutionContext,
  CapabilitySpec,
} from './types';

interface RateLimitEntry {
  timestamp: number;
  capabilityId: string;
  requestId: string;
  cost: number;
}

interface RateLimitBucket {
  config: RateLimitConfig;
  entries: RateLimitEntry[];
  lastReset: number;
  violationCount: number;
  totalRequests: number;
}

export interface RateLimiterEvents {
  'rate-limit-exceeded': [string, RateLimitStatus]; // capabilityId, status
  'burst-allowance-used': [string, number]; // capabilityId, remaining
  'rate-limit-violation': [string, number]; // capabilityId, violationCount
  'adaptive-limit-changed': [string, RateLimitConfig]; // capabilityId, newConfig
}

/**
 * Sophisticated rate limiting system that prevents capability abuse
 * while allowing legitimate high-frequency actions when appropriate.
 */
export class CapabilityRateLimiter extends EventEmitter<RateLimiterEvents> {
  private globalBucket: RateLimitBucket;
  private capabilityBuckets = new Map<string, RateLimitBucket>();
  private userBuckets = new Map<string, RateLimitBucket>();
  private adaptiveConfigs = new Map<string, RateLimitConfig>();
  private violationHistory: Array<{
    capabilityId: string;
    timestamp: number;
    severity: number;
  }> = [];

  constructor(
    private globalConfig: RateLimitConfig = {
      windowMs: 60000, // 1 minute
      maxRequests: 100, // 100 requests per minute globally
      burstAllowance: 20, // 20 burst requests
      cooldownMs: 5000, // 5 second cooldown after limit exceeded
    },
    private defaultCapabilityConfig: RateLimitConfig = {
      windowMs: 10000, // 10 seconds
      maxRequests: 10, // 10 requests per 10 seconds per capability
      burstAllowance: 3, // 3 burst requests
      cooldownMs: 2000, // 2 second cooldown
    }
  ) {
    super();

    this.globalBucket = this.createBucket(globalConfig);
    this.startCleanupTimer();
  }

  /**
   * Create a new rate limit bucket
   */
  private createBucket(config: RateLimitConfig): RateLimitBucket {
    return {
      config,
      entries: [],
      lastReset: Date.now(),
      violationCount: 0,
      totalRequests: 0,
    };
  }

  /**
   * Check if capability execution is within rate limits
   *
   * @param capability - Capability being requested
   * @param request - Execution request
   * @param context - Current execution context
   * @returns Rate limit status and time until next allowable execution
   */
  checkRateLimit(
    capability: CapabilitySpec,
    request: ExecutionRequest,
    context: ExecutionContext
  ): RateLimitStatus {
    const now = Date.now();
    const cost = this.calculateRequestCost(capability, request, context);

    // Check global rate limit
    const globalStatus = this.checkBucketLimit(this.globalBucket, now, cost);
    if (!globalStatus.allowed) {
      this.recordViolation('global', 1);
      this.emit('rate-limit-exceeded', 'global', globalStatus);
      return globalStatus;
    }

    // Check capability-specific rate limit
    const capabilityBucket = this.getOrCreateCapabilityBucket(capability.id);
    const capabilityStatus = this.checkBucketLimit(capabilityBucket, now, cost);
    if (!capabilityStatus.allowed) {
      this.recordViolation(capability.id, 2);
      this.emit('rate-limit-exceeded', capability.id, capabilityStatus);
      return capabilityStatus;
    }

    // Check user-specific rate limit (if applicable)
    if (request.requestedBy) {
      const userBucket = this.getOrCreateUserBucket(request.requestedBy);
      const userStatus = this.checkBucketLimit(userBucket, now, cost);
      if (!userStatus.allowed) {
        this.recordViolation(`user:${request.requestedBy}`, 3);
        this.emit(
          'rate-limit-exceeded',
          `user:${request.requestedBy}`,
          userStatus
        );
        return userStatus;
      }
    }

    // All checks passed
    return {
      allowed: true,
      remaining: Math.min(
        globalStatus.remaining,
        capabilityStatus.remaining,
        request.requestedBy
          ? this.getOrCreateUserBucket(request.requestedBy).config.maxRequests
          : Infinity
      ),
      resetTime: Math.max(globalStatus.resetTime, capabilityStatus.resetTime),
    };
  }

  /**
   * Check rate limit for a specific bucket
   */
  private checkBucketLimit(
    bucket: RateLimitBucket,
    now: number,
    cost: number = 1
  ): RateLimitStatus {
    // Clean old entries
    this.cleanBucket(bucket, now);

    // Check if in cooldown period
    const timeSinceLastViolation = now - bucket.lastReset;
    if (
      bucket.violationCount > 0 &&
      timeSinceLastViolation < bucket.config.cooldownMs
    ) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: bucket.lastReset + bucket.config.cooldownMs,
        retryAfter: bucket.config.cooldownMs - timeSinceLastViolation,
        reason: 'In cooldown period after rate limit violation',
      };
    }

    // Calculate current usage
    const currentRequests = bucket.entries.length;
    const currentCost = bucket.entries.reduce(
      (sum, entry) => sum + entry.cost,
      0
    );

    // Check against base limit
    const maxRequests = bucket.config.maxRequests;
    const remaining = maxRequests - currentRequests;

    if (currentRequests >= maxRequests) {
      // Check if burst allowance can cover this request
      const burstRemaining =
        bucket.config.burstAllowance -
        Math.max(0, currentRequests - maxRequests);

      if (burstRemaining >= cost) {
        this.emit(
          'burst-allowance-used',
          bucket.config.windowMs.toString(),
          burstRemaining - cost
        );
        return {
          allowed: true,
          remaining: burstRemaining - cost,
          resetTime: now + bucket.config.windowMs,
        };
      }

      // Rate limit exceeded
      bucket.violationCount++;
      bucket.lastReset = now;

      return {
        allowed: false,
        remaining: 0,
        resetTime: now + bucket.config.windowMs,
        retryAfter: bucket.config.windowMs,
        reason: `Rate limit exceeded: ${currentRequests}/${maxRequests} requests in window`,
      };
    }

    return {
      allowed: true,
      remaining: remaining - cost,
      resetTime: now + bucket.config.windowMs,
    };
  }

  /**
   * Record capability execution for rate limit tracking
   *
   * @param capability - Executed capability
   * @param request - Execution request
   * @param timestamp - Execution timestamp
   */
  recordExecution(
    capability: CapabilitySpec,
    request: ExecutionRequest,
    timestamp: number = Date.now()
  ): void {
    const cost = this.calculateRequestCost(
      capability,
      request,
      {} as ExecutionContext
    ); // Simplified

    const entry: RateLimitEntry = {
      timestamp,
      capabilityId: capability.id,
      requestId: request.id,
      cost,
    };

    // Record in global bucket
    this.globalBucket.entries.push(entry);
    this.globalBucket.totalRequests++;

    // Record in capability bucket
    const capabilityBucket = this.getOrCreateCapabilityBucket(capability.id);
    capabilityBucket.entries.push(entry);
    capabilityBucket.totalRequests++;

    // Record in user bucket (if applicable)
    if (request.requestedBy) {
      const userBucket = this.getOrCreateUserBucket(request.requestedBy);
      userBucket.entries.push(entry);
      userBucket.totalRequests++;
    }
  }

  /**
   * Calculate cost for a request (can be overridden for different cost models)
   */
  private calculateRequestCost(
    capability: CapabilitySpec,
    request: ExecutionRequest,
    context: ExecutionContext
  ): number {
    // Base cost from capability specification
    let cost = Math.max(1, Math.floor(capability.costHint / 10));

    // Higher cost for high-risk capabilities
    if (capability.riskLevel >= 3) {
      cost *= 2;
    }

    // Higher cost during high-danger contexts
    if (context.dangerLevel > 0.7) {
      cost *= 1.5;
    }

    // Higher cost for high-priority requests
    if (request.priority > 0.8) {
      cost *= 1.2;
    }

    return Math.ceil(cost);
  }

  /**
   * Get or create capability-specific bucket
   */
  private getOrCreateCapabilityBucket(capabilityId: string): RateLimitBucket {
    if (!this.capabilityBuckets.has(capabilityId)) {
      const config =
        this.adaptiveConfigs.get(capabilityId) || this.defaultCapabilityConfig;
      this.capabilityBuckets.set(capabilityId, this.createBucket(config));
    }
    return this.capabilityBuckets.get(capabilityId)!;
  }

  /**
   * Get or create user-specific bucket
   */
  private getOrCreateUserBucket(userId: string): RateLimitBucket {
    if (!this.userBuckets.has(userId)) {
      this.userBuckets.set(
        userId,
        this.createBucket(this.defaultCapabilityConfig)
      );
    }
    return this.userBuckets.get(userId)!;
  }

  /**
   * Clean old entries from bucket
   */
  private cleanBucket(bucket: RateLimitBucket, now: number): void {
    const cutoff = now - bucket.config.windowMs;
    bucket.entries = bucket.entries.filter((entry) => entry.timestamp > cutoff);
  }

  /**
   * Record a rate limit violation
   */
  private recordViolation(identifier: string, severity: number): void {
    this.violationHistory.push({
      capabilityId: identifier,
      timestamp: Date.now(),
      severity,
    });

    // Keep only recent violations
    if (this.violationHistory.length > 1000) {
      this.violationHistory = this.violationHistory.slice(-1000);
    }

    this.emit(
      'rate-limit-violation',
      identifier,
      this.getViolationCount(identifier)
    );
  }

  /**
   * Get violation count for identifier
   */
  private getViolationCount(identifier: string): number {
    const recentCutoff = Date.now() - 300000; // 5 minutes
    return this.violationHistory.filter(
      (v) => v.capabilityId === identifier && v.timestamp > recentCutoff
    ).length;
  }

  /**
   * Implement adaptive rate limiting based on context
   *
   * @param capabilityId - Capability to adjust limits for
   * @param baseLimit - Base rate limit configuration
   * @param context - Current context that may modify limits
   * @returns Adjusted rate limit for current situation
   */
  calculateAdaptiveLimit(
    capabilityId: string,
    baseLimit: RateLimitConfig,
    context: ExecutionContext
  ): RateLimitConfig {
    let adjustedLimit = { ...baseLimit };

    // Relax limits during emergencies
    if (context.dangerLevel > 0.8 || context.agentHealth < 0.2) {
      adjustedLimit.maxRequests *= 2;
      adjustedLimit.burstAllowance *= 2;
      adjustedLimit.cooldownMs /= 2;
    }

    // Tighten limits during stable periods
    if (context.dangerLevel < 0.2 && context.agentHealth > 0.8) {
      adjustedLimit.maxRequests = Math.floor(adjustedLimit.maxRequests * 0.8);
    }

    // Adjust based on violation history
    const recentViolations = this.getViolationCount(capabilityId);
    if (recentViolations > 3) {
      adjustedLimit.maxRequests = Math.floor(adjustedLimit.maxRequests * 0.5);
      adjustedLimit.cooldownMs *= 2;
    }

    return adjustedLimit;
  }

  /**
   * Set adaptive configuration for a capability
   *
   * @param capabilityId - Capability ID
   * @param config - New configuration
   */
  setAdaptiveConfig(capabilityId: string, config: RateLimitConfig): void {
    this.adaptiveConfigs.set(capabilityId, config);

    // Update existing bucket if it exists
    if (this.capabilityBuckets.has(capabilityId)) {
      this.capabilityBuckets.get(capabilityId)!.config = config;
    }

    this.emit('adaptive-limit-changed', capabilityId, config);
  }

  /**
   * Start cleanup timer to remove old entries periodically
   */
  private startCleanupTimer(): void {
    setInterval(() => {
      const now = Date.now();

      // Clean global bucket
      this.cleanBucket(this.globalBucket, now);

      // Clean capability buckets
      for (const [id, bucket] of this.capabilityBuckets) {
        this.cleanBucket(bucket, now);

        // Remove empty buckets that haven't been used recently
        if (bucket.entries.length === 0 && now - bucket.lastReset > 300000) {
          this.capabilityBuckets.delete(id);
        }
      }

      // Clean user buckets
      for (const [id, bucket] of this.userBuckets) {
        this.cleanBucket(bucket, now);

        // Remove empty buckets that haven't been used recently
        if (bucket.entries.length === 0 && now - bucket.lastReset > 300000) {
          this.userBuckets.delete(id);
        }
      }
    }, 60000); // Clean every minute
  }

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
  } {
    const recentCutoff = Date.now() - 300000; // 5 minutes
    const recentViolations = this.violationHistory.filter(
      (v) => v.timestamp > recentCutoff
    );

    // Count violations by capability
    const violationCounts: Record<string, number> = {};
    for (const violation of recentViolations) {
      violationCounts[violation.capabilityId] =
        (violationCounts[violation.capabilityId] || 0) + 1;
    }

    const topViolated = Object.entries(violationCounts)
      .map(([capabilityId, violations]) => ({ capabilityId, violations }))
      .sort((a, b) => b.violations - a.violations)
      .slice(0, 5);

    return {
      globalRequests: this.globalBucket.entries.length,
      activeCapabilityBuckets: this.capabilityBuckets.size,
      activeUserBuckets: this.userBuckets.size,
      totalViolations: this.violationHistory.length,
      recentViolations: recentViolations.length,
      topViolatedCapabilities: topViolated,
    };
  }

  /**
   * Reset rate limits for a specific capability
   *
   * @param capabilityId - Capability to reset
   */
  resetCapabilityLimits(capabilityId: string): void {
    const bucket = this.capabilityBuckets.get(capabilityId);
    if (bucket) {
      bucket.entries = [];
      bucket.violationCount = 0;
      bucket.lastReset = Date.now();
    }
  }

  /**
   * Reset all rate limits
   */
  resetAllLimits(): void {
    this.globalBucket.entries = [];
    this.globalBucket.violationCount = 0;
    this.globalBucket.lastReset = Date.now();

    for (const bucket of this.capabilityBuckets.values()) {
      bucket.entries = [];
      bucket.violationCount = 0;
      bucket.lastReset = Date.now();
    }

    for (const bucket of this.userBuckets.values()) {
      bucket.entries = [];
      bucket.violationCount = 0;
      bucket.lastReset = Date.now();
    }

    this.violationHistory = [];
  }

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
  } {
    const bucket = this.capabilityBuckets.get(capabilityId);
    if (!bucket) {
      return {
        currentRequests: 0,
        maxRequests: this.defaultCapabilityConfig.maxRequests,
        windowMs: this.defaultCapabilityConfig.windowMs,
        violationCount: 0,
        inCooldown: false,
      };
    }

    const now = Date.now();
    this.cleanBucket(bucket, now);

    return {
      currentRequests: bucket.entries.length,
      maxRequests: bucket.config.maxRequests,
      windowMs: bucket.config.windowMs,
      violationCount: bucket.violationCount,
      inCooldown:
        bucket.violationCount > 0 &&
        now - bucket.lastReset < bucket.config.cooldownMs,
    };
  }
}
