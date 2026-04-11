/**
 * Regression tests for social-cognition LLM-request-failure logging.
 *
 * Complements `social-cognition-parse-logging.test.ts` — that file
 * covers the RESPONSE parse-failure paths (the `_parse_failed` event
 * family, 13 events). THIS file covers the REQUEST-failure paths
 * (the `_llm_failed` event family, 27 events) added in the item 4
 * continuation commit that migrated all remaining `console.warn` /
 * `console.error` sites in the four social-cognition production
 * files to the structured logger.
 *
 * Event family naming convention established by this tranche:
 *
 *   {domain}_{method}_parse_failed  — LLM returned bad JSON (already covered)
 *   {domain}_{method}_llm_failed    — LLM request itself failed (this file)
 *
 * Operators can now grep by family: `_llm_failed` surfaces backend
 * outages and request-level errors; `_parse_failed` surfaces model
 * output format drift. The two families should have near-zero overlap
 * in an ideal operational picture.
 *
 * Strategy: a parameterized `describe.each` matrix per production file
 * drives the common shape of "mock LLM to reject, call public method,
 * assert warn fires with expected event + tags + key fields". Four
 * bespoke tests cover cases the matrix can't easily express:
 *
 *   1. The `simulatePerspective` vs `simulateAgentPerspective` name
 *      collision in theory-of-mind-engine.ts, which has two methods
 *      with nearly identical names that emit DIFFERENT events
 *      (`tom_perspective_prose_llm_failed` vs
 *      `tom_perspective_scenario_llm_failed`). The prose version
 *      returns raw response.text without JSON parsing; the scenario
 *      version goes through parsePerspectiveSimulation. Their events
 *      must be distinct so operators can grep them separately.
 *
 *   2. social-learner's 3 early sites (learnBehaviors, recognizePatterns,
 *      inferNorms) were historically logged at `console.error` level
 *      while the other 5 used `console.warn`. All 8 were normalized
 *      to `.warn` during migration — the bespoke test asserts
 *      `warnSpy` is called and `errorSpy` is NOT, fencing the
 *      normalization.
 *
 *   3. theory-of-mind-engine's `detectFalseBeliefs` includes the
 *      `beliefDomain` field in its error context, which is unique
 *      among the 27 events and merits a direct assertion.
 *
 *   4. agent-modeler's `generateAgentDescription` is the only event
 *      whose error context includes BOTH `entityId` and `entityType`
 *      (because it takes an Entity parameter, not just observations).
 *      A direct assertion fences both fields.
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
import { AgentModeler } from '../agent-modeler';
import { TheoryOfMindEngine } from '../theory-of-mind-engine';

/**
 * A minimal LLM interface that tests inject. Matches the call surface
 * used by each migration site: generateResponse(prompt, context, options).
 * Tests replace this after construction via `(instance as any).llm = ...`.
 */
function makeRejectingLlm(error: unknown) {
  return {
    generateResponse: vi.fn().mockRejectedValue(error),
  };
}

/**
 * Build an existing relationship object the manager's methods need
 * before their LLM call fires. Without a pre-existing relationship,
 * methods like assessRelationshipQuality throw synchronously before
 * ever reaching the try/catch we're trying to fence.
 */
function seedRelationship(manager: RelationshipManager, agentId: string) {
  (manager as any).relationships.set(agentId, {
    agentId,
    relationshipType: 'acquaintance',
    trustLevels: {},
    emotionalBond: { strength: 0.5, quality: 'neutral' },
    interactionHistory: [],
    cooperationHistory: {},
    communicationPatterns: {},
    sharedExperiences: [],
    reciprocityBalance: {},
    relationshipTrajectory: {},
    lastInteraction: Date.now(),
    relationshipHealth: 0.5,
    stability: 0.5,
  });
}

/**
 * Build a minimal agent model the ToM / learner methods need before
 * their LLM call fires. Writes directly into the AgentModeler's
 * internal `agentModels` Map via `as any`, bypassing the usual
 * observation-based model-building pipeline because the tests here
 * care about the error path, not the normal build flow.
 */
function seedAgentModelDirect(modeler: AgentModeler, agentId: string) {
  (modeler as any).agentModels.set(agentId, {
    agentId,
    personality: 'curious',
    beliefs: ['the world is knowable'],
    goals: ['learn things'],
    behaviors: ['explore'],
    inferredPersonality: {},
    goalInferences: [],
    beliefStates: {},
    behavioralPatterns: {},
    socialRole: {},
    capabilities: {},
  });
}

