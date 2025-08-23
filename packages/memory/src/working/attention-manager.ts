/**
 * Attention management system for working memory.
 *
 * Manages cognitive focus, prioritization, and load balancing to optimize
 * working memory performance and prevent cognitive overload.
 *
 * @author @darianrosebrook
 */

import { Experience, ExperienceType } from '../types';

/**
 * Attention focus configuration
 */
export interface AttentionFocus {
  id: string;
  type: FocusType;
  priority: number; // 0-1, higher is more important
  intensity: number; // 0-1, how much attention is allocated
  duration: number; // milliseconds
  startTime: number;
  endTime?: number;
  context: any;
  metadata?: any;
}

export enum FocusType {
  GOAL = 'goal',
  TASK = 'task',
  THREAT = 'threat',
  OPPORTUNITY = 'opportunity',
  SOCIAL = 'social',
  EXPLORATION = 'exploration',
  LEARNING = 'learning',
  MAINTENANCE = 'maintenance',
}

/**
 * Attention allocation strategy
 */
export interface AttentionStrategy {
  name: string;
  description: string;
  focusDistribution: 'concentrated' | 'distributed' | 'adaptive';
  priorityWeighting: number; // 0-1, how much to weight priority vs recency
  loadThreshold: number; // 0-1, threshold for cognitive load management
  switchingCost: number; // 0-1, cost of switching attention
}

/**
 * Cognitive load metrics
 */
export interface CognitiveLoadMetrics {
  currentLoad: number; // 0-1, current cognitive load
  capacity: number; // 0-1, available capacity
  utilization: number; // 0-1, how much capacity is used
  overloadRisk: number; // 0-1, risk of cognitive overload
  focusStability: number; // 0-1, how stable current focus is
  switchingFrequency: number; // switches per minute
}

/**
 * Attention state
 */
export interface AttentionState {
  currentFocus: AttentionFocus | null;
  activeFoci: AttentionFocus[];
  cognitiveLoad: CognitiveLoadMetrics;
  attentionHistory: AttentionEvent[];
  strategy: AttentionStrategy;
  performance: AttentionPerformance;
}

/**
 * Attention event for tracking
 */
export interface AttentionEvent {
  timestamp: number;
  eventType:
    | 'focus_start'
    | 'focus_end'
    | 'focus_switch'
    | 'load_change'
    | 'overload_warning';
  focusId?: string;
  loadLevel?: number;
  description: string;
  metadata?: any;
}

/**
 * Attention performance metrics
 */
export interface AttentionPerformance {
  focusEfficiency: number; // 0-1, how efficiently attention is used
  taskCompletion: number; // 0-1, rate of task completion
  errorRate: number; // 0-1, rate of attention-related errors
  responseTime: number; // milliseconds, average response time
  distractionResistance: number; // 0-1, resistance to distractions
}

/**
 * Attention management system
 */
export class AttentionManager {
  private currentFocus: AttentionFocus | null = null;
  private activeFoci: AttentionFocus[] = [];
  private attentionHistory: AttentionEvent[] = [];
  private strategy: AttentionStrategy;
  private performanceMetrics: AttentionPerformance;
  private loadThreshold: number = 0.8;
  private maxConcurrentFoci: number = 3;

  constructor(strategy?: Partial<AttentionStrategy>) {
    this.strategy = {
      name: 'adaptive',
      description: 'Adaptive attention management with load balancing',
      focusDistribution: 'adaptive',
      priorityWeighting: 0.7,
      loadThreshold: 0.8,
      switchingCost: 0.2,
      ...strategy,
    };

    this.performanceMetrics = {
      focusEfficiency: 0.8,
      taskCompletion: 0.7,
      errorRate: 0.1,
      responseTime: 500,
      distractionResistance: 0.6,
    };
  }

