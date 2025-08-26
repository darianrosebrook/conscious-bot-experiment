/**
 * Leaf Contract System - Core types for primitive Mineflayer operations
 *
 * Defines the strict contracts for leaves (primitive operations) that touch Mineflayer,
 * ensuring safety, validation, and consistent execution patterns.
 *
 * @author @darianrosebrook
 */
import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import Ajv from 'ajv';
/**
 * Centralized error codes for all Mineflayer/world failures
 * Maps specific exceptions to deterministic codes for planner repair
 */
export type ExecErrorCode = 'path.stuck' | 'path.unreachable' | 'path.unloaded' | 'dig.blockChanged' | 'dig.toolInvalid' | 'dig.timeout' | 'place.invalidFace' | 'place.fallRisk' | 'place.timeout' | 'craft.missingInput' | 'craft.uiTimeout' | 'craft.containerBusy' | 'sense.apiError' | 'movement.timeout' | 'movement.collision' | 'inventory.full' | 'inventory.missingItem' | 'world.unloaded' | 'world.invalidPosition' | 'permission.denied' | 'aborted' | 'unknown';
/**
 * Execution error with deterministic error code
 */
export interface ExecError {
    code: ExecErrorCode;
    retryable: boolean;
    detail?: string;
}
/**
 * Status returned by leaf execution
 */
export type LeafStatus = 'success' | 'failure' | 'running';
/**
 * Context provided to leaf implementations
 */
export interface LeafContext {
    bot: Bot;
    abortSignal: AbortSignal;
    now(): number;
    snapshot(): Promise<WorldSnapshot>;
    inventory(): Promise<InventoryState>;
    emitMetric(name: string, value: number, tags?: Record<string, string>): void;
    emitError(error: ExecError): void;
}
/**
 * World snapshot for leaf context
 */
export interface WorldSnapshot {
    position: Vec3;
    biome: string;
    time: number;
    lightLevel: number;
    nearbyHostiles: Entity[];
    weather: string;
    inventory: InventoryState;
    toolDurability: Record<string, number>;
    waypoints: Vec3[];
}
/**
 * Inventory state for leaf context
 */
export interface InventoryState {
    items: InventoryItem[];
    selectedSlot: number;
    totalSlots: number;
    freeSlots: number;
}
/**
 * Inventory item representation
 */
export interface InventoryItem {
    name: string;
    count: number;
    slot: number;
    metadata?: Record<string, any>;
}
/**
 * Entity information for hostiles
 */
export interface Entity {
    id: number;
    type: string;
    position: Vec3;
    distance: number;
}
/**
 * Enhanced leaf specification with safety features (S1.1)
 */
export interface LeafSpec {
    name: string;
    version: string;
    description?: string;
    inputSchema: JSONSchema7;
    outputSchema?: JSONSchema7;
    postconditions?: JSONSchema7;
    timeoutMs: number;
    retries: number;
    permissions: LeafPermission[];
    rateLimitPerMin?: number;
    maxConcurrent?: number;
}
/**
 * Leaf permissions for safety enforcement (finer-grained)
 */
export type LeafPermission = 'movement' | 'dig' | 'place' | 'craft' | 'sense' | 'container.read' | 'container.write' | 'chat';
/**
 * Leaf run options with idempotency support
 */
export interface LeafRunOptions {
    idempotencyKey?: string;
    priority?: number;
    traceId?: string;
}
/**
 * Enhanced leaf implementation with safety features
 */
export interface LeafImpl {
    spec: LeafSpec;
    run(ctx: LeafContext, args: unknown, opts?: LeafRunOptions): Promise<LeafResult>;
    cancel?(): void;
    validatePostconditions?(ctx: LeafContext, result: LeafResult): Promise<boolean>;
}
/**
 * Enhanced result with error taxonomy
 */
export interface LeafResult {
    status: LeafStatus;
    result?: unknown;
    error?: ExecError;
    metrics?: LeafMetrics;
    postconditions?: unknown;
}
/**
 * Metrics emitted by leaf execution
 */
export interface LeafMetrics {
    durationMs: number;
    retries: number;
    timeouts: number;
    resourceUsage?: Record<string, number>;
    errorCount?: Record<ExecErrorCode, number>;
}
/**
 * Registration result for leaf factory
 */
export interface RegistrationResult {
    ok: boolean;
    id?: string;
    error?: string;
    detail?: string;
}
/**
 * Simplified JSON Schema 7 type for validation
 */
export interface JSONSchema7 {
    type?: string;
    properties?: Record<string, JSONSchema7>;
    required?: string[];
    minimum?: number;
    maximum?: number;
    default?: any;
    enum?: any[];
    items?: JSONSchema7;
    additionalProperties?: boolean;
    [key: string]: any;
}
/**
 * Validate a leaf specification with enhanced checks
 */
export declare function validateLeafSpec(spec: LeafSpec): void;
/**
 * Validate leaf implementation
 */
export declare function validateLeafImpl(impl: LeafImpl): void;
/**
 * Map Mineflayer exceptions to deterministic error codes
 */
export declare function mapExceptionToErrorCode(error: unknown): ExecErrorCode;
/**
 * Check if an error code is retryable
 */
export declare function isRetryableError(code: ExecErrorCode): boolean;
/**
 * Create an ExecError from an exception
 */
export declare function createExecError(error: unknown): ExecError;
/**
 * Create a basic leaf context with enhanced safety
 */
export declare function createLeafContext(bot: Bot, abortSignal?: AbortSignal): LeafContext;
/**
 * Check if a leaf has a specific permission
 */
export declare function hasPermission(leaf: LeafImpl, permission: LeafPermission): boolean;
/**
 * Check if a leaf has any of the specified permissions
 */
export declare function hasAnyPermission(leaf: LeafImpl, permissions: LeafPermission[]): boolean;
/**
 * Check if a leaf has all of the specified permissions
 */
export declare function hasAllPermissions(leaf: LeafImpl, permissions: LeafPermission[]): boolean;
/**
 * Get the intersection of permissions from multiple leaves (C1)
 */
export declare function getPermissionIntersection(leaves: LeafImpl[]): LeafPermission[];
/**
 * Postcondition verifier helper (thin but useful)
 */
export declare function verifyPostconditions(postSchema: JSONSchema7 | undefined, before: {
    inventory: InventoryState;
    snapshot: WorldSnapshot;
}, after: {
    inventory: InventoryState;
    snapshot: WorldSnapshot;
}, ajv: Ajv): Promise<{
    ok: boolean;
    detail?: string;
}>;
//# sourceMappingURL=leaf-contracts.d.ts.map