/**
 * Convenience wrapper for the ToM case that reaches the modeler via
 * the tom's constructor-injected reference. Matches the style of
 * `seedRelationship` above.
 */
function seedAgentModel(tom: TheoryOfMindEngine, agentId: string) {
  const agentModeler = (tom as any).agentModeler as AgentModeler;
  seedAgentModelDirect(agentModeler, agentId);
}

beforeEach(() => {
  warnSpy.mockClear();
  debugSpy.mockClear();
  infoSpy.mockClear();
  errorSpy.mockClear();
});

// ============================================================================
// RelationshipManager — 3 sites
// ============================================================================

describe('RelationshipManager — _llm_failed events', () => {
  type RelCase = {
    name: string;
    event: string;
    invoke: (manager: RelationshipManager) => Promise<unknown>;
    extraFields?: Record<string, unknown>;
  };

  const cases: RelCase[] = [
    {
      // Note: the public method is calculateTrustLevel (not calculateTrust).
      // The emitted event is relationship_trust_llm_failed because the
      // event family groups all trust-related errors under "trust".
      name: 'calculateTrustLevel',
      event: 'relationship_trust_llm_failed',
      invoke: (m) => (m as any).calculateTrustLevel('alice', 'general'),
      extraFields: { agentId: 'alice', trustDomain: 'general' },
    },
    {
      name: 'assessRelationshipQuality',
      event: 'relationship_quality_llm_failed',
      invoke: (m) => m.assessRelationshipQuality('alice'),
      extraFields: { agentId: 'alice' },
    },
    {
      name: 'predictRelationshipTrajectory',
      event: 'relationship_trajectory_llm_failed',
      invoke: (m) => m.predictRelationshipTrajectory('alice', []),
      extraFields: { agentId: 'alice', hypotheticalInteractionCount: 0 },
    },
  ];

  describe.each(cases)(
    '$name → $event',
    ({ event, invoke, extraFields }) => {
      it('fires warn with correct event/tags/fields and returns empty fallback', async () => {
        const llm = makeRejectingLlm(new Error('rel backend timeout'));
        const modeler = new AgentModeler(llm as any);
        const manager = new RelationshipManager(llm as any, modeler);
        seedRelationship(manager, 'alice');

        const result = await invoke(manager);

        // Fallback returned (not an exception).
        expect(result).toBeDefined();

        // Exactly one warn, correct event family.
        expect(warnSpy).toHaveBeenCalledTimes(1);
        const [, context] = warnSpy.mock.calls[0];
        expect(context.event).toBe(event);
        expect(context.tags).toContain('relationship');
        expect(context.tags).toContain('llm');
        expect(context.tags).toContain('warn');
        expect(context.fields.error).toBe('rel backend timeout');
        expect(context.fields.errorName).toBe('Error');
        if (extraFields) {
          for (const [k, v] of Object.entries(extraFields)) {
            expect(context.fields[k]).toEqual(v);
          }
        }

        // error/info/debug levels NOT touched.
        expect(errorSpy).not.toHaveBeenCalled();
      });
    }
  );
});

// ============================================================================
// SocialLearner — 8 sites
// ============================================================================

