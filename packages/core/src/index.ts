/**
 * @conscious-bot/core - Foundational signal-driven control architecture
 *
 * Exports all core components for building cognitive agents with
 * real-time constraints and signal-driven behavior.
 *
 * @author @darianrosebrook
 */

// Main classes
export { Arbiter, ReflexModule } from './arbiter';
export { SignalProcessor } from './signal-processor';
export { PerformanceMonitor, TrackingSession } from './performance-monitor';

// MCP Capabilities
export { CapabilityRegistry, ConstitutionalFilter } from './mcp-capabilities';
export { CapabilityRateLimiter } from './mcp-capabilities/rate-limiter';

// Real-Time Performance Monitoring
export {
  PerformanceTracker,
  BudgetEnforcer,
  DegradationManager,
  AlertingSystem,
} from './real-time';

// Types and interfaces
export * from './types';
export * from './mcp-capabilities/types';
export * from './real-time/types';

// Cognitive module interface
export type { CognitiveModule } from './arbiter';

// Configuration defaults
export { DEFAULT_ARBITER_CONFIG } from './arbiter';
export { DEFAULT_SIGNAL_CONFIG } from './signal-processor';
export { DEFAULT_PERFORMANCE_CONFIG } from './performance-monitor';

// Version info
export const VERSION = '0.1.0';
