/**
 * Emergency Response and Safe Mode Management
 *
 * Coordinates emergency responses and manages safe mode operation
 * @author @darianrosebrook
 */

import { EventEmitter } from 'eventemitter3';
import {
  EmergencyType,
  EmergencySeverity,
  EmergencyDeclaration,
  EmergencyProtocol,
  NotificationChannel,
  SafeModeConfig,
  SafeModeValidation,
  SafeModeEvent,
  SafeModeSeverity,
  validateEmergencyDeclaration,
  validateSafeModeConfig,
} from './types';

/**
 * Emergency notification manager
 */
class EmergencyNotificationManager {
  private channels: Map<string, NotificationChannel>;
  private notificationHistory: Array<{
    emergencyId: string;
    channelId: string;
    timestamp: number;
    success: boolean;
    retryCount: number;
    error?: string;
  }>;

  constructor() {
    this.channels = new Map();
    this.notificationHistory = [];
  }

  /**
   * Register notification channel
   */
  registerChannel(channel: NotificationChannel): void {
    this.channels.set(channel.channelId, channel);
  }

  /**
   * Remove notification channel
   */
  removeChannel(channelId: string): boolean {
    return this.channels.delete(channelId);
  }

  /**
   * Send emergency notification
   */
  async sendNotification(
    emergency: EmergencyDeclaration,
    message: string
  ): Promise<{
    sent: number;
    failed: number;
    channels: Array<{ channelId: string; success: boolean; error?: string }>;
  }> {
    const results: Array<{
      channelId: string;
      success: boolean;
      error?: string;
    }> = [];
    let sent = 0;
    let failed = 0;

    for (const [channelId, channel] of this.channels.entries()) {
      if (!channel.enabled) {
        continue;
      }

      // Check severity filter
      if (
        channel.severityFilter &&
        !channel.severityFilter.includes(emergency.severity)
      ) {
        continue;
      }

      const result = await this.sendToChannel(channel, emergency, message);
      results.push({ channelId, ...result });

      if (result.success) {
        sent++;
      } else {
        failed++;
      }

      // Record in history
      this.notificationHistory.push({
        emergencyId: emergency.emergencyId,
        channelId,
        timestamp: Date.now(),
        success: result.success,
        retryCount: 0,
        error: result.error,
      });
    }

    // Keep only last 1000 notifications
    if (this.notificationHistory.length > 1000) {
      this.notificationHistory.splice(
        0,
        this.notificationHistory.length - 1000
      );
    }

    return { sent, failed, channels: results };
  }

