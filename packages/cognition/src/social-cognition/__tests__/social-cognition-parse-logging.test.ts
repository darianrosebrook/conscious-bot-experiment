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

  // ==========================================================================
  // Parameterized coverage for the 10 near-copy parsers
  // ==========================================================================
  //
  // The 3 parsers tested in bespoke blocks above have unique assertions
  // (agentId/domain fields, observationCount derivation, emitParseFailedEvent
  // coexistence). The remaining 10 parsers share the same shape: try JSON.parse,
  // on catch emit a warn with (a) exactly one call, (b) a specific event name,
  // (c) tags starting with ['social-cognition', 'parse', 'warn'] (with an
  // optional 'theory-of-mind' tag inserted for ToM parsers), (d) a
  // responseSnippet field truncated to ≤200 chars.
  //
  // A describe.each matrix encodes the observability contract as data: one row
  // per parser, with the arguments, expected event, and expected tag shape.
  // If any parser drifts from the contract (renamed event, missing tag,
  // missing snippet), the corresponding row fails with a clear diagnostic.
  //
  // Each row includes a `callParser` thunk that wraps the parser's argument
  // signature, because the parsers take different positional args beyond the
  // response string (agentId, domain, targetBehavior, etc.). Keeping the thunk
  // in the row means the matrix stays flat and new rows are ~10 lines to add.

  interface ParserRow {
    name: string;
    event: string;
    tags: string[];
    makeSubject: () => object;
    callParser: (subject: any, malformed: string) => any;
  }

  const parserRows: ParserRow[] = [
    // ── relationship-manager parsers ──────────────────────────────────────
    {
      name: 'RelationshipManager.parseRelationshipQuality',
      event: 'relationship_quality_parse_failed',
      tags: ['social-cognition', 'parse', 'warn'],
      makeSubject: () => makeRelationshipManager(),
      callParser: (rm, malformed) =>
        rm.parseRelationshipQuality(malformed, {
          agentId: 'agent-rel-quality',
        } as any),
    },
    {
      name: 'RelationshipManager.parseRelationshipTrajectory',
      event: 'relationship_trajectory_parse_failed',
      tags: ['social-cognition', 'parse', 'warn'],
      makeSubject: () => makeRelationshipManager(),
      callParser: (rm, malformed) => rm.parseRelationshipTrajectory(malformed),
    },
    // ── social-learner parsers ────────────────────────────────────────────
    {
      name: 'SocialLearner.parseNormInference',
      event: 'social_norm_parse_failed',
      tags: ['social-cognition', 'parse', 'warn'],
      makeSubject: () => makeSocialLearner(),
      callParser: (sl, malformed) =>
        sl.parseNormInference(malformed, [
          { type: 'greeting' } as any,
          { type: 'trade' } as any,
        ]),
    },
    {
      name: 'SocialLearner.parseImitationLearning',
      event: 'social_imitation_parse_failed',
      tags: ['social-cognition', 'parse', 'warn'],
      makeSubject: () => makeSocialLearner(),
      callParser: (sl, malformed) =>
        sl.parseImitationLearning(malformed, 'fishing', 'expert-agent-1'),
    },
    {
      name: 'SocialLearner.parseBehaviorAdaptation',
      event: 'social_adaptation_parse_failed',
      tags: ['social-cognition', 'parse', 'warn'],
      makeSubject: () => makeSocialLearner(),
      callParser: (sl, malformed) =>
        sl.parseBehaviorAdaptation(
          malformed,
          { id: 'beh-42' } as any,
          { environment: 'plains' } as any
        ),
    },
    {
      name: 'SocialLearner.parseBehaviorAnalysis',
      event: 'social_behavior_analysis_parse_failed',
      tags: ['social-cognition', 'parse', 'warn'],
      makeSubject: () => makeSocialLearner(),
      callParser: (sl, malformed) => sl.parseBehaviorAnalysis(malformed),
    },
    // ── theory-of-mind-engine parsers ─────────────────────────────────────
    {
      name: 'TheoryOfMindEngine.parseActionPrediction',
      event: 'tom_action_prediction_parse_failed',
      tags: ['social-cognition', 'theory-of-mind', 'parse', 'warn'],
      makeSubject: () => makeTheoryOfMindEngine(),
      callParser: (tom, malformed) =>
        tom.parseActionPrediction(malformed, 'agent-pred'),
    },
    {
      name: 'TheoryOfMindEngine.parsePerspectiveSimulation',
      event: 'tom_perspective_parse_failed',
      tags: ['social-cognition', 'theory-of-mind', 'parse', 'warn'],
      makeSubject: () => makeTheoryOfMindEngine(),
      callParser: (tom, malformed) =>
        tom.parsePerspectiveSimulation(malformed, 'agent-persp', {
          id: 'scen-1',
          description: 'being observed',
        } as any),
    },
    {
      name: 'TheoryOfMindEngine.parseFalseBeliefDetection',
      event: 'tom_false_belief_parse_failed',
      tags: ['social-cognition', 'theory-of-mind', 'parse', 'warn'],
      makeSubject: () => makeTheoryOfMindEngine(),
      callParser: (tom, malformed) =>
        tom.parseFalseBeliefDetection(malformed, 'agent-fb', 'safety'),
    },
    {
      name: 'TheoryOfMindEngine.parseMetaReasoning',
      event: 'tom_meta_reasoning_parse_failed',
      tags: ['social-cognition', 'theory-of-mind', 'parse', 'warn'],
      makeSubject: () => makeTheoryOfMindEngine(),
      callParser: (tom, malformed) =>
        tom.parseMetaReasoning(malformed, 'agent-meta', 'navigation-task'),
    },
  ];

  describe('Parameterized matrix — 10 near-copy parsers', () => {
    describe.each(parserRows)(
      '$name',
      ({ event, tags, makeSubject, callParser }) => {
        it(`emits warn with event=${event} on malformed JSON`, () => {
          const subject = makeSubject();
          // The parsers use `JSON.parse(response)` directly; a non-JSON
          // string deterministically throws SyntaxError and hits the catch.
          // (The two ToM parsers that previously used extractJson — inferred
          // from the surrounding code — have already been tested bespoke.
          // These 10 all take the raw response into JSON.parse.)
          const malformed =
            '{malformed response: this is not valid JSON at all}';

          // `result` is the fallback object; we don't assert on its shape
          // because each parser has a different fallback factory and the
          // factory shape is not part of the observability contract we're
          // fencing. We only assert the warn fired correctly.
          const result = (callParser as any)(subject, malformed);
          expect(result).toBeDefined();

          // 1. Exactly one warn call — guards against unconditional logging
          // being added in the happy path, and against duplicate warns on
          // a single failure.
          expect(warnSpy).toHaveBeenCalledTimes(1);

          // 2. The event name matches the contract documented in the
          // 53af145 commit.
          const [, context] = warnSpy.mock.calls[0];
          expect(context).toMatchObject({
            event,
            tags,
          });

          // 3. The fields always include error (string) and responseSnippet
          // (truncated to 200 chars). Per-parser fields like agentId, domain,
          // observationCount are asserted in the bespoke blocks; this matrix
          // only fences the universal contract.
          expect(typeof context.fields.error).toBe('string');
          expect(typeof context.fields.responseSnippet).toBe('string');
          expect(context.fields.responseSnippet.length).toBeLessThanOrEqual(
            200
          );
          expect(context.fields.responseSnippet).toContain('malformed');
        });

        it(`does NOT emit warn on valid-JSON happy path`, () => {
          // Negative control: a well-formed (but minimal) JSON object
          // should parse cleanly and leave warnSpy untouched. The
          // minimal object uses optional-chained accessors inside each
          // parser (`parsed.foo || default`), so even an empty {} is
          // enough to exercise the happy path without triggering the
          // catch.
          const subject = makeSubject();
          const valid = '{}';

          (callParser as any)(subject, valid);

          expect(warnSpy).not.toHaveBeenCalled();
        });
      }
    );
  });
});