  /**
   * Set attention focus on a specific target
   */
  setFocus(
    focusType: FocusType,
    priority: number,
    context: any,
    duration?: number
  ): AttentionFocus {
    // End current focus if switching
    if (this.currentFocus) {
      this.endFocus(this.currentFocus.id);
    }

    const focus: AttentionFocus = {
      id: `focus-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: focusType,
      priority,
      intensity: this.calculateFocusIntensity(priority, context),
      duration: duration || this.calculateOptimalDuration(focusType, priority),
      startTime: Date.now(),
      context,
    };

    this.currentFocus = focus;
    this.activeFoci.push(focus);

    // Limit concurrent foci
    if (this.activeFoci.length > this.maxConcurrentFoci) {
      this.activeFoci.sort((a, b) => b.priority - a.priority);
      const removedFocus = this.activeFoci.pop();
      if (removedFocus && removedFocus.id !== focus.id) {
        this.endFocus(removedFocus.id);
      }
    }

    this.logAttentionEvent(
      'focus_start',
      `Started focusing on ${focusType}`,
      focus.id,
      undefined
    );

    return focus;
  }

  /**
   * End a specific focus
   */
  endFocus(focusId: string): boolean {
    const focusIndex = this.activeFoci.findIndex((f) => f.id === focusId);
    if (focusIndex === -1) return false;

    const focus = this.activeFoci[focusIndex];
    focus.endTime = Date.now();

    this.activeFoci.splice(focusIndex, 1);

    if (this.currentFocus?.id === focusId) {
      this.currentFocus = null;
      // Switch to next highest priority focus
      if (this.activeFoci.length > 0) {
        this.activeFoci.sort((a, b) => b.priority - a.priority);
        this.currentFocus = this.activeFoci[0];
        this.logAttentionEvent(
          'focus_switch',
          `Switched to ${this.currentFocus.type}`,
          this.currentFocus.id,
          undefined
        );
      }
    }

    this.logAttentionEvent(
      'focus_end',
      `Ended focus on ${focus.type}`,
      focusId,
      undefined
    );
    return true;
  }

  /**
   * Update focus priority
   */
  updateFocusPriority(focusId: string, newPriority: number): boolean {
    const focus = this.activeFoci.find((f) => f.id === focusId);
    if (!focus) return false;

    const oldPriority = focus.priority;
    focus.priority = newPriority;
    focus.intensity = this.calculateFocusIntensity(newPriority, focus.context);

    // Re-sort active foci by priority
    this.activeFoci.sort((a, b) => b.priority - a.priority);

    // Update current focus if needed
    if (this.currentFocus?.id === focusId) {
      this.currentFocus = focus;
    } else if (this.activeFoci[0]?.id !== this.currentFocus?.id) {
      // Switch to highest priority focus
      this.currentFocus = this.activeFoci[0];
      this.logAttentionEvent(
        'focus_switch',
        `Switched to higher priority focus`,
        this.currentFocus.id,
        undefined
      );
    }

    this.logAttentionEvent(
      'focus_switch',
      `Updated priority from ${oldPriority} to ${newPriority}`,
      focusId,
      undefined
    );
    return true;
  }

  /**
   * Get current attention state
   */
  getAttentionState(): AttentionState {
    return {
      currentFocus: this.currentFocus,
      activeFoci: [...this.activeFoci],
      cognitiveLoad: this.calculateCognitiveLoad(),
      attentionHistory: [...this.attentionHistory],
      strategy: { ...this.strategy },
      performance: { ...this.performanceMetrics },
    };
  }

  /**
   * Calculate current cognitive load
   */
  calculateCognitiveLoad(): CognitiveLoadMetrics {
    const currentLoad = this.calculateCurrentLoad();
    const capacity = this.calculateCapacity();
    const utilization = currentLoad / capacity;
    const overloadRisk = Math.max(
      0,
      (utilization - this.loadThreshold) / (1 - this.loadThreshold)
    );
    const focusStability = this.calculateFocusStability();
    const switchingFrequency = this.calculateSwitchingFrequency();

    return {
      currentLoad,
      capacity,
      utilization,
      overloadRisk,
      focusStability,
      switchingFrequency,
    };
  }

  /**
   * Check if cognitive overload is imminent
   */
  isOverloadImminent(): boolean {
    const load = this.calculateCognitiveLoad();
    return load.overloadRisk > 0.7;
  }

  /**
   * Get recommendations for load management
   */
  getLoadManagementRecommendations(): string[] {
    const recommendations: string[] = [];
    const load = this.calculateCognitiveLoad();

    if (load.overloadRisk > 0.8) {
      recommendations.push(
        'Immediate action required: Reduce cognitive load by ending low-priority foci'
      );
    } else if (load.overloadRisk > 0.6) {
      recommendations.push(
        'Consider reducing focus intensity or ending non-essential tasks'
      );
    }

    if (load.switchingFrequency > 0.5) {
      recommendations.push(
        'High attention switching detected: Consider consolidating related tasks'
      );
    }

    if (load.focusStability < 0.3) {
      recommendations.push(
        'Low focus stability: Consider longer focus durations for complex tasks'
      );
    }

    return recommendations;
  }

  /**
   * Process incoming stimuli and adjust attention accordingly
   */
  processStimulus(stimulus: {
    type: string;
    priority: number;
    urgency: number;
    context: any;
  }): AttentionFocus | null {
    const currentLoad = this.calculateCognitiveLoad();

    // Check if stimulus warrants attention shift
    if (this.shouldShiftAttention(stimulus, currentLoad)) {
      const focusType = this.determineFocusType(stimulus);
      return this.setFocus(focusType, stimulus.priority, stimulus.context);
    }

    // Add to active foci if there's capacity
    if (
      this.activeFoci.length < this.maxConcurrentFoci &&
      stimulus.priority > 0.3
    ) {
      const focusType = this.determineFocusType(stimulus);
      return this.setFocus(focusType, stimulus.priority, stimulus.context);
    }

    return null;
  }

  /**
   * Optimize attention allocation based on current state
   */
  optimizeAttentionAllocation(): void {
    const load = this.calculateCognitiveLoad();

    if (load.overloadRisk > 0.7) {
      this.reduceCognitiveLoad();
    } else if (load.utilization < 0.3) {
      this.increaseFocusIntensity();
    }

    // Rebalance priorities based on strategy
    this.rebalancePriorities();
  }

  /**
   * Get attention statistics
   */
  getAttentionStats() {
    const now = Date.now();
    const recentEvents = this.attentionHistory.filter(
      (e) => now - e.timestamp < 24 * 60 * 60 * 1000 // Last 24 hours
    );

    return {
      totalFoci: this.activeFoci.length,
      currentFocusType: this.currentFocus?.type || 'none',
      averageFocusDuration: this.calculateAverageFocusDuration(),
      focusSwitches: recentEvents.filter((e) => e.eventType === 'focus_switch')
        .length,
      overloadWarnings: recentEvents.filter(
        (e) => e.eventType === 'overload_warning'
      ).length,
      loadUtilization: this.calculateCognitiveLoad().utilization,
    };
  }

  /**
   * Calculate focus intensity based on priority and context
   */
  private calculateFocusIntensity(priority: number, context: any): number {
    let intensity = priority;

    // Adjust based on context
    if (context.urgency) {
      intensity *= 1 + context.urgency * 0.3;
    }

    if (context.complexity) {
      intensity *= 1 + context.complexity * 0.2;
    }

    // Apply strategy adjustments
    if (this.strategy.focusDistribution === 'concentrated') {
      intensity *= 1.2;
    } else if (this.strategy.focusDistribution === 'distributed') {
      intensity *= 0.8;
    }

    return Math.min(1, Math.max(0, intensity));
  }

  /**
   * Calculate optimal focus duration
   */
  private calculateOptimalDuration(
    focusType: FocusType,
    priority: number
  ): number {
    const baseDuration = 5 * 60 * 1000; // 5 minutes base

    switch (focusType) {
      case FocusType.GOAL:
        return baseDuration * 3; // 15 minutes for goals
      case FocusType.TASK:
        return baseDuration * 2; // 10 minutes for tasks
      case FocusType.THREAT:
        return baseDuration * 0.5; // 2.5 minutes for threats
      case FocusType.OPPORTUNITY:
        return baseDuration * 1.5; // 7.5 minutes for opportunities
      case FocusType.SOCIAL:
        return baseDuration * 2; // 10 minutes for social interactions
      case FocusType.EXPLORATION:
        return baseDuration * 1.5; // 7.5 minutes for exploration
      case FocusType.LEARNING:
        return baseDuration * 2.5; // 12.5 minutes for learning
      case FocusType.MAINTENANCE:
        return baseDuration; // 5 minutes for maintenance
      default:
        return baseDuration;
    }
  }

  /**
   * Get current cognitive load
   */
  getCurrentLoad(): number {
    return this.calculateCurrentLoad();
  }

  /**
   * Calculate current cognitive load
   */
  private calculateCurrentLoad(): number {
    let load = 0;

    // Base load from active foci
    for (const focus of this.activeFoci) {
      load += focus.intensity * focus.priority;
    }

    // Additional load from switching
    const recentSwitches = this.attentionHistory.filter(
      (e) =>
        e.eventType === 'focus_switch' &&
        Date.now() - e.timestamp < 5 * 60 * 1000 // Last 5 minutes
    );
    load += recentSwitches.length * this.strategy.switchingCost;

    return Math.min(1, load);
  }

  /**
   * Calculate available capacity
   */
  private calculateCapacity(): number {
    // Base capacity can be modified by factors like fatigue, stress, etc.
    let capacity = 1.0;

    // Reduce capacity based on number of active foci
    capacity -= this.activeFoci.length * 0.1;

    // Reduce capacity based on focus duration (mental fatigue)
    if (this.currentFocus) {
      const focusDuration = Date.now() - this.currentFocus.startTime;
      const fatigueFactor = Math.min(0.3, focusDuration / (30 * 60 * 1000)); // Max 30% reduction after 30 minutes
      capacity -= fatigueFactor;
    }

    return Math.max(0.3, capacity); // Minimum 30% capacity
  }

  /**
   * Calculate focus stability
   */
  private calculateFocusStability(): number {
    if (!this.currentFocus) return 0;

    const focusDuration = Date.now() - this.currentFocus.startTime;
    const optimalDuration = this.calculateOptimalDuration(
      this.currentFocus.type,
      this.currentFocus.priority
    );

    // Stability increases with duration up to optimal, then decreases
    if (focusDuration <= optimalDuration) {
      return Math.min(1, focusDuration / optimalDuration);
    } else {
      return Math.max(
        0,
        1 - (focusDuration - optimalDuration) / optimalDuration
      );
    }
  }

  /**
   * Calculate attention switching frequency
   */
  private calculateSwitchingFrequency(): number {
    const now = Date.now();
    const recentSwitches = this.attentionHistory.filter(
      (e) =>
        e.eventType === 'focus_switch' && now - e.timestamp < 10 * 60 * 1000 // Last 10 minutes
    );

    return Math.min(1, recentSwitches.length / 5); // Normalize to 0-1, 5 switches = max frequency
  }

  /**
   * Determine if attention should shift to new stimulus
   */
  private shouldShiftAttention(
    stimulus: any,
    currentLoad: CognitiveLoadMetrics
  ): boolean {
    // High urgency stimuli always get attention
    if (stimulus.urgency > 0.8) return true;

    // High priority stimuli get attention if load allows
    if (stimulus.priority > 0.7 && currentLoad.utilization < 0.8) return true;

    // Current focus is low priority and new stimulus is higher
    if (
      this.currentFocus &&
      this.currentFocus.priority < stimulus.priority &&
      stimulus.priority > 0.5
    )
      return true;

    return false;
  }

  /**
   * Determine focus type from stimulus
   */
  private determineFocusType(stimulus: any): FocusType {
    if (stimulus.type.includes('goal') || stimulus.type.includes('objective')) {
      return FocusType.GOAL;
    } else if (
      stimulus.type.includes('task') ||
      stimulus.type.includes('action')
    ) {
      return FocusType.TASK;
    } else if (
      stimulus.type.includes('threat') ||
      stimulus.type.includes('danger')
    ) {
      return FocusType.THREAT;
    } else if (
      stimulus.type.includes('opportunity') ||
      stimulus.type.includes('chance')
    ) {
      return FocusType.OPPORTUNITY;
    } else if (
      stimulus.type.includes('social') ||
      stimulus.type.includes('interaction')
    ) {
      return FocusType.SOCIAL;
    } else if (
      stimulus.type.includes('explore') ||
      stimulus.type.includes('discover')
    ) {
      return FocusType.EXPLORATION;
    } else if (
      stimulus.type.includes('learn') ||
      stimulus.type.includes('skill')
    ) {
      return FocusType.LEARNING;
    } else {
      return FocusType.MAINTENANCE;
    }
  }

  /**
   * Reduce cognitive load by ending low-priority foci
   */
  private reduceCognitiveLoad(): void {
    // Sort foci by priority (lowest first)
    this.activeFoci.sort((a, b) => a.priority - b.priority);

    // End lowest priority foci until load is manageable
    while (
      this.calculateCognitiveLoad().overloadRisk > 0.5 &&
      this.activeFoci.length > 1
    ) {
      const lowestFocus = this.activeFoci[0];
      this.endFocus(lowestFocus.id);
    }

    this.logAttentionEvent(
      'load_change',
      'Reduced cognitive load',
      undefined,
      this.calculateCurrentLoad()
    );
  }

  /**
   * Increase focus intensity on current focus
   */
  private increaseFocusIntensity(): void {
    if (this.currentFocus) {
      this.currentFocus.intensity = Math.min(
        1,
        this.currentFocus.intensity * 1.2
      );
    }
  }

  /**
   * Rebalance priorities based on strategy
   */
  private rebalancePriorities(): void {
    if (this.strategy.focusDistribution === 'adaptive') {
      // Adjust priorities based on time and performance
      for (const focus of this.activeFoci) {
        const age = Date.now() - focus.startTime;
        const optimalDuration = this.calculateOptimalDuration(
          focus.type,
          focus.priority
        );

        // Reduce priority of old foci
        if (age > optimalDuration) {
          focus.priority *= 0.9;
        }
      }
    }
  }

  /**
   * Calculate average focus duration
   */
  private calculateAverageFocusDuration(): number {
    const endedFoci = this.attentionHistory
      .filter((e) => e.eventType === 'focus_end')
      .map((e) => e.timestamp);

    if (endedFoci.length === 0) return 0;

    // This is a simplified calculation - in a real implementation,
    // you'd track actual focus durations
    return 5 * 60 * 1000; // Default 5 minutes
  }

  /**
   * Log attention event
   */
  private logAttentionEvent(
    eventType: AttentionEvent['eventType'],
    description: string,
    focusId?: string,
    loadLevel?: number
  ): void {
    const event: AttentionEvent = {
      timestamp: Date.now(),
      eventType,
      focusId,
      loadLevel,
      description,
    };

    this.attentionHistory.push(event);

    // Keep history manageable
    if (this.attentionHistory.length > 1000) {
      this.attentionHistory = this.attentionHistory.slice(-500);
    }

    // Log overload warnings
    if (
      eventType === 'load_change' &&
      loadLevel &&
      loadLevel > this.loadThreshold
    ) {
      this.logAttentionEvent(
        'overload_warning',
        'Cognitive overload detected',
        undefined,
        loadLevel
      );
    }
  }
}
