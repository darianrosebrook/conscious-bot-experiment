/**
 * @conscious-bot/core/mcp-capabilities - Embodied action interface
 *
 * Exports all MCP Capabilities components for safe, structured Minecraft interactions
 * with constitutional oversight and performance monitoring.
 *
 * @author @darianrosebrook
 */

// Main classes
export { CapabilityRegistry } from './capability-registry';
export { ConstitutionalFilter } from './constitutional-filter';
// EnhancedRegistry is now consolidated into CapabilityRegistry
export { DynamicCreationFlow } from './dynamic-creation-flow';

// Types
export type { ImpasseResult } from './dynamic-creation-flow';
export type { RegistryStatus, ShadowRunResult } from './types';

// Leaf Contract System
export { createLeafContext } from './leaf-contracts';

// Capability specifications
export {
  ALL_CAPABILITIES,
  MOVEMENT_CAPABILITIES,
  BLOCK_CAPABILITIES,
  INVENTORY_CAPABILITIES,
  SOCIAL_CAPABILITIES,
  CAPABILITY_EXECUTORS,
  CAPABILITY_VALIDATORS,
} from './capability-specs';

// Types and interfaces
export * from './types';

// Version info
export const MCP_VERSION = '0.1.0';
