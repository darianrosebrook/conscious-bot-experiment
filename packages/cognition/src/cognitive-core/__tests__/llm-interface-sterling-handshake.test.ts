/**
 * LLM Interface Sterling Handshake Test (Migration B Harness)
 *
 * This test enforces that llm-interface.ts delegates semantic work to Sterling
 * via the language-io client, rather than performing local semantic interpretation.
 *
 * Evidence type: B1 (Integration handshake - Sterling in the loop)
 *
 * Strategy: Test the stable semantic seam (reduceRawLLMOutput) directly,
 * plus verify LLMInterface routes through it.
 *
 * IMPORTANT: This test must fail if the code path bypasses Sterling.
 *
 * TEST LIFECYCLE:
 * - Pre-migration: Tests marked `it.fails()` pass because failure is expected
 *   (current code doesn't call Sterling yet)
 * - Post-migration: Tests flipped to `it()` must pass (Sterling now called)
 *
 * BOUNDARY RULE (I-REDUCTION-1):
 * TS may assemble envelopes, route tasks, and log provenance, but it may NOT
 * infer or normalize semantic fields that Sterling owns.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMInterface } from '../llm-interface';
import { reduceRawLLMOutput, ReductionError } from '../llm-output-reducer';
import type { SterlingLanguageIOClient } from '../../language-io';
import type { ReduceResult, ReducerResultView } from '../../language-io';

// Stub isUsableForTTS to always return true in these tests
// This prevents retry logic from interfering with Sterling call assertions
vi.mock('../../server-utils/tts-usable-content', () => ({
  isUsableForTTS: () => true,
}));

/**
 * Create a mock SterlingLanguageIOClient for testing.
 * The mock tracks calls to reduce() without requiring Sterling server.
 */
