/**
 * Rate Limiter - Usage Controls for Actions and Resource Access
 * 
 * Implements rate limiting for various agent actions and resource usage
 * @author @darianrosebrook
 */

import { EventEmitter } from 'eventemitter3';
import {
  RateLimitConfig,
  UsageStatistics,
  RateLimitResult,
  validateRateLimitConfig,
  validateUsageStatistics,
  validateRateLimitResult,
} from './types';

/**
 * Sliding Window Rate Limiter implementation
 */
class SlidingWindowLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly timestamps: number[];

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.timestamps = [];
  }

  /**
   * Check if action is within rate limit
   */
  checkLimit(): boolean {
    this.cleanOldTimestamps();
    return this.timestamps.length < this.limit;
  }

  /**
   * Record an action (if within limit)
   */
  recordAction(): boolean {
    if (this.checkLimit()) {
      this.timestamps.push(Date.now());
      return true;
    }
    return false;
  }

  /**
   * Get current usage count
   */
  getCurrentUsage(): number {
    this.cleanOldTimestamps();
    return this.timestamps.length;
  }

  /**
   * Get remaining quota
   */
  getRemainingQuota(): number {
    return Math.max(0, this.limit - this.getCurrentUsage());
  }

  /**
   * Get time until window resets
   */
  getTimeUntilReset(): number {
    this.cleanOldTimestamps();
    if (this.timestamps.length === 0) {
      return 0;
    }
    
    const oldestTimestamp = this.timestamps[0];
    const resetTime = oldestTimestamp + this.windowMs;
    return Math.max(0, resetTime - Date.now());
  }

  /**
   * Reset the limiter
   */
  reset(): void {
    this.timestamps.length = 0;
  }

  private cleanOldTimestamps(): void {
    const cutoff = Date.now() - this.windowMs;
    let removeCount = 0;
    
    for (const timestamp of this.timestamps) {
      if (timestamp >= cutoff) {
        break;
      }
      removeCount++;
    }
    
    if (removeCount > 0) {
      this.timestamps.splice(0, removeCount);
    }
  }
}

/**
 * Token Bucket Rate Limiter for burst allowance
 */
class TokenBucketLimiter {
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per millisecond
  private tokens: number;
  private lastRefill: number;

