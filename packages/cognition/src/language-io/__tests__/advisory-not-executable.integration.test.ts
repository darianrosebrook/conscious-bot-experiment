/**
 * Advisory-Not-Executable Integration Test
 *
 * This test proves that advisory presence does NOT grant execution authority.
 * It is an acceptance criteria for PR1.
 *
 * Scenario:
 * - LLM output contains natural language intent ("I intend to explore")
 * - Sterling detects this and returns advisory with confidence 0.7
 * - BUT there is no explicit [GOAL:] tag, so no committed goal
 * - Task conversion MUST fail with ExecutionGateError
 *
 * This test ensures we never convert advisory-only outputs into tasks.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SterlingLanguageIOClient,
  ExecutionGateError,
} from '../sterling-language-io-client';
import { canConvertToTask, requireExecutable } from '../execution-gate';
import type { ReducerResultView } from '../reducer-result-types';

describe('Advisory Does Not Grant Execution Authority (Acceptance Criteria)', () => {
  let client: SterlingLanguageIOClient;

  beforeEach(async () => {
    client = new SterlingLanguageIOClient({ enabled: true });
    await client.connect();
  });

  afterEach(() => {
    client.disconnect();
  });

  /**
   * CRITICAL TEST: Advisory exists, committed goal absent → task conversion FAILS
   *
   * This is the key acceptance criteria for PR1:
   * "No code path converts advisory-only outputs into tasks."
   */
  it('advisory exists, committed goal absent → task conversion throws ExecutionGateError', async () => {
    // Input: Natural language intent (not explicit [GOAL:] tag)
    const rawOutput = 'I intend to explore the nearby mountains and find resources.';

    // Process through the language IO client
    const outcome = await client.reduce(rawOutput);

    // Verify we got a result (not an error)
    expect('result' in outcome).toBe(true);
    if (!('result' in outcome)) return;

    const result = outcome.result;

    // CRITICAL ASSERTIONS:
    // 1. Advisory IS present (Sterling detected intent)
    expect(result.advisory).not.toBeNull();
    expect(result.advisory!.intent_family).toBe('PLAN');
    expect(result.advisory!.confidence).toBeGreaterThan(0);
    expect(result.advisory!.confidence).toBeLessThan(1.0); // Not explicit

    // 2. Committed goal IS NOT present (no [GOAL:] tag)
    expect(result.committed_goal_prop_id).toBeNull();

    // 3. is_executable IS FALSE
    expect(result.is_executable).toBe(false);

    // 4. canConvertToTask returns FALSE
    expect(canConvertToTask(result)).toBe(false);

    // 5. outcome.canConvert is FALSE
    expect(outcome.canConvert).toBe(false);

    // 6. requireExecutable THROWS ExecutionGateError
    expect(() => requireExecutable(result)).toThrow(ExecutionGateError);

    // 7. Error message explains advisory doesn't grant authority
    expect(outcome.blockReason).toContain('advisory does not grant execution');
  });

  /**
   * Contrast test: Explicit [GOAL:] tag DOES allow conversion
   */
  it('explicit [GOAL:] tag → task conversion succeeds', async () => {
    const rawOutput = 'I see mountains. [GOAL: explore mountains]';

    const outcome = await client.reduce(rawOutput);
    expect('result' in outcome).toBe(true);
    if (!('result' in outcome)) return;

    const result = outcome.result;

    // Committed goal IS present
    expect(result.committed_goal_prop_id).not.toBeNull();

    // is_executable IS TRUE
    expect(result.is_executable).toBe(true);

    // canConvertToTask returns TRUE
    expect(canConvertToTask(result)).toBe(true);

    // requireExecutable does NOT throw
    expect(() => requireExecutable(result)).not.toThrow();
  });

  /**
   * Test multiple patterns that MUST NOT result in executable tasks
   */
  describe('Common natural language patterns MUST NOT be executable', () => {
    const nonExecutablePatterns = [
      'I intend to craft a pickaxe.',
      'I want to explore the cave.',
      'I will mine some stone.',
      'I should gather wood.',
      'Let me find some food.',
      'I\'m going to build a shelter.',
      'I need to collect resources.',
      'I plan to navigate to the village.',
    ];

    for (const pattern of nonExecutablePatterns) {
      it(`"${pattern.substring(0, 30)}..." → NOT executable`, async () => {
        const outcome = await client.reduce(pattern);

        expect('result' in outcome).toBe(true);
        if (!('result' in outcome)) return;

        const result = outcome.result;

        // MUST NOT be executable
        expect(result.is_executable).toBe(false);
        expect(canConvertToTask(result)).toBe(false);
        expect(outcome.canConvert).toBe(false);

        // requireExecutable MUST throw
        expect(() => requireExecutable(result)).toThrow(ExecutionGateError);
      });
    }
  });

  /**
   * Test: High-confidence advisory still doesn't grant execution
   */
  it('even 100% confidence advisory without [GOAL:] tag is NOT executable', async () => {
    // Construct a result manually to test the boundary
    const highConfidenceAdvisoryResult: ReducerResultView = {
      committed_goal_prop_id: null, // No committed goal!
      committed_ir_digest: 'ling_ir:test',
      source_envelope_id: 'env_test',
      is_executable: false,
      is_semantically_empty: false,
      advisory: {
        intent_family: 'PLAN',
        intent_type: 'CRAFT',
        confidence: 1.0, // Maximum confidence!
        suggested_domain: 'planning',
      },
      grounding: null,
      schema_version: '1.1.0',
      reducer_version: 'test',
    };

    // Despite 100% confidence advisory, canConvert MUST be false
    expect(canConvertToTask(highConfidenceAdvisoryResult)).toBe(false);
    expect(() => requireExecutable(highConfidenceAdvisoryResult)).toThrow(ExecutionGateError);
  });

  /**
   * Test: Grounding failure blocks execution even with committed goal
   */
  it('committed goal with failed grounding → NOT executable', async () => {
    const groundingFailedResult: ReducerResultView = {
      committed_goal_prop_id: 'prop_123', // Has committed goal!
      committed_ir_digest: 'ling_ir:test',
      source_envelope_id: 'env_test',
      is_executable: false, // But grounding failed
      is_semantically_empty: false,
      advisory: {
        intent_family: 'PLAN',
        intent_type: 'CRAFT',
        confidence: 1.0,
        suggested_domain: 'planning',
      },
      grounding: {
        passed: false, // Grounding FAILED
        reason: 'diamond_ore not found in nearby blocks',
        world_snapshot_digest: 'snap_test',
      },
      schema_version: '1.1.0',
      reducer_version: 'test',
    };

    // Despite committed goal, grounding failure blocks execution
    expect(canConvertToTask(groundingFailedResult)).toBe(false);
    expect(() => requireExecutable(groundingFailedResult)).toThrow(ExecutionGateError);
  });
});

describe('reduceAndRequireExecutable enforces gate', () => {
  let client: SterlingLanguageIOClient;

  beforeEach(async () => {
    client = new SterlingLanguageIOClient({ enabled: true });
    await client.connect();
  });

  afterEach(() => {
    client.disconnect();
  });

  it('throws for advisory-only input', async () => {
    await expect(
      client.reduceAndRequireExecutable('I intend to explore.')
    ).rejects.toThrow(ExecutionGateError);
  });

  it('succeeds for explicit goal', async () => {
    const result = await client.reduceAndRequireExecutable('[GOAL: explore area]');
    expect(result.canConvert).toBe(true);
  });
});
