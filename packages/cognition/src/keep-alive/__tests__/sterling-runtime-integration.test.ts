/**
 * Sterling Runtime Integration Test
 *
 * This test proves that the runtime path (KeepAliveController.tick())
 * correctly routes through Sterling and enforces the execution gate.
 *
 * Key acceptance criteria for PR1:
 * - Advisory-only outputs (natural language intent) produce isExecutable=false
 * - Explicit [GOAL:] tags produce isExecutable=true
 * - The runtime entry point uses the Sterling pipeline
 *
 * This is NOT a unit test with mocks - it uses the real runtime path
 * with a stub transport to verify the wiring.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KeepAliveController, type KeepAliveContext, type KeepAliveThought } from '../keep-alive-controller';
import { MockLanguageIOTransport, setDefaultTransport, getDefaultTransport } from '../../language-io';
import { setDefaultLanguageIOClient, SterlingLanguageIOClient } from '../../language-io';

// =============================================================================
// Test Fixtures
// =============================================================================

function createMinimalContext(): KeepAliveContext {
  return {
    currentState: {
      position: { x: 0, y: 64, z: 0 },
      health: 20,
      food: 20,
      inventory: [],
      biome: 'plains',
    },
    activePlanSteps: 0,
    recentTaskConversions: 0,
    lastUserCommand: 0,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('Sterling Runtime Integration (PR1 Acceptance)', () => {
  let controller: KeepAliveController;
  let mockTransport: MockLanguageIOTransport;
  let originalTransport: ReturnType<typeof getDefaultTransport>;
  let thoughts: KeepAliveThought[];

  beforeEach(async () => {
    thoughts = [];

    // Save original transport
    originalTransport = getDefaultTransport();

    // Create mock transport and set as default
    mockTransport = new MockLanguageIOTransport();
    setDefaultTransport(mockTransport);

    // Create client with mock transport
    const client = new SterlingLanguageIOClient({
      enabled: true,
      transport: mockTransport,
    });
    await client.connect();
    setDefaultLanguageIOClient(client);

    // Create controller with a mock LLM generator
    controller = new KeepAliveController(
      async (prompt: string) => {
        // Default: return natural language intent (NOT explicit goal)
        return 'I intend to explore the nearby mountains and find resources.';
      },
      {
        baseIntervalMs: 100,
        minIntervalMs: 50,
        idleConfig: {
          recentTaskConversionWindowMs: 60000,
          recentUserCommandWindowMs: 0,
        },
      }
    );

    // Capture thoughts for assertion
    controller.on('thought', (_event, thought) => {
      thoughts.push(thought);
    });
  });

  afterEach(() => {
    // Restore original transport
    setDefaultTransport(originalTransport);
    setDefaultLanguageIOClient(null);
  });

  /**
   * CRITICAL TEST: Advisory-only output produces isExecutable=false
   *
   * This proves that the runtime path (tick → generateThought → processLLMOutputAsync)
   * correctly blocks advisory-only outputs from becoming tasks.
   */
  it('advisory-only output produces isExecutable=false in runtime path', async () => {
    // Create controller that returns natural language intent
    const advisoryController = new KeepAliveController(
      async () => 'I intend to explore the nearby mountains.',
      {
        baseIntervalMs: 100,
        minIntervalMs: 50,
        idleConfig: {
          recentTaskConversionWindowMs: 60000,
          recentUserCommandWindowMs: 0,
        },
      }
    );

    const capturedThoughts: KeepAliveThought[] = [];
    advisoryController.on('thought', (_event, thought) => {
      capturedThoughts.push(thought);
    });

    // Run tick
    const result = await advisoryController.tick(createMinimalContext());

    // Tick should succeed
    expect(result.ticked).toBe(true);
    expect(result.thought).toBeDefined();

    const thought = result.thought!;

    // CRITICAL ASSERTIONS:
    // 1. Sterling was used
    expect(thought.sterlingUsed).toBe(true);

    // 2. isExecutable is FALSE (advisory does NOT grant execution)
    expect(thought.isExecutable).toBe(false);

    // 3. There is a block reason explaining why
    expect(thought.blockReason).not.toBeNull();
    expect(thought.blockReason).toContain('advisory does not grant execution');

    // 4. Eligibility.convertEligible is FALSE
    expect(thought.eligibility.convertEligible).toBe(false);

    // 5. Envelope ID exists (proves we went through Sterling pipeline)
    expect(thought.envelopeId).not.toBeNull();
  });

  /**
   * CONTRAST TEST: Explicit [GOAL:] tag produces isExecutable=true
   */
  it('explicit [GOAL:] tag produces isExecutable=true in runtime path', async () => {
    // Create controller that returns explicit goal
    const goalController = new KeepAliveController(
      async () => 'I see trees nearby. [GOAL: craft wooden_planks]',
      {
        baseIntervalMs: 100,
        minIntervalMs: 50,
        idleConfig: {
          recentTaskConversionWindowMs: 60000,
          recentUserCommandWindowMs: 0,
        },
      }
    );

    // Run tick
    const result = await goalController.tick(createMinimalContext());

    expect(result.ticked).toBe(true);
    const thought = result.thought!;

    // Sterling was used
    expect(thought.sterlingUsed).toBe(true);

    // isExecutable is TRUE
    expect(thought.isExecutable).toBe(true);

    // Eligibility.convertEligible is TRUE
    expect(thought.eligibility.convertEligible).toBe(true);

    // No block reason
    expect(thought.blockReason).toBeNull();
  });

  /**
   * Test: Multiple patterns that MUST NOT be executable
   */
  describe('Common natural language patterns MUST NOT be executable', () => {
    const nonExecutablePatterns = [
      'I intend to craft a pickaxe.',
      'I want to explore the cave.',
      'I will mine some stone.',
      'I should gather wood.',
      'Let me find some food.',
      "I'm going to build a shelter.",
      'I need to collect resources.',
      'I plan to navigate to the village.',
    ];

    for (const pattern of nonExecutablePatterns) {
      it(`"${pattern.substring(0, 30)}..." → NOT executable`, async () => {
        const patternController = new KeepAliveController(
          async () => pattern,
          {
            baseIntervalMs: 100,
            minIntervalMs: 50,
            idleConfig: {
              recentTaskConversionWindowMs: 60000,
              recentUserCommandWindowMs: 0,
            },
          }
        );

        const result = await patternController.tick(createMinimalContext());

        expect(result.ticked).toBe(true);
        expect(result.thought!.isExecutable).toBe(false);
        expect(result.thought!.eligibility.convertEligible).toBe(false);
      });
    }
  });

  /**
   * Test: Sterling metadata is populated in the thought
   */
  it('thought includes Sterling metadata for observability', async () => {
    const result = await controller.tick(createMinimalContext());

    expect(result.ticked).toBe(true);
    const thought = result.thought!;

    // All Sterling metadata fields should be present
    expect(thought).toHaveProperty('sterlingUsed');
    expect(thought).toHaveProperty('isExecutable');
    expect(thought).toHaveProperty('blockReason');
    expect(thought).toHaveProperty('envelopeId');
    expect(thought).toHaveProperty('processingDurationMs');

    // envelopeId should be a 16-char hex string
    expect(thought.envelopeId).toMatch(/^[a-f0-9]{16}$/);
  });

  /**
   * Test: Fallback mode when Sterling unavailable
   *
   * PR4 MIGRATION: Fail-closed design (I-FAILCLOSED-1)
   * When Sterling is unavailable, NOTHING is executable, even explicit [GOAL:] tags.
   * Sterling is the semantic authority. TS does NOT interpret goal tags locally.
   */
  it('falls back gracefully when Sterling unavailable (fail-closed)', async () => {
    // Make transport unavailable
    mockTransport.setAvailable(false);

    // Create controller that returns explicit goal
    const fallbackController = new KeepAliveController(
      async () => '[GOAL: mine stone]',
      {
        baseIntervalMs: 100,
        minIntervalMs: 50,
        idleConfig: {
          recentTaskConversionWindowMs: 60000,
          recentUserCommandWindowMs: 0,
        },
      }
    );

    const result = await fallbackController.tick(createMinimalContext());

    expect(result.ticked).toBe(true);
    const thought = result.thought!;

    // Fallback mode was used
    expect(thought.sterlingUsed).toBe(false);

    // PR4: FAIL-CLOSED — even explicit goal tags are NOT executable without Sterling
    // This is I-FAILCLOSED-1: Sterling is the semantic authority
    expect(thought.isExecutable).toBe(false);

    // Block reason should indicate Sterling unavailability
    expect(thought.blockReason).toContain('Sterling unavailable');
  });

  /**
   * Test: Fallback mode blocks natural language intent
   */
  it('fallback mode blocks natural language intent (fail-closed)', async () => {
    // Make transport unavailable
    mockTransport.setAvailable(false);

    // Create controller that returns natural language intent
    const fallbackController = new KeepAliveController(
      async () => 'I intend to explore the area.',
      {
        baseIntervalMs: 100,
        minIntervalMs: 50,
        idleConfig: {
          recentTaskConversionWindowMs: 60000,
          recentUserCommandWindowMs: 0,
        },
      }
    );

    const result = await fallbackController.tick(createMinimalContext());

    expect(result.ticked).toBe(true);
    const thought = result.thought!;

    // Fallback mode was used
    expect(thought.sterlingUsed).toBe(false);

    // CRITICAL: Natural language intent in fallback mode is NOT executable
    expect(thought.isExecutable).toBe(false);
  });
});

