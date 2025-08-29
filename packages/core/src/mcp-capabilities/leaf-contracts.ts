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
import { performance } from 'node:perf_hooks';
import Ajv from 'ajv';

// ============================================================================
// Error Taxonomy (C3)
// ============================================================================

/**
 * Centralized error codes for all Mineflayer/world failures
 * Maps specific exceptions to deterministic codes for planner repair
 */
export type ExecErrorCode =
  | 'path.stuck'
  | 'path.unreachable'
  | 'path.unloaded'
  | 'dig.blockChanged'
  | 'dig.toolInvalid'
  | 'dig.timeout'
  | 'place.invalidFace'
  | 'place.fallRisk'
  | 'place.timeout'
  | 'craft.missingInput'
  | 'craft.uiTimeout'
  | 'craft.containerBusy'
  | 'sense.apiError'
  | 'movement.timeout'
  | 'movement.collision'
  | 'inventory.full'
  | 'inventory.missingItem'
  | 'world.unloaded'
  | 'world.invalidPosition'
  | 'permission.denied'
  | 'invalid_input'
  | 'invalid_output'
  | 'postcondition_failed'
  | 'aborted'
  | 'unknown';

/**
 * Execution error with deterministic error code
 */
export interface ExecError {
  code: ExecErrorCode;
  retryable: boolean;
  detail?: string;
}

// ============================================================================
// Core Types
// ============================================================================

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
  name: string; // unique identifier
  version: string; // semver version
  description?: string; // human-readable description
  inputSchema: JSONSchema7; // args contract validation
  outputSchema?: JSONSchema7; // optional result validation
  postconditions?: JSONSchema7; // inventory/world delta promises (S1.1)
  timeoutMs: number; // hard execution timeout
  retries: number; // bounded retry attempts
  permissions: LeafPermission[]; // required permissions
  rateLimitPerMin?: number; // default 60 (S1.1)
  maxConcurrent?: number; // default 1 (S1.1)
}

/**
 * Leaf permissions for safety enforcement (finer-grained)
 */
export type LeafPermission =
  | 'movement' // Can move the bot
  | 'dig' // Can break blocks
  | 'place' // Can place blocks
  | 'craft' // Can craft items
  | 'sense' // Can sense world state
  | 'container.read' // Can read containers
  | 'container.write' // Can write to containers
  | 'chat'; // Can send chat messages

/**
 * Leaf run options with idempotency support
 */
export interface LeafRunOptions {
  idempotencyKey?: string; // dedupe accidental repeats (S1.1)
  priority?: number; // execution priority
  traceId?: string; // for distributed tracing
}

/**
 * Enhanced leaf implementation with safety features
 */
export interface LeafImpl {
  spec: LeafSpec;
  run(
    ctx: LeafContext,
    args: unknown,
    opts?: LeafRunOptions
  ): Promise<LeafResult>;
  cancel?(): void; // Optional cancellation support
  validatePostconditions?(
    ctx: LeafContext,
    result: LeafResult
  ): Promise<boolean>; // S1.1
}

/**
 * Enhanced result with error taxonomy
 */
export interface LeafResult {
  status: LeafStatus;
  result?: unknown;
  error?: ExecError; // structured error
  metrics?: LeafMetrics;
  postconditions?: unknown; // S1.1: verified postconditions
}

/**
 * Metrics emitted by leaf execution
 */
