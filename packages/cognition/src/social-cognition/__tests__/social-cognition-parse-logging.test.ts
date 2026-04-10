/**
 * Regression tests for social-cognition parser logger migration.
 *
 * Validates that the LLM-response parsers in relationship-manager,
 * social-learner, and theory-of-mind-engine emit structured warn logs
 * with the correct event/tags/fields shape when the response text is
 * malformed JSON. Prior to the fix, these fell through to
 * `console.warn` / `console.error` which bypassed the observability
 * pipeline.
 *
 * For theory-of-mind-engine, this test also verifies that the existing
 * `emitParseFailedEvent` hook still fires alongside the logger — the
 * two signals serve different consumers (structured logger for
 * operators, event emitter for subscribers inside the module) and both
 * need to be preserved.
 *
 * Strategy: vi.hoisted + vi.mock on `../../server-utils/server-logger`
 * captures a single spy object that is returned for every
 * `createServerLogger` call, so warns from all three modules (each of
 * which creates its own logger with its own subsystem name) funnel
 * into the same `warnSpy`. Each test clears the spy before running.
 *
 * @author @darianrosebrook
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { warnSpy, debugSpy, infoSpy, errorSpy } = vi.hoisted(() => ({
  warnSpy: vi.fn(),
  debugSpy: vi.fn(),
  infoSpy: vi.fn(),
  errorSpy: vi.fn(),
}));

vi.mock('../../server-utils/server-logger', () => ({
  createServerLogger: () => ({
    debug: debugSpy,
    info: infoSpy,
    warn: warnSpy,
    error: errorSpy,
  }),
}));

import { RelationshipManager } from '../relationship-manager';
import { SocialLearner } from '../social-learner';
import { TheoryOfMindEngine } from '../theory-of-mind-engine';
import { AgentModeler } from '../agent-modeler';

// Minimal fake LLM — none of these tests actually call the LLM because
// they invoke the private parse methods directly with hand-crafted
// strings. The fake exists only to satisfy the constructors.
const fakeLlm = {
  generateResponse: vi.fn(),
} as any;

function makeRelationshipManager(): RelationshipManager {
  const modeler = new AgentModeler(fakeLlm);
  return new RelationshipManager(fakeLlm, modeler);
}

function makeSocialLearner(): SocialLearner {
  const modeler = new AgentModeler(fakeLlm);
  return new SocialLearner(fakeLlm, modeler);
}

function makeTheoryOfMindEngine(): TheoryOfMindEngine {
  const modeler = new AgentModeler(fakeLlm);
  return new TheoryOfMindEngine(fakeLlm, modeler);
}

describe('social-cognition — parser error-path logger migration', () => {
  beforeEach(() => {
    warnSpy.mockClear();
    debugSpy.mockClear();
    infoSpy.mockClear();
    errorSpy.mockClear();
  });

  describe('RelationshipManager.parseTrustAssessment', () => {
    it('logs `relationship_trust_parse_failed` when the response is malformed JSON', () => {
      const rm = makeRelationshipManager();
      const malformed = '{"overallTrust": 0.8, not valid }';

      const result = (rm as any).parseTrustAssessment(
        malformed,
        'agent-42',
        'cooperation'
      );

      // 1. A fallback object is returned (createEmptyTrustAssessment).
      expect(result).toBeDefined();
      // 2. The warn log fired with the full observability contract.
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const [message, context] = warnSpy.mock.calls[0];
      expect(message).toContain('trust assessment');
      expect(context).toMatchObject({
        event: 'relationship_trust_parse_failed',
        tags: ['social-cognition', 'parse', 'warn'],
      });
      expect(context.fields.agentId).toBe('agent-42');
      expect(context.fields.domain).toBe('cooperation');
      expect(typeof context.fields.error).toBe('string');
      expect(context.fields.responseSnippet).toContain('overallTrust');
      expect(context.fields.responseSnippet.length).toBeLessThanOrEqual(200);
    });

    it('does NOT log when the response is valid JSON', () => {
      const rm = makeRelationshipManager();
      const valid = JSON.stringify({
        overallTrust: 0.75,
        domainTrust: { cooperation: 0.8 },
        confidence: 0.9,
        factors: [],
        history: [],
        riskFactors: [],
        trajectory: 'improving',
      });

      const result = (rm as any).parseTrustAssessment(
        valid,
        'agent-7',
        'cooperation'
      );

      expect(result.overallTrust).toBe(0.75);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('SocialLearner.parseStrategyIdentification', () => {
    it('logs `social_strategy_parse_failed` when the response is malformed JSON', () => {
      const sl = makeSocialLearner();
      const malformed = '{malformed: no quotes here}';
      const fakeObservations = [
        { id: 'obs-1', behavior: 'trading' },
        { id: 'obs-2', behavior: 'sharing' },
      ];

      const result = (sl as any).parseStrategyIdentification(
        malformed,
        fakeObservations
      );

      // Fallback returned from createEmptyStrategyIdentification.
      expect(result).toBeDefined();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const [message, context] = warnSpy.mock.calls[0];
      expect(message).toContain('strategy identification');
      expect(context).toMatchObject({
        event: 'social_strategy_parse_failed',
        tags: ['social-cognition', 'parse', 'warn'],
      });
      // observationCount is populated from the array we passed in.
      expect(context.fields.observationCount).toBe(2);
      expect(typeof context.fields.error).toBe('string');
      expect(context.fields.responseSnippet).toContain('malformed');
    });
  });

  describe('TheoryOfMindEngine.parseMentalStateInference', () => {
    it('logs `tom_mental_state_parse_failed` AND fires emitParseFailedEvent when the response is malformed JSON', () => {
      const tom = makeTheoryOfMindEngine();
      const emitSpy = vi.fn();
      tom.emitParseFailedEvent = emitSpy;

      // Response contains no valid JSON object — extractJson may throw
      // or return a non-JSON string; either way JSON.parse fails and
      // we land in the catch.
      const malformed =
        'The agent seems happy but I cannot format this as JSON properly';

      const result = (tom as any).parseMentalStateInference(
        malformed,
        'agent-13'
      );

      // 1. Fallback returned from createEmptyMentalStateInference.
      expect(result).toBeDefined();
      expect(result.agentId).toBe('agent-13');
      // 2. The structured logger fired.
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const [message, context] = warnSpy.mock.calls[0];
      expect(message).toContain('mental state inference');
      expect(context).toMatchObject({
        event: 'tom_mental_state_parse_failed',
        tags: ['social-cognition', 'theory-of-mind', 'parse', 'warn'],
      });
      expect(context.fields.agentId).toBe('agent-13');
      expect(typeof context.fields.error).toBe('string');
      // 3. CRITICAL: the existing emitParseFailedEvent hook still fires.
      // This hook predates the logger migration and is consumed by a
      // separate subscriber pathway; both signals must coexist.
      expect(emitSpy).toHaveBeenCalledTimes(1);
      expect(emitSpy).toHaveBeenCalledWith(
        'parseMentalStateInference',
        malformed,
        expect.any(Error)
      );
    });
  });
});