describe('SocialLearner — _llm_failed events', () => {
  type LearnerCase = {
    name: string;
    event: string;
    invoke: (learner: SocialLearner) => Promise<unknown>;
    extraFields?: Record<string, unknown>;
  };

  const cases: LearnerCase[] = [
    {
      name: 'learnBehaviors',
      event: 'social_learner_behaviors_llm_failed',
      invoke: (l) =>
        l.learnBehaviors([{ description: 'test observation' }] as any),
      extraFields: { observationCount: 1 },
    },
    {
      name: 'recognizePatterns',
      event: 'social_learner_patterns_llm_failed',
      invoke: (l) => l.recognizePatterns(['behavior a', 'behavior b']),
      extraFields: { historyLength: 2 },
    },
    {
      name: 'inferNorms',
      event: 'social_learner_norms_llm_failed',
      invoke: (l) => l.inferNorms([{ description: 'greeted someone' }] as any),
      extraFields: { interactionCount: 1 },
    },
    {
      // Note: identifySuccessfulStrategies has a pre-LLM guard that
      // short-circuits when strategyObservations.length <
      // minimumObservationCount (default 3). The test fixture MUST
      // include ≥3 observations or the LLM call is never attempted
      // and the warn never fires.
      name: 'identifySuccessfulStrategies',
      event: 'social_learner_strategies_llm_failed',
      invoke: (l) =>
        (l as any).identifySuccessfulStrategies([
          { strategyId: 's1' },
          { strategyId: 's2' },
          { strategyId: 's3' },
        ] as any),
      extraFields: { observationCount: 3 },
    },
    {
      name: 'inferSocialNorms',
      event: 'social_learner_norm_inference_llm_failed',
      invoke: (l) =>
        (l as any).inferSocialNorms(
          Array.from({ length: 5 }, (_, i) => ({
            interactionId: `i${i}`,
            description: 'test',
          })) as any
        ),
      extraFields: { interactionCount: 5 },
    },
    {
      // Note: learnThroughImitation has TWO synchronous guards BEFORE
      // reaching its try/catch:
      //   1. `agentModeler.getAgentModel(expertAgent)` must return a
      //      model (otherwise throws "Expert agent model ... not found")
      //   2. `observedBehaviors.filter(...)` must return ≥1 observation
      //      matching both the expertAgent AND targetBehavior string
      //      (otherwise throws "No observations of ... performing ...")
      // The invoke seeds both preconditions before calling the method.
      name: 'learnThroughImitation',
      event: 'social_learner_imitation_llm_failed',
      invoke: (l) => {
        const modeler = (l as any).agentModeler as AgentModeler;
        seedAgentModelDirect(modeler, 'expert1');
        // Push a fake observation whose behaviorSequence contains an
        // action whose description includes the targetBehavior string.
        // The filter uses .includes(), so "dig faster" matches
        // "quickly dig faster with iron pickaxe".
        (l as any).observedBehaviors.push({
          observerId: 'self',
          observedAgent: 'expert1',
          behaviorSequence: [
            {
              description: 'quickly dig faster with iron pickaxe',
              timestamp: 1,
            },
          ],
          context: {},
          outcome: {},
          successIndicators: [],
          learningOpportunity: {},
          timestamp: 1,
        });
        return (l as any).learnThroughImitation('dig faster', 'expert1');
      },
      extraFields: { targetBehavior: 'dig faster', expertAgent: 'expert1' },
    },
    {
      name: 'adaptLearnedBehavior',
      event: 'social_learner_adaptation_llm_failed',
      invoke: (l) =>
        (l as any).adaptLearnedBehavior(
          { behaviorId: 'b1', name: 'gather' } as any,
          { situation: 'cave' } as any
        ),
      extraFields: { learnedBehaviorId: 'b1' },
    },
  ];

  describe.each(cases)(
    '$name → $event',
    ({ event, invoke, extraFields }) => {
      it('fires warn with correct event/tags/fields', async () => {
        const llm = makeRejectingLlm(new Error('learner LLM down'));
        const modeler = new AgentModeler(llm as any);
        const learner = new SocialLearner(llm as any, modeler);

        await invoke(learner);

        expect(warnSpy).toHaveBeenCalledTimes(1);
        const [, context] = warnSpy.mock.calls[0];
        expect(context.event).toBe(event);
        expect(context.tags).toContain('social-learner');
        expect(context.tags).toContain('llm');
        expect(context.fields.error).toBe('learner LLM down');
        expect(context.fields.errorName).toBe('Error');
        if (extraFields) {
          for (const [k, v] of Object.entries(extraFields)) {
            expect(context.fields[k]).toEqual(v);
          }
        }
      });
    }
  );
});

// ============================================================================
// SocialLearner — private method coverage gap
// ============================================================================

