/**
 * LLM Preload Helper
 *
 * Extracted from server.ts's startup path to create a testable seam for
 * the `llm_preload_failed` observability event. Prior to this extraction,
 * the preload call was buried inside a `setTimeout` inside `app.listen`'s
 * callback inside a `.then()` branch of a health check, with no seam to
 * unit-test. The original `.catch(() => {})` was silently dropping preload
 * failures until commit 242c702 added a structured warn log — but even
 * that was typecheck-only because the call site was unreachable from tests.
 *
 * This helper wraps `llm.preloadModel()` with the same structured logging
 * behavior, exposes a narrow interface (`Pick<LLMInterface, 'preloadModel'>`)
 * so tests can mock with a one-property object, and returns a
 * `Promise<void>` that always resolves (never rejects) so production
 * callers can fire-and-forget without worrying about unhandled rejections.
 *
 * @author @darianrosebrook
 */

import type { LLMInterface } from '../cognitive-core/llm-interface';
import { createServerLogger } from './server-logger';

/**
 * Minimal logger shape needed by `preloadLlmWithLogging`. Uses the inferred
 * return type of `createServerLogger` so the helper stays in sync with the
 * logger's actual surface without duplicating the interface definition.
 */
export type PreloadLogger = ReturnType<typeof createServerLogger>;

/**
 * Preload the LLM model with structured failure logging.
 *
 * On success: resolves silently.
 * On failure: catches the error, emits a `llm_preload_failed` warn log with
 *   the error message as a field, and resolves anyway (does NOT rethrow).
 *   This lets production callers fire-and-forget the returned promise
 *   without worrying about unhandled rejections, while still surfacing
 *   the failure to operators via the structured log pipeline.
 *
 * The interface is deliberately narrower than `LLMInterface` so tests can
 * pass `{ preloadModel: vi.fn().mockRejectedValue(new Error('boom')) }`
 * without constructing a full `LLMInterface` or stubbing its dependency
 * graph.
 *
 * @param llm - Anything with a `preloadModel()` method returning a Promise.
 *              In production this is the module-scoped `LLMInterface`
 *              singleton; in tests it's a `vi.fn()`-backed fake.
 * @param logger - A server logger instance (from `createServerLogger`).
 *                 In tests this can be a fake whose methods are spies.
 * @returns A promise that always resolves (never rejects). Callers can
 *          `await` for determinism in tests or fire-and-forget in production.
 */
export async function preloadLlmWithLogging(
  llm: Pick<LLMInterface, 'preloadModel'>,
  logger: PreloadLogger
): Promise<void> {
  try {
    await llm.preloadModel();
  } catch (error) {
    logger.warn('LLM preload failed', {
      event: 'llm_preload_failed',
      tags: ['llm', 'preload', 'warn'],
      fields: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
