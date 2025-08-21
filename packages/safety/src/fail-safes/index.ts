/**
 * Fail-Safes Module - Comprehensive Safety and Recovery Systems
 *
 * @author @darianrosebrook
 */

// Main Fail-Safes System
export { FailSafesSystem } from './fail-safes-system';

// Core Components
export { WatchdogManager } from './watchdog-manager';
export { PreemptionManager } from './preemption-manager';
export { EmergencyResponseCoordinator } from './emergency-response';

// Types and Interfaces
export * from './types';

// Version info
export const FAIL_SAFES_MODULE_VERSION = '1.0.0';