function createMockLanguageIOClient() {
  const mockReducerResult: ReducerResultView = {
    is_executable: true,
    is_semantically_empty: false,
    committed_goal_prop_id: 'prop_test_123',
    committed_ir_digest: 'digest_test_456',
    source_envelope_id: 'env_test_abc',
    advisory: null,
    grounding: null,
    schema_version: '1.0.0',
    reducer_version: '1.0.0',
  };

  const mockReduceResult: ReduceResult = {
    result: mockReducerResult,
    envelope: {
      schema_id: 'language_io_envelope',
      schema_version: '1.0.0',
      envelope_id: 'env_test_abc',
      raw_text_verbatim: '',
      sanitized_text: '',
      sanitization_version: '1.0.0',
      sanitization_flags: {},
      declared_markers: [],
      model_id: null,
      prompt_digest: null,
      world_snapshot_ref: null,
      timestamp_ms: Date.now(),
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
  describe('Stable Semantic Seam (reduceRawLLMOutput)', () => {
    /**
     * These tests target the stable seam directly.
     * They don't depend on LLMInterface internals and won't break under refactor.
     */

    it('calls Sterling reduce() with correct parameters', async () => {
      const { mockClient, mockReduce } = createMockLanguageIOClient();
      const rawOutput = 'I see trees nearby. [GOAL: dig stone]';

      const result = await reduceRawLLMOutput(rawOutput, mockClient);

      // Sterling reduce() must be called
      expect(mockReduce).toHaveBeenCalledTimes(1);

      // reduce() is called with raw text (string) and options
      const calledRawText = mockReduce.mock.calls[0][0];
      const calledOptions = mockReduce.mock.calls[0][1];

      // Verify raw text passed through unchanged (no preprocessing)
      expect(calledRawText).toBe(rawOutput);
      expect(calledOptions).toBeDefined();
    });

    it('passes through Sterling result without semantic fix-up', async () => {
      const { mockClient, mockReduce } = createMockLanguageIOClient();

      // Configure mock to return specific semantic fields
      const specificResult: ReducerResultView = {
        is_executable: false, // Deliberately false
        is_semantically_empty: false,
        committed_goal_prop_id: 'prop_specific_xyz',
        committed_ir_digest: 'digest_specific_789',
        source_envelope_id: 'env_123',
        advisory: { family: 'query', confidence: 0.8 } as any,
        grounding: { passed: false, reason: 'test_reason' } as any,
        schema_version: '2.0.0',
        reducer_version: '1.0.0',
      };

      mockReduce.mockResolvedValueOnce({
        result: specificResult,
        envelope: { envelope_id: 'env_123' } as any,
        canConvert: false,
        blockReason: 'test_block_reason',
        durationMs: 50,
      });

      const result = await reduceRawLLMOutput('test input', mockClient);

      // Result must be passed through OPAQUELY (no fix-up)
      expect(result.reducerResult).toEqual(specificResult);
      expect(result.isExecutable).toBe(false); // Not "salvaged"
      expect(result.blockReason).toBe('test_block_reason');
    });

    it('does NOT attempt local semantic parsing on Sterling failure', async () => {
      const { mockClient, mockReduce } = createMockLanguageIOClient();

      // Configure mock to return a ReduceError (not throw)
      // The client API returns ReduceResult | ReduceError, doesn't throw
      mockReduce.mockResolvedValueOnce({
        code: 'STERLING_UNAVAILABLE',
        message: 'Sterling unavailable',
        envelope: {} as any,
      });

      // Must throw ReductionError, NOT fall back to local parsing
      await expect(reduceRawLLMOutput('test input', mockClient))
        .rejects.toThrow(ReductionError);

      // Verify reduce was attempted
      expect(mockReduce).toHaveBeenCalledTimes(1);
    });

    it('logs reduction event with correct provenance', async () => {
      const { mockClient } = createMockLanguageIOClient();
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Temporarily allow logging in test
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      try {
        await reduceRawLLMOutput('test input', mockClient, { requestId: 'req_123' });

        // Should have logged a structured event
        expect(consoleSpy).toHaveBeenCalled();
        const logCall = consoleSpy.mock.calls[0][0];
        const event = JSON.parse(logCall);

        expect(event.event).toBe('llm_output_reduction');
        expect(event.envelope_schema_version).toBeDefined();
        expect(event.envelope_id).toBeDefined();
        expect(event.reduce_latency_ms).toBeGreaterThanOrEqual(0);
        expect(event.is_executable).toBeDefined();
        expect(event.request_id).toBe('req_123');
      } finally {
        process.env.NODE_ENV = originalEnv;
        consoleSpy.mockRestore();
      }
    });
  });

  describe('DI Seam (LLMInterface)', () => {
    it('constructor accepts optional languageIOClient parameter', () => {
      // IMPLEMENTED: DI seam now exists in llm-interface.ts
      const { mockClient } = createMockLanguageIOClient();

      // Should not throw - DI seam is wired
      const llm = new LLMInterface({}, { languageIOClient: mockClient });

      expect(llm).toBeDefined();
      expect(llm.isAvailable()).toBe(true);
    });
  });

  describe('LLMInterface routes through stable seam (Step 2)', () => {
    /**
     * HANDSHAKE VERIFICATION TEST
     *
     * This test proves that LLMInterface calls Sterling reduce() for
     * semantic interpretation. It uses DI to inject a mock client and
     * verifies the mock is called with the raw LLM output.
     *
     * MIGRATION B COMPLETE: This test now passes because llm-interface.ts
     * uses reduceRawLLMOutput() which calls the injected Sterling client.
     */
    it('should call Sterling reduce() when processing LLM output (POST-MIGRATION: Sterling is live)', async () => {
      const { mockClient, mockReduce } = createMockLanguageIOClient();

      const llm = new LLMInterface(
        {
          host: 'localhost',
          port: 11434, // Fake port - we're mocking the LLM call too
        },
        { languageIOClient: mockClient }
      );

      // Mock the sidecar call to avoid network dependency
      // We're testing Sterling integration, not sidecar connectivity
      vi.spyOn(llm as any, 'callSidecar').mockResolvedValue({
        response: 'I see trees nearby. [GOAL: dig stone]',
        done: true,
        prompt_eval_count: 10,
        eval_count: 20,
      });

      // Call generateResponse - post-migration this should call Sterling reduce()
      await llm.generateResponse('What do you see?');

      // ASSERTION: Sterling reduce() must be called at least once
      // Note: May be called multiple times due to quality retries — that's OK.
      // The handshake is proven as long as reduce() is called at all.
      expect(mockReduce).toHaveBeenCalled();

      // Verify reduce was called with the raw LLM output
      expect(mockReduce.mock.calls[0][0]).toBe('I see trees nearby. [GOAL: dig stone]');
    });

    it('should use Sterling result for is_executable decision (no salvage)', async () => {
      const { mockClient, mockReduce } = createMockLanguageIOClient();

      // Force Sterling to say "not executable"
      mockReduce.mockResolvedValueOnce({
        result: {
          is_executable: false,
          is_semantically_empty: false,
          committed_goal_prop_id: 'prop_should_not_matter',
          committed_ir_digest: 'digest_blocked',
          source_envelope_id: 'env_blocked',
          advisory: null,
          grounding: { passed: false, reason: 'blocked' } as any,
          schema_version: '1.0.0',
          reducer_version: '1.0.0',
        },
        envelope: {
          schema_id: 'language_io_envelope',
          schema_version: '1.0.0',
          envelope_id: 'env_blocked',
          raw_text_verbatim: 'I see trees. [GOAL: dig stone]',
          sanitized_text: 'I see trees.',
          sanitization_version: '1.0.0',
          sanitization_flags: {},
          declared_markers: [],
          model_id: null,
          prompt_digest: null,
          world_snapshot_ref: null,
          timestamp_ms: Date.now(),
        } as any,
        canConvert: false,
        blockReason: 'blocked_by_sterling',
        durationMs: 5,
      });

      const llm = new LLMInterface(
        { host: 'localhost', port: 11434 },
        { languageIOClient: mockClient }
      );

      vi.spyOn(llm as any, 'callSidecar').mockResolvedValue({
        response: 'I see trees. [GOAL: dig stone]',
        done: true,
        prompt_eval_count: 10,
        eval_count: 20,
      });

      const response = await llm.generateResponse('What do you see?');

      // CRITICAL: TS must NOT flip is_executable to true ("salvage")
      // Sterling said false, so it stays false
      expect(response.metadata?.reduction?.sterlingProcessed).toBe(true);
      expect(response.metadata?.reduction?.isExecutable).toBe(false);
      expect(response.metadata?.reduction?.blockReason).toBe('blocked_by_sterling');
    });

    it('should not perform local semantic normalization after Sterling reduce', async () => {
      const { mockClient, mockReduce } = createMockLanguageIOClient();

      // Use a "weird" committed_goal_prop_id to prove it's not normalized
      const weirdId = 'PROP::Weird/Case  Value\t#1';

      mockReduce.mockResolvedValueOnce({
        result: {
          is_executable: true,
          is_semantically_empty: false,
          committed_goal_prop_id: weirdId,
          committed_ir_digest: 'digest_weird',
          source_envelope_id: 'env_weird',
          advisory: null,
          grounding: null,
          schema_version: '1.0.0',
          reducer_version: '1.0.0',
        },
        envelope: {
          schema_id: 'language_io_envelope',
          schema_version: '1.0.0',
          envelope_id: 'env_weird',
          raw_text_verbatim: 'Say something',
          sanitized_text: 'Say something',
          sanitization_version: '1.0.0',
          sanitization_flags: {},
          declared_markers: [],
          model_id: null,
          prompt_digest: null,
          world_snapshot_ref: null,
          timestamp_ms: Date.now(),
        } as any,
        canConvert: true,
        blockReason: null,
        durationMs: 5,
      });

      const llm = new LLMInterface(
        { host: 'localhost', port: 11434 },
        { languageIOClient: mockClient }
      );

      vi.spyOn(llm as any, 'callSidecar').mockResolvedValue({
        response: 'Say something',
        done: true,
        prompt_eval_count: 5,
        eval_count: 10,
      });

      const response = await llm.generateResponse('Say something');

      // CRITICAL: The weird ID must be stored EXACTLY as Sterling returned it
      // No normalization, no mapping, no "fixing up"
      const storedId = response.metadata?.reduction?.reducerResult?.committed_goal_prop_id;
      expect(storedId).toBe(weirdId);
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