export interface LeafMetrics {
  durationMs: number; // monotonic
  retries: number;
  timeouts: number;
  resourceUsage?: Record<string, number>;
  errorCount?: Record<ExecErrorCode, number>; // Track error types
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

// ============================================================================
// JSON Schema Types (simplified for TypeScript)
// ============================================================================

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

// ============================================================================
// Helper Functions (No Recursion)
// ============================================================================

/**
 * Read inventory state without creating nested contexts
 */
async function readInventory(bot: Bot): Promise<InventoryState> {
  const items = bot.inventory.items().map((item) => ({
    name: item.name,
    count: item.count,
    slot: item.slot, // true slot index
    metadata: { metadata: item.metadata },
  }));

  return {
    items,
    selectedSlot: Math.max(0, bot.quickBarSlot ?? 0),
    totalSlots: bot.inventory.slots.length,
    freeSlots: bot.inventory.emptySlotCount(),
  };
}

/**
 * Predicate to identify hostile entities
 */
function hostilePredicate(e: any): boolean {
  // tune this list; Mineflayer entity types vary by version
  const hostileNames = new Set([
    'zombie',
    'skeleton',
    'creeper',
    'spider',
    'witch',
    'enderman',
    'husk',
    'drowned',
    'pillager',
  ]);
  return e && hostileNames.has(e.name || e.type);
}

/**
 * Calculate distance between two Vec3 positions
 */
function dist(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x,
    dy = a.y - b.y,
    dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate a leaf specification with enhanced checks
 */
export function validateLeafSpec(spec: LeafSpec): void {
  if (!spec.name || typeof spec.name !== 'string') {
    throw new Error('Leaf spec must have a valid name');
  }

  if (!spec.version || typeof spec.version !== 'string') {
    throw new Error('Leaf spec must have a valid version');
  }

  if (!spec.inputSchema || typeof spec.inputSchema !== 'object') {
    throw new Error('Leaf spec must have a valid inputSchema');
  }

  if (spec.timeoutMs <= 0) {
    throw new Error('Leaf spec must have a positive timeoutMs');
  }

  if (spec.retries < 0) {
    throw new Error('Leaf spec must have non-negative retries');
  }

  if (!Array.isArray(spec.permissions) || spec.permissions.length === 0) {
    throw new Error('Leaf spec must have at least one permission');
  }

  // Validate permission values
  const validPermissions: LeafPermission[] = [
    'movement',
    'dig',
    'place',
    'craft',
    'sense',
    'container.read',
    'container.write',
    'chat',
  ];
  for (const permission of spec.permissions) {
    if (!validPermissions.includes(permission)) {
      throw new Error(`Invalid permission: ${permission}`);
    }
  }

  // Validate rate limits and concurrency
  if (spec.rateLimitPerMin !== undefined && spec.rateLimitPerMin <= 0) {
    throw new Error('rateLimitPerMin must be positive');
  }

  if (spec.maxConcurrent !== undefined && spec.maxConcurrent <= 0) {
    throw new Error('maxConcurrent must be positive');
  }
}

/**
 * Validate leaf implementation
 */
export function validateLeafImpl(impl: LeafImpl): void {
  if (!impl.spec) {
    throw new Error('Leaf implementation must have a spec');
  }

  if (typeof impl.run !== 'function') {
    throw new Error('Leaf implementation must have a run function');
  }

  validateLeafSpec(impl.spec);
}

// ============================================================================
// Error Mapping Functions
// ============================================================================

/**
 * Map Mineflayer exceptions to deterministic error codes
 */
export function mapExceptionToErrorCode(error: unknown): ExecErrorCode {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Pathfinding errors
    if (message.includes('no path') || message.includes('unreachable')) {
      return 'path.unreachable';
    }
    if (message.includes('stuck') || message.includes('blocked')) {
      return 'path.stuck';
    }
    if (message.includes('unloaded') || message.includes('chunk')) {
      return 'path.unloaded';
    }

    // Digging errors
    if (
      message.includes('block changed') ||
      message.includes('already broken')
    ) {
      return 'dig.blockChanged';
    }
    if (message.includes('tool') || message.includes('pickaxe')) {
      return 'dig.toolInvalid';
    }
    if (message.includes('timeout') && message.includes('dig')) {
      return 'dig.timeout';
    }

    // Placement errors
    if (message.includes('invalid face') || message.includes('cannot place')) {
      return 'place.invalidFace';
    }
    if (message.includes('fall') || message.includes('void')) {
      return 'place.fallRisk';
    }
    if (message.includes('timeout') && message.includes('place')) {
      return 'place.timeout';
    }

    // Crafting errors
    if (message.includes('missing') || message.includes('not found')) {
      return 'craft.missingInput';
    }
    if (message.includes('ui') || message.includes('interface')) {
      return 'craft.uiTimeout';
    }
    if (message.includes('container') || message.includes('chest')) {
      return 'craft.containerBusy';
    }

    // Movement errors
    if (message.includes('timeout') && message.includes('move')) {
      return 'movement.timeout';
    }
    if (message.includes('collision') || message.includes('blocked')) {
      return 'movement.collision';
    }

    // Inventory errors
    if (message.includes('full') || message.includes('no space')) {
      return 'inventory.full';
    }
    if (message.includes('missing') || message.includes('not found')) {
      return 'inventory.missingItem';
    }

    // World errors
    if (message.includes('unloaded') || message.includes('chunk')) {
      return 'world.unloaded';
    }
    if (
      message.includes('invalid position') ||
      message.includes('out of bounds')
    ) {
      return 'world.invalidPosition';
    }

    // Permission errors
    if (message.includes('permission') || message.includes('denied')) {
      return 'permission.denied';
    }

    // Abort errors
    if (message.includes('abort') || message.includes('cancel')) {
      return 'aborted';
    }
  }

  return 'unknown';
}

/**
 * Check if an error code is retryable
 */
export function isRetryableError(code: ExecErrorCode): boolean {
  const retryableCodes: ExecErrorCode[] = [
    'path.stuck',
    'dig.timeout',
    'place.timeout',
    'craft.uiTimeout',
    'movement.timeout',
    'sense.apiError',
    'permission.denied', // Rate limiting is retryable
  ];

  return retryableCodes.includes(code);
}

/**
 * Create an ExecError from an exception
 */
export function createExecError(error: unknown): ExecError {
  const code = mapExceptionToErrorCode(error);
  return {
    code,
    detail: error instanceof Error ? error.message : String(error),
    retryable: isRetryableError(code),
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a basic leaf context with enhanced safety
 */
export function createLeafContext(
  bot: Bot,
  abortSignal?: AbortSignal
): LeafContext {
  const signal = abortSignal ?? new AbortController().signal;

  return {
    bot,
    abortSignal: signal,
    now: () => performance.now(),

    snapshot: async (): Promise<WorldSnapshot> => {
      const position = bot.entity?.position ?? new Vec3(0, 64, 0);

      // biome: guard object→string
      let biomeName = 'unknown';
      try {
        const biome = await (bot.world as any).getBiome?.(position);
        biomeName =
          typeof biome === 'string' ? biome : (biome?.name ?? 'unknown');
      } catch {
        /* noop */
      }

      // light
      let lightLevel = 15;
      try {
        lightLevel = (bot.world as any).getLight?.(position) ?? 15;
      } catch {
        /* noop */
      }

      // weather
      const weather =
        (bot as any).isThundering && (bot as any).isThundering()
          ? 'thunder'
          : (bot as any).isRaining && (bot as any).isRaining()
            ? 'rain'
            : 'clear';

      // hostiles (bounded radius)
      const me = position;
      const hostiles = Object.values(bot.entities ?? {})
        .filter(hostilePredicate)
        .map((e: any) => ({
          id: e.id,
          type: e.name ?? e.type ?? 'unknown',
          position: e.position,
          distance: dist(me, e.position),
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 16); // cap

      return {
        position,
        biome: biomeName,
        time: bot.time?.timeOfDay ?? 0,
        lightLevel,
        nearbyHostiles: hostiles as Entity[],
        weather,
        inventory: await readInventory(bot),
        toolDurability: {}, // optional: fill from item NBT if needed
        waypoints: [], // filled by your waypoint subsystem
      };
    },

    inventory: async (): Promise<InventoryState> => readInventory(bot),

    emitMetric: (
      name: string,
      value: number,
      tags?: Record<string, string>
    ) => {
      // Replace with your telemetry bus; keep since this is critical in early bring-up
      // e.g., metrics.emit({ name, value, tags, ts: Date.now() })
      // console.log is fine for first iteration but gate behind NODE_ENV
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.log(`METRIC ${name}=${value}`, tags);
      }
    },

    emitError: (error: ExecError) => {
      // TODO: Implement error emission
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.log(`ERROR: ${error.code} - ${error.detail}`, {
          retryable: error.retryable,
        });
      }
    },
  };
}

/**
 * Check if a leaf has a specific permission
 */
export function hasPermission(
  leaf: LeafImpl,
  permission: LeafPermission
): boolean {
  return leaf.spec.permissions.includes(permission);
}

/**
 * Check if a leaf has any of the specified permissions
 */
export function hasAnyPermission(
  leaf: LeafImpl,
  permissions: LeafPermission[]
): boolean {
  return permissions.some((permission) => hasPermission(leaf, permission));
}

/**
 * Check if a leaf has all of the specified permissions
 */
export function hasAllPermissions(
  leaf: LeafImpl,
  permissions: LeafPermission[]
): boolean {
  return permissions.every((permission) => hasPermission(leaf, permission));
}

/**
 * Get the intersection of permissions from multiple leaves (C1)
 */
export function getPermissionIntersection(
  leaves: LeafImpl[]
): LeafPermission[] {
  if (leaves.length === 0) return [];

  const allPermissions = leaves.map((leaf) => leaf.spec.permissions);
  const intersection = allPermissions.reduce((acc, permissions) =>
    acc.filter((permission) => permissions.includes(permission))
  );

  return intersection;
}

/**
 * Postcondition verifier helper (thin but useful)
 */
export async function verifyPostconditions(
  postSchema: JSONSchema7 | undefined,
  before: { inventory: InventoryState; snapshot: WorldSnapshot },
  after: { inventory: InventoryState; snapshot: WorldSnapshot },
  ajv: Ajv
): Promise<{ ok: boolean; detail?: string }> {
  if (!postSchema) return { ok: true };

  // Example: compute inventory diff and inject into a context the schema checks
  const diff: Record<string, number> = {};
  const countByName = (inv: InventoryState) =>
    inv.items.reduce<Record<string, number>>(
      (acc, it) => ((acc[it.name] = (acc[it.name] ?? 0) + it.count), acc),
      {}
    );
  const b = countByName(before.inventory);
  const a = countByName(after.inventory);
  const names = new Set([...Object.keys(b), ...Object.keys(a)]);
  for (const n of names) diff[n] = (a[n] ?? 0) - (b[n] ?? 0);

  const validate = ajv.compile(postSchema);
  const ok = validate({ diff, after: after.snapshot, before: before.snapshot });
  return ok
    ? { ok: true }
    : { ok: false, detail: ajv.errorsText(validate.errors) };
}