describe('Eligibility Rule Enforcement', () => {
  let mockTransport: MockLanguageIOTransport;

  beforeEach(async () => {
    mockTransport = new MockLanguageIOTransport();
    setDefaultTransport(mockTransport);

    const client = new SterlingLanguageIOClient({
      enabled: true,
      transport: mockTransport,
    });
    await client.connect();
    setDefaultLanguageIOClient(client);
  });

  afterEach(() => {
    setDefaultLanguageIOClient(null);
  });

  /**
   * Test: eligibility.convertEligible MUST equal isExecutable
   */
  it('eligibility.convertEligible equals isExecutable from Sterling', async () => {
    const patterns = [
      { input: '[GOAL: craft wood]', expectedExecutable: true },
      { input: 'I intend to explore.', expectedExecutable: false },
      { input: 'The weather is nice.', expectedExecutable: false },
    ];

    for (const { input, expectedExecutable } of patterns) {
      const controller = new KeepAliveController(
        async () => input,
        {
          baseIntervalMs: 100,
          minIntervalMs: 50,
          idleConfig: {
            recentTaskConversionWindowMs: 60000,
            recentUserCommandWindowMs: 0,
          },
        }
      );

      const result = await controller.tick({
        currentState: { health: 20, food: 20 },
        activePlanSteps: 0,
        recentTaskConversions: 0,
        lastUserCommand: 0,
      });

      expect(result.thought!.eligibility.convertEligible).toBe(expectedExecutable);
      expect(result.thought!.isExecutable).toBe(expectedExecutable);
    }
  });
});
