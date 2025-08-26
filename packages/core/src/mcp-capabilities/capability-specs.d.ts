/**
 * Capability Specifications - Predefined Minecraft action capabilities
 *
 * Defines all available Minecraft actions as structured capabilities with
 * preconditions, effects, safety constraints, and execution metadata.
 *
 * @author @darianrosebrook
 */
import { CapabilitySpec, CapabilityExecutor, CapabilityValidator } from './types';
export declare const MOVEMENT_CAPABILITIES: CapabilitySpec[];
export declare const BLOCK_CAPABILITIES: CapabilitySpec[];
export declare const INVENTORY_CAPABILITIES: CapabilitySpec[];
export declare const SOCIAL_CAPABILITIES: CapabilitySpec[];
export declare const ALL_CAPABILITIES: CapabilitySpec[];
export declare const CAPABILITY_EXECUTORS: Record<string, CapabilityExecutor>;
export declare const CAPABILITY_VALIDATORS: Record<string, CapabilityValidator>;
//# sourceMappingURL=capability-specs.d.ts.map