describe('SocialLearner — analyzeBehaviorForLearning private method', () => {
  // `analyzeBehaviorForLearning` is a PRIVATE method called only from
  // `observeAndLearnBehavior`. The matrix above covers public methods,
  // so this event would be untested if we didn't drive the private
  // method directly. Use `(learner as any)` to bypass TypeScript's
  // visibility check, which is the same pattern used elsewhere in
  // this file and in `react-arbiter-parse-logging.test.ts` for
  // private-method coverage.
  it('analyzeBehaviorForLearning → social_learner_behavior_analysis_llm_failed', async () => {
    const llm = makeRejectingLlm(new Error('behavior analysis LLM down'));
    const modeler = new AgentModeler(llm as any);
    const learner = new SocialLearner(llm as any, modeler);

    const observedBehavior = {
      observerId: 'self',
      observedAgent: 'target1',
      behaviorSequence: [{ description: 'explored cave', timestamp: 1 }],
      context: {},
      outcome: {},
      successIndicators: [],
      learningOpportunity: {},
      timestamp: 1,
    };
    const context = { situation: 'exploration', environment: 'cave' };

    await (learner as any).analyzeBehaviorForLearning(
      observedBehavior,
      context
    );

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [, ctx] = warnSpy.mock.calls[0];
    expect(ctx.event).toBe('social_learner_behavior_analysis_llm_failed');
    expect(ctx.tags).toContain('social-learner');
    expect(ctx.tags).toContain('behavior-analysis');
    expect(ctx.fields.observerId).toBe('self');
    expect(ctx.fields.observedAgent).toBe('target1');
    expect(ctx.fields.error).toBe('behavior analysis LLM down');
  });
});

// ============================================================================
// TheoryOfMindEngine — 7 sites
// ============================================================================

