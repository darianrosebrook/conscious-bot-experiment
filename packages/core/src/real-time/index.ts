/**
 * @conscious-bot/core/real-time - Real-time performance monitoring
 *
 * Exports all real-time performance monitoring components for maintaining
 * responsive, predictable behavior under strict timing constraints.
 *
 * @author @darianrosebrook
 */

// Main classes
export { PerformanceTracker } from './performance-tracker';
export { BudgetEnforcer } from './budget-enforcer';
export { DegradationManager } from './degradation-manager';
export { AlertingSystem } from './alerting-system';

// Types and interfaces
export * from './types';

// Version info
export const REALTIME_VERSION = '0.1.0';