  private async sendToChannel(
    channel: NotificationChannel,
    emergency: EmergencyDeclaration,
    message: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      switch (channel.type) {
        case 'console':
          console.error(`[EMERGENCY] ${emergency.type}: ${message}`);
          return { success: true };

        case 'webhook':
          if (!channel.endpoint) {
            return {
              success: false,
              error: 'No endpoint configured for webhook',
            };
          }

          // In a real implementation, this would make an HTTP request
          // For now, simulate the notification
          await new Promise((resolve) => setTimeout(resolve, 100));
          return { success: true };

        case 'email':
          // In a real implementation, this would send an email
          await new Promise((resolve) => setTimeout(resolve, 200));
          return { success: true };

        case 'dashboard':
          // In a real implementation, this would update a dashboard
          return { success: true };

        default:
          return {
            success: false,
            error: `Unknown channel type: ${channel.type}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get notification statistics
   */
  getNotificationStatistics(): {
    totalNotifications: number;
    successRate: number;
    channelStats: Record<string, { sent: number; failed: number }>;
  } {
    const channelStats: Record<string, { sent: number; failed: number }> = {};
    let totalNotifications = 0;
    let successfulNotifications = 0;

    for (const notification of this.notificationHistory) {
      totalNotifications++;

      if (notification.success) {
        successfulNotifications++;
      }

      if (!channelStats[notification.channelId]) {
        channelStats[notification.channelId] = { sent: 0, failed: 0 };
      }

      if (notification.success) {
        channelStats[notification.channelId].sent++;
      } else {
        channelStats[notification.channelId].failed++;
      }
    }

    return {
      totalNotifications,
      successRate:
        totalNotifications > 0
          ? successfulNotifications / totalNotifications
          : 0,
      channelStats,
    };
  }
}

/**
 * Safe Mode Manager
 */
class SafeModeManager extends EventEmitter {
  private config: SafeModeConfig;
  private isActive = false;
  private enteredAt?: number;
  private triggerReason?: string;
  private blockedActions: Array<{
    actionId: string;
    actionType: string;
    timestamp: number;
    reason: string;
  }>;
  private pendingApprovals: Map<
    string,
    {
      actionId: string;
      actionType: string;
      timestamp: number;
      timeout: NodeJS.Timeout;
    }
  >;

  constructor(config: SafeModeConfig) {
    super();
    this.config = validateSafeModeConfig(config);
    this.blockedActions = [];
    this.pendingApprovals = new Map();
  }

  /**
   * Enter safe mode
   */
  enterSafeMode(reason: string, severity?: SafeModeSeverity): void {
    if (this.isActive) {
      return;
    }

    this.isActive = true;
    this.enteredAt = Date.now();
    this.triggerReason = reason;

    if (severity) {
      this.config.severity = severity;
    }

    const event: SafeModeEvent = {
      eventId: `safe_mode_enter_${Date.now()}`,
      type: 'enter',
      timestamp: Date.now(),
      severity: this.config.severity,
      triggerReason: reason,
    };

    this.emit('safe-mode-entered', {
      event,
      config: this.config,
    });

    // Set auto-exit timeout if configured
    if (this.config.timeoutMs) {
      setTimeout(() => {
        if (this.isActive) {
          this.attemptSafeModeExit(['timeout_reached']);
        }
      }, this.config.timeoutMs);
    }
  }

  /**
   * Exit safe mode
   */
  exitSafeMode(reason: string = 'manual_exit'): boolean {
    if (!this.isActive) {
      return false;
    }

    this.isActive = false;
    const duration = this.enteredAt ? Date.now() - this.enteredAt : 0;

    const event: SafeModeEvent = {
      eventId: `safe_mode_exit_${Date.now()}`,
      type: 'exit',
      timestamp: Date.now(),
      severity: this.config.severity,
      triggerReason: reason,
    };

    this.emit('safe-mode-exited', {
      event,
      duration,
      blockedActions: this.blockedActions.length,
    });

    // Clear state
    this.enteredAt = undefined;
    this.triggerReason = undefined;
    this.blockedActions = [];

    // Cancel pending approvals
    for (const [, approval] of this.pendingApprovals.entries()) {
      clearTimeout(approval.timeout);
    }
    this.pendingApprovals.clear();

    return true;
  }

  /**
   * Validate action in safe mode
   */
  validateAction(
    actionId: string,
    actionType: string,
    context: Record<string, any> = {}
  ): SafeModeValidation {
    if (!this.isActive) {
      return {
        actionId,
        actionType,
        allowed: true,
        reason: 'Safe mode not active',
        requiresApproval: false,
        restrictions: [],
        validatedAt: Date.now(),
      };
    }

    // Check forbidden actions
    if (this.config.forbiddenActions.includes(actionType)) {
      const validation: SafeModeValidation = {
        actionId,
        actionType,
        allowed: false,
        reason: 'Action is explicitly forbidden in safe mode',
        requiresApproval: false,
        restrictions: ['forbidden_action'],
        validatedAt: Date.now(),
      };

      this.recordBlockedAction(actionId, actionType, validation.reason);
      return validation;
    }

    // Check allowed actions
    if (
      this.config.allowedActions.length > 0 &&
      !this.config.allowedActions.includes(actionType)
    ) {
      const validation: SafeModeValidation = {
        actionId,
        actionType,
        allowed: false,
        reason: 'Action not in allowed list for safe mode',
        requiresApproval: false,
        restrictions: ['not_in_allowlist'],
        validatedAt: Date.now(),
      };

      this.recordBlockedAction(actionId, actionType, validation.reason);
      return validation;
    }

    // Check movement restrictions
    const restrictions: string[] = [];
    if (this.config.maxMovementDistance && actionType.includes('move')) {
      const distance = context.distance as number;
      if (distance && distance > this.config.maxMovementDistance) {
        restrictions.push(
          `movement_limited_to_${this.config.maxMovementDistance}`
        );
      }
    }

    // Check if human approval is required
    const requiresApproval =
      this.config.requireHumanApproval || this.isRiskyAction(actionType);

    return {
      actionId,
      actionType,
      allowed: !requiresApproval, // If approval required, action is not immediately allowed
      reason: requiresApproval
        ? 'Human approval required'
        : 'Action permitted in safe mode',
      requiresApproval,
      restrictions,
      validatedAt: Date.now(),
    };
  }

  /**
   * Request human approval for action
   */
  requestApproval(
    actionId: string,
    actionType: string,
    timeoutMs: number = 60000
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingApprovals.delete(actionId);
        resolve(false);
      }, timeoutMs);

      this.pendingApprovals.set(actionId, {
        actionId,
        actionType,
        timestamp: Date.now(),
        timeout,
      });

      const event: SafeModeEvent = {
        eventId: `approval_request_${Date.now()}`,
        type: 'approval_requested',
        timestamp: Date.now(),
        severity: this.config.severity,
        triggerReason: 'Human approval required',
        actionContext: { actionId, actionType },
      };

      this.emit('approval-requested', {
        event,
        actionId,
        actionType,
        resolve, // Allow external approval
      });
    });
  }

  /**
   * Provide human approval
   */
  provideApproval(actionId: string, approved: boolean): boolean {
    const pending = this.pendingApprovals.get(actionId);
    if (!pending) {
      return false;
    }

    clearTimeout(pending.timeout);
    this.pendingApprovals.delete(actionId);

    this.emit('approval-provided', {
      actionId,
      approved,
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Attempt to exit safe mode based on conditions
   */
  attemptSafeModeExit(conditions: string[]): boolean {
    if (!this.isActive) {
      return false;
    }

    // Check if any auto-exit conditions are met
    const metConditions = conditions.filter((condition) =>
      this.config.autoExitConditions.includes(condition)
    );

    if (metConditions.length > 0) {
      this.exitSafeMode(`auto_exit: ${metConditions.join(', ')}`);
      return true;
    }

    return false;
  }

  /**
   * Update safe mode configuration
   */
  updateConfig(newConfig: Partial<SafeModeConfig>): void {
    this.config = validateSafeModeConfig({ ...this.config, ...newConfig });

    this.emit('safe-mode-config-updated', {
      config: this.config,
      timestamp: Date.now(),
    });
  }

  /**
   * Get current safe mode status
   */
  getStatus(): {
    active: boolean;
    severity: SafeModeSeverity;
    enteredAt?: number;
    duration?: number;
    triggerReason?: string;
    blockedActionsCount: number;
    pendingApprovalsCount: number;
  } {
    return {
      active: this.isActive,
      severity: this.config.severity,
      enteredAt: this.enteredAt,
      duration: this.enteredAt ? Date.now() - this.enteredAt : undefined,
      triggerReason: this.triggerReason,
      blockedActionsCount: this.blockedActions.length,
      pendingApprovalsCount: this.pendingApprovals.size,
    };
  }

  private recordBlockedAction(
    actionId: string,
    actionType: string,
    reason: string
  ): void {
    this.blockedActions.push({
      actionId,
      actionType,
      timestamp: Date.now(),
      reason,
    });

    // Keep only last 1000 blocked actions
    if (this.blockedActions.length > 1000) {
      this.blockedActions.splice(0, this.blockedActions.length - 1000);
    }

    const event: SafeModeEvent = {
      eventId: `action_blocked_${Date.now()}`,
      type: 'action_blocked',
      timestamp: Date.now(),
      severity: this.config.severity,
      triggerReason: reason,
      actionContext: { actionId, actionType },
    };

    this.emit('action-blocked', { event, actionId, actionType, reason });
  }

  private isRiskyAction(actionType: string): boolean {
    const riskyActions = [
      'attack',
      'destroy',
      'place_explosive',
      'drop_item',
      'give_item',
      'execute_command',
    ];

    return riskyActions.some((risky) => actionType.includes(risky));
  }
}

/**
 * Emergency Response Coordinator
 */
export class EmergencyResponseCoordinator extends EventEmitter {
  private protocols: Map<string, EmergencyProtocol>;
  private activeEmergencies: Map<string, EmergencyDeclaration>;
  private emergencyHistory: EmergencyDeclaration[];
  private notificationManager: EmergencyNotificationManager;
  private safeModeManager: SafeModeManager;
  private escalationTimers: Map<string, NodeJS.Timeout>;

  constructor(safeModeConfig: SafeModeConfig) {
    super();
    this.protocols = new Map();
    this.activeEmergencies = new Map();
    this.emergencyHistory = [];
    this.notificationManager = new EmergencyNotificationManager();
    this.safeModeManager = new SafeModeManager(safeModeConfig);
    this.escalationTimers = new Map();

    this.setupEventHandlers();
    this.loadDefaultProtocols();
  }

  /**
   * Register emergency protocol
   */
  registerProtocol(protocol: EmergencyProtocol): void {
    const protocolKey = `${protocol.emergencyType}_${protocol.severity}`;
    this.protocols.set(protocolKey, protocol);
  }

  /**
   * Register notification channel
   */
  registerNotificationChannel(channel: NotificationChannel): void {
    this.notificationManager.registerChannel(channel);
  }

  /**
   * Declare emergency
   */
  async declareEmergency(
    type: EmergencyType,
    severity: EmergencySeverity,
    description: string,
    context: Record<string, any> = {},
    declaredBy: string = 'system'
  ): Promise<EmergencyDeclaration> {
    const emergency: EmergencyDeclaration = {
      emergencyId: `emergency_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      severity,
      declaredAt: Date.now(),
      declaredBy,
      description,
      context,
      resolved: false,
    };

    const validatedEmergency = validateEmergencyDeclaration(emergency);

    this.activeEmergencies.set(
      validatedEmergency.emergencyId,
      validatedEmergency
    );
    this.emergencyHistory.push(validatedEmergency);

    // Execute emergency protocol
    await this.executeEmergencyProtocol(validatedEmergency);

    this.emit('emergency-declared', validatedEmergency);

    return validatedEmergency;
  }

  /**
   * Resolve emergency
   */
  resolveEmergency(
    emergencyId: string,
    resolution: string = 'manual_resolution'
  ): boolean {
    const emergency = this.activeEmergencies.get(emergencyId);
    if (!emergency) {
      return false;
    }

    emergency.resolved = true;
    emergency.resolvedAt = Date.now();
    this.activeEmergencies.delete(emergencyId);

    // Cancel escalation timer
    const escalationTimer = this.escalationTimers.get(emergencyId);
    if (escalationTimer) {
      clearTimeout(escalationTimer);
      this.escalationTimers.delete(emergencyId);
    }

    this.emit('emergency-resolved', {
      emergency,
      resolution,
      duration: emergency.resolvedAt - emergency.declaredAt,
    });

    // Check if safe mode can be exited
    if (this.safeModeManager.getStatus().active) {
      this.safeModeManager.attemptSafeModeExit(['emergency_resolved']);
    }

    return true;
  }

  /**
   * Get safe mode manager
   */
  getSafeModeManager(): SafeModeManager {
    return this.safeModeManager;
  }

  /**
   * Get active emergencies
   */
  getActiveEmergencies(): EmergencyDeclaration[] {
    return Array.from(this.activeEmergencies.values());
  }

  /**
   * Get emergency statistics
   */
  getEmergencyStatistics(): {
    totalEmergencies: number;
    activeEmergencies: number;
    emergenciesByType: Record<EmergencyType, number>;
    emergenciesBySeverity: Record<EmergencySeverity, number>;
    averageResolutionTime: number;
    resolutionRate: number;
  } {
    const emergenciesByType: Record<EmergencyType, number> = {
      [EmergencyType.SYSTEM_FAILURE]: 0,
      [EmergencyType.SAFETY_VIOLATION]: 0,
      [EmergencyType.ENVIRONMENTAL_THREAT]: 0,
      [EmergencyType.PERFORMANCE_FAILURE]: 0,
      [EmergencyType.SECURITY_INCIDENT]: 0,
      [EmergencyType.RESOURCE_EXHAUSTION]: 0,
    };

    const emergenciesBySeverity: Record<EmergencySeverity, number> = {
      [EmergencySeverity.LOW]: 0,
      [EmergencySeverity.MEDIUM]: 0,
      [EmergencySeverity.HIGH]: 0,
      [EmergencySeverity.CRITICAL]: 0,
    };

    let totalResolutionTime = 0;
    let resolvedCount = 0;

    for (const emergency of this.emergencyHistory) {
      emergenciesByType[emergency.type]++;
      emergenciesBySeverity[emergency.severity]++;

      if (emergency.resolved && emergency.resolvedAt) {
        totalResolutionTime += emergency.resolvedAt - emergency.declaredAt;
        resolvedCount++;
      }
    }

    return {
      totalEmergencies: this.emergencyHistory.length,
      activeEmergencies: this.activeEmergencies.size,
      emergenciesByType,
      emergenciesBySeverity,
      averageResolutionTime:
        resolvedCount > 0 ? totalResolutionTime / resolvedCount : 0,
      resolutionRate:
        this.emergencyHistory.length > 0
          ? resolvedCount / this.emergencyHistory.length
          : 0,
    };
  }

  private async executeEmergencyProtocol(
    emergency: EmergencyDeclaration
  ): Promise<void> {
    const protocolKey = `${emergency.type}_${emergency.severity}`;
    const protocol = this.protocols.get(protocolKey);

    if (!protocol) {
      // Use default protocol
      await this.executeDefaultProtocol(emergency);
      return;
    }

    // Execute immediate actions
    for (const action of protocol.immediateActions) {
      await this.executeEmergencyAction(action, emergency);
    }

    // Send notifications
    const message = `Emergency: ${emergency.type} (${emergency.severity}) - ${emergency.description}`;
    await this.notificationManager.sendNotification(emergency, message);

    // Set escalation timer
    if (protocol.escalationTimeoutMs > 0) {
      const escalationTimer = setTimeout(() => {
        this.escalateEmergency(emergency);
      }, protocol.escalationTimeoutMs);

      this.escalationTimers.set(emergency.emergencyId, escalationTimer);
    }
  }

  private async executeDefaultProtocol(
    emergency: EmergencyDeclaration
  ): Promise<void> {
    // Default actions based on severity
    switch (emergency.severity) {
      case EmergencySeverity.CRITICAL:
        await this.executeEmergencyAction('enter_safe_mode', emergency);
        await this.executeEmergencyAction('notify_humans', emergency);
        break;
      case EmergencySeverity.HIGH:
        await this.executeEmergencyAction('increase_monitoring', emergency);
        await this.executeEmergencyAction('notify_humans', emergency);
        break;
      case EmergencySeverity.MEDIUM:
        await this.executeEmergencyAction('log_incident', emergency);
        break;
      case EmergencySeverity.LOW:
        await this.executeEmergencyAction('log_incident', emergency);
        break;
    }
  }

  private async executeEmergencyAction(
    action: string,
    emergency: EmergencyDeclaration
  ): Promise<void> {
    switch (action) {
      case 'enter_safe_mode':
        this.safeModeManager.enterSafeMode(
          `Emergency: ${emergency.type}`,
          this.getSafeModeSevrityForEmergency(emergency.severity)
        );
        break;

      case 'notify_humans': {
        const message = `EMERGENCY: ${emergency.type} (${emergency.severity}) - ${emergency.description}`;
        await this.notificationManager.sendNotification(emergency, message);
        break;
      }

      case 'increase_monitoring':
        this.emit('monitoring-increase-requested', {
          reason: emergency.type,
          severity: emergency.severity,
        });
        break;

      case 'log_incident':
        this.emit('incident-logged', {
          emergency,
          timestamp: Date.now(),
        });
        break;

      case 'halt_current_action':
        this.emit('halt-all-actions', {
          reason: 'Emergency declared',
          emergency,
        });
        break;

      default:
        console.warn(`Unknown emergency action: ${action}`);
    }
  }

  private getSafeModeSevrityForEmergency(
    severity: EmergencySeverity
  ): SafeModeSeverity {
    switch (severity) {
      case EmergencySeverity.CRITICAL:
        return SafeModeSeverity.LOCKDOWN;
      case EmergencySeverity.HIGH:
        return SafeModeSeverity.STRICT;
      case EmergencySeverity.MEDIUM:
        return SafeModeSeverity.MODERATE;
      case EmergencySeverity.LOW:
        return SafeModeSeverity.MINIMAL;
    }
  }

  private escalateEmergency(emergency: EmergencyDeclaration): void {
    this.emit('emergency-escalated', {
      emergency,
      escalatedAt: Date.now(),
    });

    // Auto-escalate severity if not already at maximum
    if (emergency.severity !== EmergencySeverity.CRITICAL) {
      const newSeverity = this.getNextSeverityLevel(emergency.severity);
      emergency.severity = newSeverity;

      // Re-execute protocol with higher severity
      this.executeEmergencyProtocol(emergency);
    }
  }

  private getNextSeverityLevel(current: EmergencySeverity): EmergencySeverity {
    switch (current) {
      case EmergencySeverity.LOW:
        return EmergencySeverity.MEDIUM;
      case EmergencySeverity.MEDIUM:
        return EmergencySeverity.HIGH;
      case EmergencySeverity.HIGH:
        return EmergencySeverity.CRITICAL;
      case EmergencySeverity.CRITICAL:
        return EmergencySeverity.CRITICAL;
    }
  }

  private loadDefaultProtocols(): void {
    // Load some default emergency protocols
    const defaultProtocols: EmergencyProtocol[] = [
      {
        protocolId: 'system_failure_critical',
        emergencyType: EmergencyType.SYSTEM_FAILURE,
        severity: EmergencySeverity.CRITICAL,
        immediateActions: [
          'enter_safe_mode',
          'halt_current_action',
          'notify_humans',
        ],
        notificationTargets: ['console', 'webhook'],
        escalationTimeoutMs: 30000, // 30 seconds
        requiredApprovals: ['system_admin'],
        rollbackActions: ['restore_last_known_good_state', 'restart_system'],
      },
      {
        protocolId: 'safety_violation_high',
        emergencyType: EmergencyType.SAFETY_VIOLATION,
        severity: EmergencySeverity.HIGH,
        immediateActions: [
          'halt_current_action',
          'enter_safe_mode',
          'log_incident',
        ],
        notificationTargets: ['console', 'webhook'],
        escalationTimeoutMs: 60000, // 1 minute
        requiredApprovals: ['safety_officer'],
        rollbackActions: ['halt_current_action', 'log_incident'],
      },
    ];

    for (const protocol of defaultProtocols) {
      this.registerProtocol(protocol);
    }
  }

  private setupEventHandlers(): void {
    this.safeModeManager.on('safe-mode-entered', (event) => {
      this.emit('safe-mode-entered', event);
    });

    this.safeModeManager.on('safe-mode-exited', (event) => {
      this.emit('safe-mode-exited', event);
    });

    this.safeModeManager.on('action-blocked', (event) => {
      this.emit('action-blocked', event);
    });

    this.safeModeManager.on('approval-requested', (event) => {
      this.emit('approval-requested', event);
    });
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    // Clear escalation timers
    for (const timer of this.escalationTimers.values()) {
      clearTimeout(timer);
    }
    this.escalationTimers.clear();

    this.removeAllListeners();
  }
}