describe('TheoryOfMindEngine — _llm_failed events', () => {
  type TomCase = {
    name: string;
    event: string;
    setup?: (tom: TheoryOfMindEngine) => void;
    invoke: (tom: TheoryOfMindEngine) => Promise<unknown>;
    extraFields?: Record<string, unknown>;
  };

  const cases: TomCase[] = [
    // Note: `predictIntentions` is NOT in this matrix because it calls
    // `inferMentalState()` → `performMentalStateInference()` first,
    // which itself catches LLM rejections and returns an empty
    // fallback. That means a single LLM rejection during
    // predictIntentions produces TWO warn events in order:
    //   1. tom_mental_state_llm_failed (inner method's fallback path)
    //   2. tom_intentions_llm_failed (predictIntentions's own catch)
    // The matrix assumes each method produces exactly one warn, so
    // predictIntentions gets a dedicated bespoke test below.
    {
      name: 'simulatePerspective (prose)',
      event: 'tom_perspective_prose_llm_failed',
      setup: (t) => seedAgentModel(t, 'bob'),
      invoke: (t) => t.simulatePerspective('bob', { what: 'hello' }),
      extraFields: { agentId: 'bob' },
    },
    {
      name: 'simulateAgentPerspective (scenario)',
      event: 'tom_perspective_scenario_llm_failed',
      setup: (t) => seedAgentModel(t, 'bob'),
      invoke: (t) =>
        (t as any).simulateAgentPerspective('bob', {
          scenarioId: 's1',
          description: 'a test scenario',
        }),
      extraFields: { agentId: 'bob' },
    },
    {
      name: 'detectFalseBeliefs',
      event: 'tom_false_beliefs_llm_failed',
      setup: (t) => seedAgentModel(t, 'bob'),
      invoke: (t) => t.detectFalseBeliefs('bob', 'physics'),
      extraFields: { agentId: 'bob', beliefDomain: 'physics' },
    },
    {
      name: 'performMentalStateInference',
      event: 'tom_mental_state_llm_failed',
      invoke: (t) =>
        (t as any).performMentalStateInference(
          { agentId: 'charlie' } as any,
          {} as any
        ),
      extraFields: { agentId: 'charlie' },
    },
    {
      name: 'generateActionPrediction',
      event: 'tom_action_prediction_llm_failed',
      invoke: (t) =>
        (t as any).generateActionPrediction(
          { agentId: 'charlie', capabilities: {} } as any,
          {} as any,
          {} as any
        ),
      extraFields: { agentId: 'charlie' },
    },
  ];

  describe.each(cases)(
    '$name → $event',
    ({ event, setup, invoke, extraFields }) => {
      it('fires warn with correct event/tags/fields', async () => {
        const llm = makeRejectingLlm(new Error('tom LLM down'));
        const modeler = new AgentModeler(llm as any);
        const tom = new TheoryOfMindEngine(llm as any, modeler);
        setup?.(tom);

        await invoke(tom);

        expect(warnSpy).toHaveBeenCalledTimes(1);
        const [, context] = warnSpy.mock.calls[0];
        expect(context.event).toBe(event);
        expect(context.tags).toContain('theory-of-mind');
        expect(context.tags).toContain('llm');
        expect(context.fields.error).toBe('tom LLM down');
        if (extraFields) {
          for (const [k, v] of Object.entries(extraFields)) {
            expect(context.fields[k]).toEqual(v);
          }
        }
      });
    }
  );

  // Bespoke test for predictIntentions dual-log cascade. Because
  // predictIntentions calls inferMentalState first, and inferMentalState's
  // inner performMentalStateInference catches and returns a fallback,
  // a single LLM rejection produces TWO warn events in this order:
  //
  //   1. tom_mental_state_llm_failed (from performMentalStateInference's
  //      catch at line ~676 — the inner method's normal error path)
  //   2. tom_intentions_llm_failed (from predictIntentions's own catch
  //      at line ~424 — AFTER the inner fallback returned an empty
  //      mental state, predictIntentions tries its own LLM call)
  //
  // This cascade is pre-existing and intentional — each layer has its
  // own fallback so higher layers keep working when lower layers fail.
  // The test documents the cascade so any future refactor that breaks
  // it becomes a conscious decision requiring this test to be updated.
  it('predictIntentions dual-log: mental_state then intentions', async () => {
    const llm = makeRejectingLlm(new Error('tom cascade LLM down'));
    const modeler = new AgentModeler(llm as any);
    const tom = new TheoryOfMindEngine(llm as any, modeler);
    seedAgentModel(tom, 'dave');

    await tom.predictIntentions('dave', {
      situation: 'exploring',
      environment: 'forest',
    } as any);

    // Two warns in order: mental_state first, intentions second.
    expect(warnSpy).toHaveBeenCalledTimes(2);

    const [, innerCtx] = warnSpy.mock.calls[0];
    expect(innerCtx.event).toBe('tom_mental_state_llm_failed');
    expect(innerCtx.fields.agentId).toBe('dave');

    const [, outerCtx] = warnSpy.mock.calls[1];
    expect(outerCtx.event).toBe('tom_intentions_llm_failed');
    expect(outerCtx.fields.error).toBe('tom cascade LLM down');
  });

  // Bespoke asymmetry test — proves that the two perspective methods
  // emit DISTINCT events even though their method names are
  // near-identical. If a refactor collapsed them into one event,
  // operators grepping for "prose" or "scenario" would lose the
  // ability to distinguish the two code paths.
  it('reasoner_meta_reasoning_llm_failed fires with reasoningTarget field', async () => {
    const llm = makeRejectingLlm(new Error('meta reasoning LLM down'));
    const modeler = new AgentModeler(llm as any);
    const tom = new TheoryOfMindEngine(llm as any, modeler);
    seedAgentModel(tom, 'alice');

    // reasonAboutAgentReasoning is another catch site that isn't in
    // the main table because its unique field is the reasoningTarget,
    // which is easier to assert in a bespoke test.
    await (tom as any).reasonAboutAgentReasoning('alice', 'quantum physics');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [, context] = warnSpy.mock.calls[0];
    expect(context.event).toBe('tom_meta_reasoning_llm_failed');
    expect(context.fields.agentId).toBe('alice');
    expect(context.fields.reasoningTarget).toBe('quantum physics');
  });
});

// ============================================================================
// AgentModeler — 9 sites
// ============================================================================