  constructor(capacity: number, refillRatePerSecond: number) {
    this.capacity = capacity;
    this.refillRate = refillRatePerSecond / 1000; // Convert to per millisecond
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Check if action is within rate limit
   */
  checkLimit(): boolean {
    this.refillTokens();
    return this.tokens >= 1;
  }

  /**
   * Consume a token (if available)
   */
  consumeToken(): boolean {
    this.refillTokens();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * Get current token count
   */
  getTokenCount(): number {
    this.refillTokens();
    return Math.floor(this.tokens);
  }

  /**
   * Get time until next token is available
   */
  getTimeUntilToken(): number {
    this.refillTokens();
    if (this.tokens >= 1) {
      return 0;
    }
    return Math.ceil((1 - this.tokens) / this.refillRate);
  }

  private refillTokens(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const tokensToAdd = timePassed * this.refillRate;
    
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

/**
 * Action tracker for specific actor and action type
 */
class ActionTracker {
  private readonly config: RateLimitConfig;
  private readonly slidingWindow: SlidingWindowLimiter;
  private readonly tokenBucket?: TokenBucketLimiter;
  private lastActionTime: number = 0;
  private totalActions: number = 0;

  constructor(config: RateLimitConfig) {
    this.config = validateRateLimitConfig(config);
    this.slidingWindow = new SlidingWindowLimiter(config.limit, config.windowMs);
    
    if (config.burstAllowance) {
      // Use token bucket for burst allowance
      const refillRate = config.limit / (config.windowMs / 1000); // per second
      this.tokenBucket = new TokenBucketLimiter(config.burstAllowance, refillRate);
    }
  }

  /**
   * Check if action is within rate limits
   */
  checkRateLimit(): RateLimitResult {
    const now = Date.now();
    
    // Check cooldown if configured
    if (this.config.cooldownMs && (now - this.lastActionTime) < this.config.cooldownMs) {
      return {
        allowed: false,
        remainingQuota: this.slidingWindow.getRemainingQuota(),
        resetTime: this.lastActionTime + this.config.cooldownMs,
        retryAfter: this.config.cooldownMs - (now - this.lastActionTime),
        reason: 'Cooldown period active',
      };
    }

    // Check token bucket first (for burst allowance)
    if (this.tokenBucket && !this.tokenBucket.checkLimit()) {
      return {
        allowed: false,
        remainingQuota: this.tokenBucket.getTokenCount(),
        resetTime: now + this.tokenBucket.getTimeUntilToken(),
        retryAfter: this.tokenBucket.getTimeUntilToken(),
        reason: 'Burst allowance exceeded',
      };
    }

    // Check sliding window
    if (!this.slidingWindow.checkLimit()) {
      return {
        allowed: false,
        remainingQuota: this.slidingWindow.getRemainingQuota(),
        resetTime: now + this.slidingWindow.getTimeUntilReset(),
        retryAfter: this.slidingWindow.getTimeUntilReset(),
        reason: 'Rate limit exceeded',
      };
    }

    return {
      allowed: true,
      remainingQuota: this.slidingWindow.getRemainingQuota(),
      resetTime: now + this.slidingWindow.getTimeUntilReset(),
      reason: 'Within rate limits',
    };
  }

  /**
   * Record an action
   */
  recordAction(): boolean {
    const limitCheck = this.checkRateLimit();
    if (!limitCheck.allowed) {
      return false;
    }

    // Record in both limiters
    const slidingWindowSuccess = this.slidingWindow.recordAction();
    const tokenBucketSuccess = this.tokenBucket ? this.tokenBucket.consumeToken() : true;

    if (slidingWindowSuccess && tokenBucketSuccess) {
      this.lastActionTime = Date.now();
      this.totalActions++;
      return true;
    }

    return false;
  }

  /**
   * Get current usage statistics
   */
  getUsageStatistics(): UsageStatistics {
    const now = Date.now();
    return {
      actionType: this.config.actionType,
      actor: '', // Set by caller
      currentCount: this.slidingWindow.getCurrentUsage(),
      windowStart: now - this.config.windowMs,
      remainingQuota: this.slidingWindow.getRemainingQuota(),
      nextResetTime: now + this.slidingWindow.getTimeUntilReset(),
    };
  }

  /**
   * Reset the tracker
   */
  reset(): void {
    this.slidingWindow.reset();
    this.tokenBucket?.getTokenCount(); // Trigger refill
    this.totalActions = 0;
  }

  /**
   * Get total actions recorded
   */
  getTotalActions(): number {
    return this.totalActions;
  }
}

/**
 * Adaptive Rate Limiter that adjusts based on system conditions
 */
class AdaptiveRateLimiter {
  private readonly baseConfig: RateLimitConfig;
  private currentMultiplier: number = 1.0;
  private systemLoadHistory: number[] = [];
  private readonly maxHistorySize = 10;

  constructor(baseConfig: RateLimitConfig) {
    this.baseConfig = baseConfig;
  }

  /**
   * Adjust rate limits based on system load
   */
  adjustLimits(systemLoad: number): RateLimitConfig {
    this.systemLoadHistory.push(systemLoad);
    
    if (this.systemLoadHistory.length > this.maxHistorySize) {
      this.systemLoadHistory.shift();
    }

    const averageLoad = this.systemLoadHistory.reduce((a, b) => a + b, 0) / this.systemLoadHistory.length;
    
    // Adjust multiplier based on system load
    if (averageLoad > 0.8) {
      this.currentMultiplier = Math.max(0.5, this.currentMultiplier - 0.1);
    } else if (averageLoad < 0.4) {
      this.currentMultiplier = Math.min(2.0, this.currentMultiplier + 0.1);
    }

    return {
      ...this.baseConfig,
      limit: Math.floor(this.baseConfig.limit * this.currentMultiplier),
      burstAllowance: this.baseConfig.burstAllowance ? 
        Math.floor(this.baseConfig.burstAllowance * this.currentMultiplier) : undefined,
    };
  }

  /**
   * Get current multiplier
   */
  getCurrentMultiplier(): number {
    return this.currentMultiplier;
  }

  /**
   * Reset adaptive adjustments
   */
  reset(): void {
    this.currentMultiplier = 1.0;
    this.systemLoadHistory = [];
  }
}

/**
 * Rate Limit Violation Handler
 */
class RateLimitViolationHandler extends EventEmitter {
  private violationCounts: Map<string, number>;
  private readonly violationThreshold: number;

  constructor(violationThreshold: number = 5) {
    super();
    this.violationCounts = new Map();
    this.violationThreshold = violationThreshold;
  }

  /**
   * Record a rate limit violation
   */
  recordViolation(actor: string, actionType: string, violation: RateLimitResult): void {
    const violationKey = `${actor}_${actionType}`;
    const currentCount = this.violationCounts.get(violationKey) || 0;
    const newCount = currentCount + 1;
    
    this.violationCounts.set(violationKey, newCount);

    const violationData = {
      actor,
      actionType,
      violationCount: newCount,
      violation,
      timestamp: Date.now(),
      severity: newCount >= this.violationThreshold ? 'high' : 'low',
    };

    this.emit('rate-limit-violation', violationData);

    // Escalate if threshold exceeded
    if (newCount >= this.violationThreshold) {
      this.emit('violation-threshold-exceeded', violationData);
    }
  }

  /**
   * Get violation count for actor and action type
   */
  getViolationCount(actor: string, actionType: string): number {
    const violationKey = `${actor}_${actionType}`;
    return this.violationCounts.get(violationKey) || 0;
  }

  /**
   * Reset violation count for actor
   */
  resetViolations(actor: string, actionType?: string): void {
    if (actionType) {
      const violationKey = `${actor}_${actionType}`;
      this.violationCounts.delete(violationKey);
    } else {
      // Reset all violations for actor
      for (const key of this.violationCounts.keys()) {
        if (key.startsWith(`${actor}_`)) {
          this.violationCounts.delete(key);
        }
      }
    }
  }
}

/**
 * Main Rate Limiter class
 */
export class RateLimiter extends EventEmitter {
  private actionTrackers: Map<string, Map<string, ActionTracker>>; // actor -> actionType -> tracker
  private limitPolicies: Map<string, RateLimitConfig>;
  private violationHandler: RateLimitViolationHandler;
  private adaptiveLimiters: Map<string, AdaptiveRateLimiter>;

  constructor() {
    super();
    this.actionTrackers = new Map();
    this.limitPolicies = new Map();
    this.violationHandler = new RateLimitViolationHandler();
    this.adaptiveLimiters = new Map();

    this.setupEventHandlers();
    this.loadDefaultPolicies();
  }

  /**
   * Configure rate limit for action type
   */
  configureLimits(actionType: string, config: RateLimitConfig): void {
    const validatedConfig = validateRateLimitConfig(config);
    this.limitPolicies.set(actionType, validatedConfig);

    if (validatedConfig.adaptive) {
      this.adaptiveLimiters.set(actionType, new AdaptiveRateLimiter(validatedConfig));
    }

    this.emit('rate-limit-configured', {
      actionType,
      config: validatedConfig,
      timestamp: Date.now(),
    });
  }

  /**
   * Check if action is within rate limits
   */
  checkRateLimit(actionType: string, actor: string): RateLimitResult {
    const tracker = this.getOrCreateTracker(actor, actionType);
    const result = tracker.checkRateLimit();
    
    return validateRateLimitResult(result);
  }

  /**
   * Record action for rate limit tracking
   */
  recordAction(actionType: string, actor: string, context: Record<string, any> = {}): boolean {
    const tracker = this.getOrCreateTracker(actor, actionType);
    const success = tracker.recordAction();

    if (!success) {
      // Record violation
      const limitResult = this.checkRateLimit(actionType, actor);
      this.violationHandler.recordViolation(actor, actionType, limitResult);
    }

    this.emit('action-recorded', {
      actionType,
      actor,
      success,
      context,
      timestamp: Date.now(),
    });

    return success;
  }

  /**
   * Get current usage statistics for actor and action type
   */
  getCurrentUsage(actionType: string, actor: string): UsageStatistics {
    const tracker = this.getOrCreateTracker(actor, actionType);
    const stats = tracker.getUsageStatistics();
    stats.actor = actor;
    
    return validateUsageStatistics(stats);
  }

  /**
   * Dynamically adjust limits based on server conditions
   */
  adjustLimitsBasedOnContext(context: {
    systemLoad?: number;
    playerCount?: number;
    serverPerformance?: number;
  }): {
    adjustedLimits: number;
    totalLimits: number;
  } {
    let adjustedLimits = 0;
    const totalLimits = this.adaptiveLimiters.size;

    for (const [actionType, adaptiveLimiter] of this.adaptiveLimiters.entries()) {
      if (context.systemLoad !== undefined) {
        const adjustedConfig = adaptiveLimiter.adjustLimits(context.systemLoad);
        this.limitPolicies.set(actionType, adjustedConfig);
        adjustedLimits++;

        this.emit('rate-limit-adjusted', {
          actionType,
          adjustedConfig,
          systemLoad: context.systemLoad,
          multiplier: adaptiveLimiter.getCurrentMultiplier(),
          timestamp: Date.now(),
        });
      }
    }

    return { adjustedLimits, totalLimits };
  }

  /**
   * Get comprehensive rate limit statistics
   */
  getRateLimitStatistics(): {
    actionTypes: string[];
    totalActions: number;
    violations: number;
    activeActors: number;
    averageUsage: Record<string, number>;
  } {
    const stats = {
      actionTypes: Array.from(this.limitPolicies.keys()),
      totalActions: 0,
      violations: 0,
      activeActors: new Set<string>(),
      averageUsage: {} as Record<string, number>,
    };

    for (const [actor, actionTrackers] of this.actionTrackers.entries()) {
      stats.activeActors.add(actor);
      
      for (const [actionType, tracker] of actionTrackers.entries()) {
        stats.totalActions += tracker.getTotalActions();
        
        if (!stats.averageUsage[actionType]) {
          stats.averageUsage[actionType] = 0;
        }
        stats.averageUsage[actionType] += tracker.getUsageStatistics().currentCount;
      }
    }

    // Calculate averages
    for (const actionType of stats.actionTypes) {
      if (stats.averageUsage[actionType]) {
        stats.averageUsage[actionType] /= stats.activeActors.size;
      }
    }

    return {
      ...stats,
      activeActors: stats.activeActors.size,
    };
  }

  /**
   * Reset rate limits for actor
   */
  resetActor(actor: string, actionType?: string): void {
    const actorTrackers = this.actionTrackers.get(actor);
    if (!actorTrackers) {
      return;
    }

    if (actionType) {
      const tracker = actorTrackers.get(actionType);
      if (tracker) {
        tracker.reset();
      }
    } else {
      for (const tracker of actorTrackers.values()) {
        tracker.reset();
      }
    }

    this.violationHandler.resetViolations(actor, actionType);

    this.emit('rate-limit-reset', {
      actor,
      actionType: actionType || 'all',
      timestamp: Date.now(),
    });
  }

  /**
   * Remove all data for actor (for privacy compliance)
   */
  removeActor(actor: string): boolean {
    const removed = this.actionTrackers.delete(actor);
    this.violationHandler.resetViolations(actor);

    if (removed) {
      this.emit('actor-removed', {
        actor,
        timestamp: Date.now(),
      });
    }

    return removed;
  }

  private getOrCreateTracker(actor: string, actionType: string): ActionTracker {
    if (!this.actionTrackers.has(actor)) {
      this.actionTrackers.set(actor, new Map());
    }

    const actorTrackers = this.actionTrackers.get(actor)!;
    
    if (!actorTrackers.has(actionType)) {
      const config = this.limitPolicies.get(actionType) || this.getDefaultConfig(actionType);
      actorTrackers.set(actionType, new ActionTracker(config));
    }

    return actorTrackers.get(actionType)!;
  }

  private getDefaultConfig(actionType: string): RateLimitConfig {
    // Provide sensible defaults based on action type
    const baseConfig: RateLimitConfig = {
      actionType,
      limit: 100,
      windowMs: 60 * 1000, // 1 minute
      adaptive: false,
    };

    if (actionType.includes('chat') || actionType.includes('communication')) {
      return { ...baseConfig, limit: 10, cooldownMs: 3000 };
    }
    if (actionType.includes('block') || actionType.includes('build')) {
      return { ...baseConfig, limit: 100, burstAllowance: 20 };
    }
    if (actionType.includes('mine') || actionType.includes('resource')) {
      return { ...baseConfig, limit: 200, windowMs: 5 * 60 * 1000, adaptive: true };
    }

    return baseConfig;
  }

  private loadDefaultPolicies(): void {
    const defaultPolicies: RateLimitConfig[] = [
      {
        actionType: 'block_placement',
        limit: 100,
        windowMs: 60 * 1000,
        burstAllowance: 20,
        adaptive: false,
      },
      {
        actionType: 'block_destruction',
        limit: 150,
        windowMs: 60 * 1000,
        burstAllowance: 30,
        adaptive: false,
      },
      {
        actionType: 'chat_messages',
        limit: 10,
        windowMs: 60 * 1000,
        cooldownMs: 3000,
        adaptive: false,
      },
      {
        actionType: 'mining_actions',
        limit: 200,
        windowMs: 5 * 60 * 1000,
        adaptive: true,
      },
    ];

    for (const policy of defaultPolicies) {
      this.configureLimits(policy.actionType, policy);
    }
  }

  private setupEventHandlers(): void {
    this.violationHandler.on('rate-limit-violation', (violation) => {
      this.emit('violation-detected', violation);
    });

    this.violationHandler.on('violation-threshold-exceeded', (violation) => {
      this.emit('violation-threshold-exceeded', violation);
    });
  }
}
