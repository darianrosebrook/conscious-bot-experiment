/**
 * Eval Orchestrator for Thought Evaluation
 *
 * Orchestrates eval runs by calling PRODUCTION code (LF-4).
 * This is NOT a parallel implementation — it imports and uses
 * the actual reasoning surface from production.
 *
 * @author @darianrosebrook
 */

import * as fs from 'fs';
import * as path from 'path';

// Import PRODUCTION reasoning surface (LF-4)
import {
  SURFACE_VERSION,
  SURFACE_DIGESTS,
  renderSituationFrame,
  processLLMOutput,
  deriveEligibility,
  type FrameProfile,
  type FrameContext,
  type GroundingContext,
} from '../../reasoning-surface';

import { ScenarioLoader, type EvalScenario } from './scenario-loader';
import { EvalEventEmitter, buildProductionSurfacePayload, buildScenarioStartedPayload, buildScenarioResultPayload, buildModePayload, buildSuiteLoadedPayload } from './event-emitter';
import { MetricsCollector, countAvailableFacts, type ScenarioResult } from './metrics-collector';
import { getFrameProfile, getFrameProfileSummary, type FrameProfileName } from './frame-profiles';
import { getSamplerProfile, getSamplerProfileSummary, type SamplerProfileName } from './sampler-profiles';
import { createResultBundle, generateRunId, buildOutputDir, type EvalSummary } from './result-bundle';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for an eval run.
 */
export interface EvalConfig {
  /** Path to the suite JSONL file */
  suitePath: string;
  /** Frame profile to use */
  frameProfile: FrameProfileName;
  /** Sampler profile to use */
  samplerProfile: SamplerProfileName;
  /** Output directory for artifacts */
  outputDir: string;
  /** Eval mode: thought_only or end_to_end */
  mode: 'thought_only' | 'end_to_end';
  /** LLM model ID (optional) */
  modelId?: string;
  /** Custom LLM generator function (for testing) */
  llmGenerator?: (prompt: string, config: LLMConfig) => Promise<string>;
}

/**
 * LLM configuration from sampler profile.
 */
export interface LLMConfig {
  temperature: number;
  topP: number;
  maxTokens: number;
}

/**
 * Result of an eval run.
 */
export interface EvalRunResult {
  success: boolean;
  runId: string;
  bundleId: string;
  summaryPath: string;
  eventsPath: string;
  metrics: {
    action_rate: number;
    compulsion_count: number;
    inertia_count: number;
    hallucination_count: number;
  };
  passed: boolean;
  errors: string[];
}

// ============================================================================
// Default LLM Generator (for thought_only mode)
// ============================================================================

/**
 * Default LLM generator that returns a mock response.
 * In production, this would be replaced with actual LLM calls.
 */
async function defaultLLMGenerator(prompt: string, _config: LLMConfig): Promise<string> {
  // For thought_only mode without a real LLM, return a simple observation
  // This allows testing the harness infrastructure without LLM dependency
  return `I observe the current situation and take note of my surroundings.`;
}

// ============================================================================
// Eval Orchestrator
// ============================================================================

/**
 * Run an evaluation suite.
 *
 * This orchestrator:
 * 1. Loads scenarios from JSONL
 * 2. Renders situation frames using PRODUCTION code
 * 3. Generates thoughts (via LLM or mock)
 * 4. Processes outputs using PRODUCTION reasoning surface
 * 5. Computes metrics and writes results
 *
 * @param config - Eval configuration
 * @returns Eval run result
 */
