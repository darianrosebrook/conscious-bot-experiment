/**
 * LLM Interface Sterling Handshake Test (Migration B Harness)
 *
 * This test enforces that llm-interface.ts delegates semantic work to Sterling
 * via the language-io client, rather than performing local semantic interpretation.
 *
 * Evidence type: B1 (Integration handshake - Sterling in the loop)
 *
 * Strategy: Dependency injection with mock SterlingLanguageIOClient.
 * The test injects a fake client, calls LLMInterface methods, and asserts
 * that Sterling's reduce() was invoked with correct envelope shape.
 *
 * IMPORTANT: This test must fail if the code path bypasses Sterling.
 *
 * TEST LIFECYCLE:
 * - Pre-migration: Tests marked `it.fails()` pass because failure is expected
 *   (current code doesn't call Sterling yet)
 * - Post-migration: Tests flipped to `it()` must pass (Sterling now called)
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMInterface } from '../llm-interface';
import type { SterlingLanguageIOClient } from '../../language-io';
import type { ReduceResult, ReducerResultView } from '../../language-io';

/**
 * Create a mock SterlingLanguageIOClient for testing.
 * The mock tracks calls to reduce() without requiring Sterling server.
 */
function createMockLanguageIOClient() {
  const mockReducerResult: ReducerResultView = {
    is_executable: true,
    committed_goal_prop_id: 'prop_test_123',
    committed_ir: { test: true },
    intent_family: 'action',
    grounding: null,
    propositions: [],
    schema_version: '1.0.0',
  };

  const mockReduceResult: ReduceResult = {
    result: mockReducerResult,
    envelope: {
      envelope_id: 'env_test_abc',
      schema_version: '1.0.0',
      verbatim_text: '',
      declared_markers: [],
      timestamp: Date.now(),
    } as any,
    canConvert: true,
    blockReason: null,
    durationMs: 10,
  };

  const mockReduce = vi.fn().mockResolvedValue(mockReduceResult);
  const mockConnect = vi.fn().mockResolvedValue(undefined);
  const mockReduceWithFallback = vi.fn().mockResolvedValue(mockReduceResult);

  const mockClient = {
    reduce: mockReduce,
    connect: mockConnect,
    reduceWithFallback: mockReduceWithFallback,
    isConnected: vi.fn().mockReturnValue(true),
    disconnect: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  } as unknown as SterlingLanguageIOClient;

  return { mockClient, mockReduce, mockConnect, mockReduceWithFallback };
}

describe('LLM Interface Sterling Handshake (Migration B)', () => {
  describe('DI Seam (Step 1)', () => {
    it('constructor accepts optional languageIOClient parameter', () => {
      // IMPLEMENTED: DI seam now exists in llm-interface.ts
      const { mockClient } = createMockLanguageIOClient();

      // Should not throw - DI seam is wired
      const llm = new LLMInterface({}, { languageIOClient: mockClient });

      expect(llm).toBeDefined();
      expect(llm.isAvailable()).toBe(true);
    });
  });

  describe('Handshake tripwire (Step 2)', () => {
    /**
     * BYPASS DETECTION TEST
     *
     * Pre-migration: This test FAILS because current llm-interface.ts
     * does NOT call Sterling reduce(). We mark it as `it.fails()` so
     * CI stays green while proving the test can detect bypass.
     *
     * Post-migration: Flip to `it()` - test will PASS because Sterling
     * is now called, proving the handshake is live.
     *
     * This is the core "tripwire" that makes "green" mean something.
     */
    it.fails('should call Sterling reduce() when processing LLM output (PRE-MIGRATION: expected to fail)', async () => {
      const { mockClient, mockReduce } = createMockLanguageIOClient();

      const llm = new LLMInterface(
        {
          host: 'localhost',
          port: 11434, // Fake port - we're mocking the LLM call too
        },
        { languageIOClient: mockClient }
      );

      // Mock the Ollama call to avoid network dependency
      // We're testing Sterling integration, not Ollama connectivity
      vi.spyOn(llm as any, 'callOllama').mockResolvedValue({
        response: 'I see trees nearby. [GOAL: dig stone]',
        done: true,
        prompt_eval_count: 10,
        eval_count: 20,
      });

      // Call generateResponse - post-migration this should call Sterling reduce()
      await llm.generateResponse('What do you see?');

      // ASSERTION: Sterling reduce() must be called
      // Pre-migration: This fails (mockReduce not called)
      // Post-migration: This passes (mockReduce called once)
      expect(mockReduce).toHaveBeenCalledTimes(1);
    });

    it.todo('should use Sterling result for is_executable decision', async () => {
      // TODO: After primary handshake test is proven, implement this
      // Mock reduce() returns result with is_executable: false
      // Assert downstream logic respects this (doesn't override)
    });

    it.todo('should not perform local semantic normalization after Sterling reduce', async () => {
      // TODO: After primary handshake test is proven, implement this
      // Mock reduce() returns result with specific committed_goal_prop_id
      // Assert no TS code "fixes up" the action/target/amount
    });
  });

  describe('Negative test: no local semantic switches', () => {
    it('should not contain forbidden semantic patterns in llm-interface.ts', async () => {
      // Source scan for forbidden patterns that indicate local semantic interpretation
      const fs = await import('fs');
      const path = await import('path');

      const llmInterfacePath = path.resolve(__dirname, '../llm-interface.ts');
      const content = fs.readFileSync(llmInterfacePath, 'utf-8');

      // Forbidden patterns that indicate TS is doing Sterling's job
      const forbiddenPatterns = [
        { pattern: /ACTION_NORMALIZE_MAP/g, name: 'ACTION_NORMALIZE_MAP' },
        { pattern: /CANONICAL_ACTIONS/g, name: 'CANONICAL_ACTIONS' },
        { pattern: /normalizeGoalAction/g, name: 'normalizeGoalAction' },
        { pattern: /canonicalGoalKey/g, name: 'canonicalGoalKey' },
        // Note: switch statements on action are already caught by no-local-mapping.test.ts
      ];

      const violations: string[] = [];
      for (const { pattern, name } of forbiddenPatterns) {
        if (pattern.test(content)) {
          violations.push(name);
        }
      }

      if (violations.length > 0) {
        expect.fail(
          `llm-interface.ts contains forbidden semantic patterns:\n` +
          `  ${violations.join(', ')}\n\n` +
          `These patterns indicate local semantic interpretation.\n` +
          `Sterling is the semantic authority. Remove these patterns and\n` +
          `delegate to language-io reduce() instead.`
        );
      }

      expect(violations).toHaveLength(0);
    });
  });
});