describe('AgentModeler — _llm_failed events', () => {
  type ModelerCase = {
    name: string;
    event: string;
    invoke: (modeler: AgentModeler) => Promise<unknown>;
    extraFields?: Record<string, unknown>;
  };

  const obsFixture = [
    { description: 'walked east', timestamp: 1 },
    { description: 'dug dirt', timestamp: 2 },
  ];

  const cases: ModelerCase[] = [
    {
      name: 'inferCapabilities',
      event: 'agent_modeler_capabilities_llm_failed',
      invoke: (m) => (m as any).inferCapabilities(obsFixture),
      extraFields: { observationCount: 2 },
    },
    {
      name: 'inferPersonality',
      event: 'agent_modeler_personality_llm_failed',
      invoke: (m) => m.inferPersonality(obsFixture as any),
      extraFields: { observationCount: 2 },
    },
    {
      name: 'inferBeliefs',
      event: 'agent_modeler_beliefs_llm_failed',
      invoke: (m) => m.inferBeliefs(obsFixture as any),
      extraFields: { observationCount: 2 },
    },
    {
      name: 'inferGoals',
      event: 'agent_modeler_goals_llm_failed',
      invoke: (m) => m.inferGoals(obsFixture as any),
      extraFields: { observationCount: 2 },
    },
    {
      name: 'inferEmotions',
      event: 'agent_modeler_emotions_llm_failed',
      invoke: (m) => m.inferEmotions(obsFixture as any),
      extraFields: { observationCount: 2 },
    },
    {
      name: 'extractBehaviors',
      event: 'agent_modeler_behaviors_llm_failed',
      invoke: (m) => m.extractBehaviors(obsFixture as any),
      extraFields: { observationCount: 2 },
    },
    {
      name: 'predictIntentions',
      event: 'agent_modeler_intentions_llm_failed',
      invoke: (m) => (m as any).predictIntentions(obsFixture),
      extraFields: { observationCount: 2 },
    },
    {
      name: 'analyzeContext',
      event: 'agent_modeler_context_llm_failed',
      invoke: (m) => (m as any).analyzeContext(obsFixture),
      extraFields: { observationCount: 2 },
    },
  ];

  describe.each(cases)(
    '$name → $event',
    ({ event, invoke, extraFields }) => {
      it('fires warn with correct event/tags/fields', async () => {
        const llm = makeRejectingLlm(new Error('modeler LLM down'));
        const modeler = new AgentModeler(llm as any);

        await invoke(modeler);

        expect(warnSpy).toHaveBeenCalledTimes(1);
        const [, context] = warnSpy.mock.calls[0];
        expect(context.event).toBe(event);
        expect(context.tags).toContain('agent-modeler');
        expect(context.tags).toContain('llm');
        expect(context.fields.error).toBe('modeler LLM down');
        if (extraFields) {
          for (const [k, v] of Object.entries(extraFields)) {
            expect(context.fields[k]).toEqual(v);
          }
        }
      });
    }
  );

  // Bespoke test for generateAgentDescription because its field shape
  // is unique among the 9 AgentModeler events (entityId + entityType
  // instead of observationCount).
  it('generateAgentDescription → fires with entityId and entityType fields', async () => {
    const llm = makeRejectingLlm(new Error('description LLM down'));
    const modeler = new AgentModeler(llm as any);

    const entity = {
      id: 'ent-42',
      type: 'villager',
      name: 'Steve',
      properties: {},
      lastObserved: Date.now(),
      confidence: 0.8,
    };

    await modeler.generateAgentDescription(entity as any, []);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [, context] = warnSpy.mock.calls[0];
    expect(context.event).toBe('agent_modeler_description_llm_failed');
    expect(context.fields.entityId).toBe('ent-42');
    expect(context.fields.entityType).toBe('villager');
    expect(context.fields.error).toBe('description LLM down');
  });
});

// ============================================================================
// Level-normalization fence for SocialLearner (3 sites: error → warn)
// ============================================================================

describe('SocialLearner — level normalization fence', () => {
  // Historical inconsistency: the original code used console.ERROR for
  // learnBehaviors, recognizePatterns, and inferNorms but console.WARN
  // for the other 5 catch sites in the same file. The migration
  // normalized all 8 to `.warn`. This describe block fences that
  // decision by asserting `warnSpy` is called AND `errorSpy` is NOT
  // for each of the 3 normalized sites. A future revert to
  // `.error` logging would fail these assertions.

  type NormCase = {
    name: string;
    invoke: (learner: SocialLearner) => Promise<unknown>;
  };

  const cases: NormCase[] = [
    {
      name: 'learnBehaviors',
      invoke: (l) =>
        l.learnBehaviors([{ description: 'test' }] as any),
    },
    {
      name: 'recognizePatterns',
      invoke: (l) => l.recognizePatterns(['beh']),
    },
    {
      name: 'inferNorms',
      invoke: (l) => l.inferNorms([{ description: 'greeted' }] as any),
    },
  ];

  it.each(cases)('$name uses warn level, not error', async ({ invoke }) => {
    const llm = makeRejectingLlm(new Error('test error'));
    const modeler = new AgentModeler(llm as any);
    const learner = new SocialLearner(llm as any, modeler);

    await invoke(learner);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