export async function runEval(config: EvalConfig): Promise<EvalRunResult> {
  const runId = generateRunId();
  const errors: string[] = [];

  // Setup output directory
  const suiteId = path.basename(config.suitePath, '.jsonl');
  const outputDir = buildOutputDir(
    config.outputDir,
    suiteId,
    config.frameProfile,
    config.samplerProfile,
    runId
  );
  fs.mkdirSync(outputDir, { recursive: true });

  // Initialize components
  const eventEmitter = new EvalEventEmitter(outputDir, {
    run_id: runId,
    mode: config.mode,
    suite_id: suiteId,
    frame_profile: config.frameProfile,
    sampler_profile: config.samplerProfile,
    model_id: config.modelId,
  });

  const metricsCollector = new MetricsCollector();
  const scenarioLoader = new ScenarioLoader();

  // Get profiles
  const frameProfile = getFrameProfile(config.frameProfile);
  const samplerProfile = getSamplerProfile(config.samplerProfile);

  // Use provided LLM generator or default
  const llmGenerator = config.llmGenerator ?? defaultLLMGenerator;

  const startedAt = new Date();

  try {
    // Emit mode event
    eventEmitter.emit('eval_mode', buildModePayload(
      config.mode,
      config.mode === 'end_to_end',
      true
    ));

    // Emit production surface event (AC-EV-04)
    eventEmitter.emit('eval_production_surface', buildProductionSurfacePayload(
      SURFACE_VERSION,
      SURFACE_DIGESTS
    ));

    // Load suite
    const loadResult = scenarioLoader.loadSuite(config.suitePath);

    // Emit suite loaded event (AC-EV-01)
    eventEmitter.emit('eval_suite_loaded', buildSuiteLoadedPayload(
      loadResult.path,
      loadResult.lineCount,
      loadResult.sha256
    ));

    if (!loadResult.success) {
      // Emit errors for each invalid line (AC-EV-02)
      for (const [line, lineErrors] of loadResult.errors) {
        eventEmitter.emit('eval_suite_invalid', {
          path: loadResult.path,
          line,
          errors: lineErrors,
        });
        errors.push(`Line ${line}: ${lineErrors.map(e => e.message).join('; ')}`);
      }

      if (loadResult.scenarios.length === 0) {
        throw new Error(`No valid scenarios in suite: ${config.suitePath}`);
      }
    }

    // Get oracle version from first scenario
    const oracleVersion = loadResult.scenarios[0]?.oracle.oracle_version ?? 'v1';
    eventEmitter.updateRunContext({ oracle_version: oracleVersion });

    // Run each scenario
    for (const scenario of loadResult.scenarios) {
      try {
        const result = await runScenario(
          scenario,
          frameProfile,
          samplerProfile,
          llmGenerator,
          eventEmitter,
          metricsCollector
        );

        metricsCollector.record(result);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push(`Scenario ${scenario.scenario_id}: ${errorMsg}`);
        eventEmitter.emitError(err instanceof Error ? err : new Error(errorMsg), {
          scenario_id: scenario.scenario_id,
        });

        // Record as failed scenario
        metricsCollector.record({
          scenario_id: scenario.scenario_id,
          affordance: scenario.stimulus.action_affordance,
          action_taken: false,
          grounding_pass: null,
          referenced_facts_count: 0,
          available_facts_count: 0,
          is_repetition: false,
          has_hallucination: false,
          violations: [],
          latency_ms: 0,
          error: errorMsg,
        });
      }
    }

    // Compute metrics
    const metrics = metricsCollector.computeMetrics();
    const passCriteria = metricsCollector.computePassCriteria(metrics);
    const scenarioSummaries = metricsCollector.getScenarioSummaries();

    const completedAt = new Date();

    // Build summary
    const summary: EvalSummary = {
      run: {
        run_id: runId,
        mode: config.mode,
        suite_id: suiteId,
        suite_sha256: loadResult.sha256,
        frame_profile: config.frameProfile,
        sampler_profile: config.samplerProfile,
        model_id: config.modelId,
        oracle_version: oracleVersion,
        production_surface_version: SURFACE_VERSION,
        production_surface_digests: SURFACE_DIGESTS,
        started_at: startedAt.toISOString(),
        completed_at: completedAt.toISOString(),
        duration_ms: completedAt.getTime() - startedAt.getTime(),
      },
      metrics,
      pass: passCriteria,
      scenarios: scenarioSummaries,
    };

    // Emit summary event (AC-EV-07)
    eventEmitter.emit('eval_summary', {
      metrics,
      pass: passCriteria,
    });

    // Create result bundle
    const bundle = createResultBundle(summary, outputDir);

    // Close event emitter
    await eventEmitter.close();

    return {
      success: errors.length === 0,
      runId,
      bundleId: bundle.bundle_id,
      summaryPath: bundle.output_path,
      eventsPath: eventEmitter.getOutputPath(),
      metrics: {
        action_rate: metrics.action_rate,
        compulsion_count: metrics.compulsion_count,
        inertia_count: metrics.inertia_count,
        hallucination_count: metrics.hallucination_count,
      },
      passed: passCriteria.overall,
      errors,
    };

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    errors.push(errorMsg);
    eventEmitter.emitError(err instanceof Error ? err : new Error(errorMsg));
    await eventEmitter.close();

    return {
      success: false,
      runId,
      bundleId: '',
      summaryPath: '',
      eventsPath: eventEmitter.getOutputPath(),
      metrics: {
        action_rate: 0,
        compulsion_count: 0,
        inertia_count: 0,
        hallucination_count: 0,
      },
      passed: false,
      errors,
    };
  }
}

/**
 * Run a single scenario.
 */
