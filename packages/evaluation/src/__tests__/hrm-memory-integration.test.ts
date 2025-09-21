import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ScenarioManager } from '../scenarios/scenario-manager';
import { PerformanceAnalyzer } from '../metrics/performance-analyzer';
import { createMemoryFixture, createMemorySeed } from '../testing/postgres-test-container';
import type { AgentConfig, Scenario } from '../types';

const HOOK_TIMEOUT = 120_000;

describe('HRM Evaluation with Memory Integration', () => {
  let fixture: Awaited<ReturnType<typeof createMemoryFixture>>;

  beforeAll(async () => {
    fixture = await createMemoryFixture(
      [
        createMemorySeed(
          'Optimal mining practice: use an iron pickaxe for iron ore to maximize yield and avoid wasting the block.'
        ),
        createMemorySeed(
          'When operating in mountainous biomes, prioritize iron pickaxe readiness before exploring resource veins.'
        ),
      ],
      { worldSeed: 777 }
    );
  }, HOOK_TIMEOUT);

  afterAll(async () => {
    await fixture.stop();
  }, HOOK_TIMEOUT);

  it(
    'retrieves seeded memories during HRM planning flow',
    async () => {
      const scenarioManager = new ScenarioManager({
        memorySystem: fixture.memorySystem,
      });

      const analyzer = new PerformanceAnalyzer();

      const memoryDrivenScenario: Scenario = {
        id: 'memory_guided_tool_selection',
        name: 'Tool Selection with Memory Support',
        description:
          'Agent should recall prior knowledge to choose the optimal mining tool.',
        domain: 'resource',
        complexity: 'intermediate',
        expectedDuration: 5000,
        initialState: {
          position: [0, 0, 0],
          resources: { iron_pickaxe: 1, stone_pickaxe: 1 },
          memoryQuery: 'optimal tool for iron ore in mountains',
          biome: 'mountains',
        },
        goalConditions: ['select_optimal_tool'],
        constraints: ['tool_efficiency'],
        resources: { time: 30 },
        successCriteria: [
          { metric: 'success_rate', threshold: 0.5, weight: 0.5 },
          { metric: 'planning_quality', threshold: 0.5, weight: 0.5 },
        ],
        tags: ['memory', 'planning'],
        difficulty: 4,
        estimatedSteps: 3,
        requiresMemory: true,
        requiresPlanning: true,
        requiresLearning: false,
        timeLimit: 15000,
        maxAttempts: 1,
        allowPartialCredit: true,
      };

      scenarioManager.registerScenario(memoryDrivenScenario);
      analyzer.registerScenario(memoryDrivenScenario);

      const agentConfig: AgentConfig = {
        id: 'hrm-memory-agent',
        name: 'HRM Memory Agent',
        version: '1.0.0',
        planningConfig: {
          router: {
            hrmLatencyTarget: 120,
            llmLatencyTarget: 450,
            emergencyLatencyLimit: 80,
          },
          planner: {
            maxRefinements: 3,
            qualityThreshold: 0.6,
          },
        },
        memoryConfig: {},
        cognitionConfig: {},
        enabledFeatures: ['hrm_planning'],
        disabledFeatures: [],
      };

      const session = await scenarioManager.executeScenario(
        memoryDrivenScenario.id,
        agentConfig
      );

      expect(session.steps.length).toBeGreaterThan(0);

      const planningStep = session.steps.find(
        (step) => step.action === 'planning'
      );

      expect(planningStep).toBeDefined();
      expect(planningStep?.parameters.memory).toBeDefined();
      expect(planningStep?.parameters.memory?.length).toBeGreaterThan(0);

      const memorySnippet = planningStep?.parameters.memory?.[0]?.content || '';
      expect(memorySnippet.toLowerCase()).toContain('iron pickaxe');

      // Performance analyzer should register memory utilization > 0
      const results = analyzer.generateEvaluationResults(session);
      expect(results.cognitivePerformance.memoryUtilization).toBeGreaterThan(0);
    },
    HOOK_TIMEOUT
  );
});
