/**
 * Leaf Implementation Interfaces for MCP Integration
 *
 * Shared interfaces for leaf implementations that can be used across
 * different packages without creating circular dependencies.
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ============================================================================
// Core Leaf Interfaces
// ============================================================================

/**
 * Leaf implementation interface - the contract that all leaf implementations must satisfy
 */
export interface LeafImpl {
  name?: string;
  description?: string;
  inputSchema?: z.ZodSchema<any> | any;
  outputSchema?: z.ZodSchema<any> | any;
  spec?: LeafSpec; // Optional spec for compatibility

  execute?(
    context: LeafContext,
    args: Record<string, any>,
    options?: LeafRunOptions
  ): Promise<LeafResult>;

  run?(
    context: LeafContext,
    args: Record<string, any>,
    options?: LeafRunOptions
  ): Promise<LeafResult>;
}

/**
 * Context provided to leaf implementations during execution
 */
export interface LeafContext {
  bot?: any; // Mineflayer bot instance
  worldState?: any;
  timestamp: number;
  requestId: string;
  maxRetries?: number;
  timeout?: number;
  verbosity?: 'silent' | 'normal' | 'verbose';
}

/**
 * Leaf execution status
 */
export type LeafStatus = 'success' | 'failure' | 'running';

/**
 * Structured execution error
 */
export interface ExecError {
  code: ExecErrorCode;
  retryable: boolean;
  detail?: string;
}

/**
 * Metrics emitted by leaf execution
 */
export interface LeafMetrics {
  executionTime?: number;
  retries?: number;
  [key: string]: any;
}

/**
 * Result returned by leaf execution (core compatibility)
 */
export interface LeafResult {
  status: LeafStatus;
  result?: unknown;
  error?: ExecError; // structured error
  metrics?: LeafMetrics;
  postconditions?: unknown;
  // Backward compatibility fields
  success?: boolean;
  data?: any;
}

/**
 * Options for leaf execution (core compatibility)
 */
export interface LeafRunOptions {
  idempotencyKey?: string; // dedupe accidental repeats
  priority?: number; // execution priority
  traceId?: string; // for distributed tracing
  timeout?: number; // backward compatibility
  maxRetries?: number; // backward compatibility
  verbosity?: 'silent' | 'normal' | 'verbose'; // backward compatibility
  dryRun?: boolean; // backward compatibility
}

/**
 * Leaf permissions for safety enforcement
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
 * Specification for registering a leaf (core compatibility)
 */
export interface LeafSpec {
  name: string;
  version: string;
  description?: string;
  inputSchema: any; // JSON Schema or Zod schema
  outputSchema?: any;
  postconditions?: any;
  timeoutMs: number;
  retries: number;
  permissions: LeafPermission[];
  rateLimitPerMin?: number;
  maxConcurrent?: number;
  implementation?: LeafImpl; // Optional for our simple factory
}

/**
 * Result of leaf registration
 */
export interface RegistrationResult {
  ok: boolean;
  error?: string;
  leafName?: string;
  id?: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a leaf context with common defaults
 */
export function createLeafContext(
  bot?: any,
  overrides?: Partial<LeafContext>
): LeafContext {
  return {
    bot,
    timestamp: Date.now(),
    requestId: `leaf-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    maxRetries: 3,
    timeout: 10000,
    verbosity: 'normal',
    ...overrides,
  };
}

/**
 * Validate a leaf implementation
 */
export function validateLeafImpl(impl: any): impl is LeafImpl {
  if (!impl) return false;

  const spec = impl.spec ?? {};
  const name = impl.name ?? spec.name;
  const description = impl.description ?? spec.description;
  const inputSchema = impl.inputSchema ?? spec.inputSchema;
  const outputSchema = impl.outputSchema ?? spec.outputSchema;
  const hasExecutor =
    typeof impl.execute === 'function' || typeof impl.run === 'function';

  return (
    typeof name === 'string' &&
    name.length > 0 &&
    typeof description === 'string' &&
    !!inputSchema &&
    !!outputSchema &&
    hasExecutor
  );
}

/**
 * Create an execution error result (core compatibility)
 */
export function createExecError(
  message: string,
  code: ExecErrorCode = ExecErrorCode.EXECUTION_FAILED,
  retryable: boolean = false
): LeafResult {
  return {
    status: 'failure',
    error: {
      code,
      retryable,
      detail: message,
    },
    // Backward compatibility
    success: false,
  };
}

/**
 * Error codes for leaf execution failures
 */
export enum ExecErrorCode {
  TIMEOUT = 'TIMEOUT',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  BOT_NOT_AVAILABLE = 'BOT_NOT_AVAILABLE',
  PRECONDITION_FAILED = 'PRECONDITION_FAILED',
  POSTCONDITION_FAILED = 'POSTCONDITION_FAILED',
  RETRY_EXHAUSTED = 'RETRY_EXHAUSTED',
}

/**
 * Verify postconditions for a leaf execution
 */
export function verifyPostconditions(
  result: LeafResult,
  expectedConditions?: Record<string, any>
): boolean {
  if (!result.success) {
    return false;
  }

  if (!expectedConditions) {
    return true;
  }

  // Simple verification - can be extended
  for (const [key, expected] of Object.entries(expectedConditions)) {
    const actual = result.data?.[key];
    if (actual !== expected) {
      return false;
    }
  }

  return true;
}

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

export const LeafContextSchema = z.object({
  bot: z.any().optional(),
  worldState: z.any().optional(),
  timestamp: z.number(),
  requestId: z.string(),
  maxRetries: z.number().optional(),
  timeout: z.number().optional(),
  verbosity: z.enum(['silent', 'normal', 'verbose']).optional(),
});

export const LeafResultSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export const LeafRunOptionsSchema = z.object({
  timeout: z.number().optional(),
  maxRetries: z.number().optional(),
  verbosity: z.enum(['silent', 'normal', 'verbose']).optional(),
  dryRun: z.boolean().optional(),
});