async function runScenario(
  scenario: EvalScenario,
  frameProfile: FrameProfile,
  samplerProfile: { temperature: number; topP: number; maxTokens: number; name: string },
  llmGenerator: (prompt: string, config: LLMConfig) => Promise<string>,
  eventEmitter: EvalEventEmitter,
  metricsCollector: MetricsCollector
): Promise<ScenarioResult> {
  const startTime = Date.now();

  // Emit scenario started event (AC-EV-03)
  eventEmitter.emit('eval_scenario_started', buildScenarioStartedPayload(
    scenario.scenario_id,
    getFrameProfileSummary(frameProfile),
    getSamplerProfileSummary(samplerProfile as any)
  ));

  // Convert scenario frame to FrameContext for production code
  const frameContext: FrameContext = {
    bot: {
      position: scenario.frame.facts.bot.position,
      health: scenario.frame.facts.bot.health,
      hunger: scenario.frame.facts.bot.hunger,
      inventory: scenario.frame.facts.bot.inventorySummary,
      timeOfDay: scenario.frame.facts.bot.timeOfDay,
      threatLevel: scenario.frame.facts.bot.threatLevel as any,
    },
    world: {
      biome: scenario.frame.facts.world.biome,
      nearbyEntities: scenario.frame.facts.world.nearbyEntities.map(e => ({
        kind: e.kind,
        count: e.count,
        distanceMin: e.distanceMin,
        hostile: e.hostile,
      })),
    },
    deltas: scenario.frame.deltas.map(d => ({
      type: d.type as any,
      value: d.value as any,
    })),
    memory: [
      ...scenario.frame.memory.episodic.map(m => ({
        type: 'episodic' as const,
        text: m.text,
        timestampMs: m.timestampMs,
      })),
      ...scenario.frame.memory.semantic.map(m => ({
        type: 'semantic' as const,
        key: m.key,
        text: m.text,
      })),
    ],
  };

  // Render situation frame using PRODUCTION code
  const situationFrame = renderSituationFrame(frameContext, frameProfile);

  // Build prompt (simple wrapper around frame)
  const prompt = buildPrompt(situationFrame.text);

  // Generate thought via LLM
  const llmConfig: LLMConfig = {
    temperature: samplerProfile.temperature,
    topP: samplerProfile.topP,
    maxTokens: samplerProfile.maxTokens,
  };
  const rawOutput = await llmGenerator(prompt, llmConfig);

  // Build grounding context from scenario
  const groundingContext: GroundingContext = {
    bot: {
      health: scenario.frame.facts.bot.health,
      hunger: scenario.frame.facts.bot.hunger,
      inventory: scenario.frame.facts.bot.inventorySummary.map(i => ({
        name: i.item,
        count: i.count,
      })),
      position: scenario.frame.facts.bot.position,
    },
    world: {
      biome: scenario.frame.facts.world.biome,
      nearbyEntities: scenario.frame.facts.world.nearbyEntities.map(e => ({
        kind: e.kind,
        count: e.count,
        distance: e.distanceMin,
      })),
    },
  };

  // Process output using PRODUCTION reasoning surface
  const result = processLLMOutput(rawOutput, groundingContext);

  // Check for repetition
  const isRepetition = metricsCollector.checkRepetition(result.text);

  // Count available facts
  const availableFacts = countAvailableFacts(scenario.frame);

  // Determine action taken (goal present AND grounding passed)
  const actionTaken = result.eligibility.convertEligible;

  // Check for hallucinations (fabricated entities/items/locations)
  const hasHallucination = result.grounding?.violations.some(
    v => v.type === 'fabricated_entity' || v.type === 'fabricated_item' || v.type === 'fabricated_location'
  ) ?? false;

  const latencyMs = Date.now() - startTime;

  // Build checks array for event
  const checks = [
    {
      check_id: 'no_fabrication',
      pass: !hasHallucination,
      reason: hasHallucination ? 'Fabricated facts detected' : 'No fabrication',
    },
    {
      check_id: 'eligibility_derived',
      pass: result.eligibility.derived === true,
      reason: result.eligibility.reasoning,
    },
  ];

  // Emit scenario result event (AC-EV-05, AC-EV-06)
  eventEmitter.emit('eval_scenario_result', buildScenarioResultPayload(
    scenario.scenario_id,
    {
      text: result.text,
      extracted_goal: result.goal ? {
        present: true,
        action: result.goal.action,
        target: result.goal.target,
      } : { present: false },
      grounding: result.grounding ? {
        pass: result.grounding.pass,
        reason: result.grounding.reason,
        referenced_facts: result.grounding.referencedFacts,
        violations: result.grounding.violations,
      } : null,
      convert_eligible: result.eligibility.convertEligible,
      derived: true,
    },
    checks,
    latencyMs
  ));

  return {
    scenario_id: scenario.scenario_id,
    affordance: scenario.stimulus.action_affordance,
    action_taken: actionTaken,
    grounding_pass: result.grounding?.pass ?? null,
    referenced_facts_count: result.grounding?.referencedFacts.length ?? 0,
    available_facts_count: availableFacts,
    is_repetition: isRepetition,
    has_hallucination: hasHallucination,
    violations: result.grounding?.violations.map(v => ({
      type: v.type,
      description: v.description,
    })) ?? [],
    latency_ms: latencyMs,
  };
}

/**
 * Build prompt for LLM from situation frame.
 * Uses the same prompt structure as keep-alive intention check.
 */
function buildPrompt(frameText: string): string {
  return `You are observing the current situation. Based ONLY on the facts provided:

${frameText}

Instructions:
- If you have no current intention, simply acknowledge the situation. This is the expected default.
- If you genuinely have an intention given these facts (not suggested by this prompt), express it using:
  [GOAL: action="<verb>" target="<noun>" reason="<why>"]

Important:
- Do NOT propose options or candidate actions. Only state an intention you already have.
- Observation without action is valid and expected in most situations.
- Never fabricate facts not present in the situation frame.`;
}

// ============================================================================
// Exports
// ============================================================================

export {
  SURFACE_VERSION,
  SURFACE_DIGESTS,
};
