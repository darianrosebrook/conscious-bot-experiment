import { describe, expect, it, vi } from 'vitest';

import { TaskBootstrapper } from '../goal-formulation/task-bootstrapper';
import { GoalType } from '../types';
import type { PlanningContext } from '../integrated-planning-coordinator';

function createPlanningContext(): PlanningContext {
  const timestamp = Date.now();
  return {
    worldState: {
      position: { x: 0, y: 64, z: 0 },
      locationName: 'Base Camp',
    },
    currentState: {
      health: 0.9,
      hunger: 0.6,
      energy: 0.7,
      safety: 0.8,
      curiosity: 0.5,
      social: 0.3,
      achievement: 0.4,
      creativity: 0.5,
      resourceManagement: 0.3,
      shelterStability: 0.6,
      farmHealth: 0.4,
      inventoryOrganization: 0.2,
      worldKnowledge: 0.5,
      redstoneProficiency: 0.1,
      constructionSkill: 0.3,
      environmentalComfort: 0.4,
      mechanicalAptitude: 0.2,
      agriculturalKnowledge: 0.3,
      defensiveReadiness: 0.5,
      timestamp,
    },
    activeGoals: [],
    availableResources: [],
    timeConstraints: {
      urgency: 'medium',
      maxPlanningTime: 250,
    },
    situationalFactors: {
      threatLevel: 0.2,
      opportunityLevel: 0.6,
      socialContext: [],
      environmentalFactors: [],
    },
  };
}

describe('TaskBootstrapper', () => {
  const environmentProvider = {
    async getEnvironmentData() {
      return {
        biome: 'Plains',
        weather: 'Clear',
        timeOfDay: 'Morning',
        nearbyEntities: [],
        nearbyBlocks: [],
      };
    },
    async getInventoryData() {
      return [
        { name: 'oak_log', type: 'oak_log', count: 4 },
        { name: 'stone_pickaxe', type: 'stone_pickaxe', count: 1 },
      ];
    },
  };

  it('returns recovered memory tasks when available', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/state')) {
        return new Response(
          JSON.stringify({
            provenance: {
              recentActions: [
                {
                  id: 'task-1',
                  type: 'explore_area',
                  description: 'Scout the nearby forest',
                  status: 'pending',
                  priority: 0.8,
                  urgency: 0.7,
                },
              ],
            },
          })
        );
      }
      throw new Error(`Unexpected fetch url ${url}`);
    });

    const bootstrapper = new TaskBootstrapper({
      memoryEndpoint: 'http://memory.local',
      llmEndpoint: null,
      fetchImpl: fetchMock as any,
      environmentProvider,
    });

    const result = await bootstrapper.bootstrap({
      context: createPlanningContext(),
      signals: [],
    });

    expect(result.source).toBe('memory');
    expect(result.goals).toHaveLength(1);
    expect(result.goals[0].metadata?.origin).toBe('memory');
    expect(result.diagnostics.memoryConsidered).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('produces contract-compliant bootstrap payloads', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/state')) {
        return new Response(
          JSON.stringify({
            provenance: {
              recentActions: [
                {
                  id: 'task-2',
                  type: 'gather_resources',
                  description: 'Gather missing wood',
                  status: 'pending',
                  priority: 0.7,
                  urgency: 0.5,
                },
              ],
            },
          })
        );
      }
      throw new Error(`Unexpected fetch url ${url}`);
    });

    const bootstrapper = new TaskBootstrapper({
      memoryEndpoint: 'http://memory.local',
      llmEndpoint: null,
      fetchImpl: fetchMock as any,
      environmentProvider,
    });

    const { goals } = await bootstrapper.bootstrap({
      context: createPlanningContext(),
      signals: [],
    });

    const bootstrapTask = {
      id: goals[0].id,
      goalType: goals[0].type,
      description: goals[0].description,
      priority: goals[0].priority,
      urgency: goals[0].urgency,
      origin: goals[0].metadata?.origin,
      reasoning: goals[0].metadata?.reasoning,
      metadata: goals[0].metadata,
    };

    expect(bootstrapTask).toMatchObject({
      id: expect.any(String),
      goalType: expect.any(String),
      description: expect.any(String),
      priority: expect.any(Number),
      urgency: expect.any(Number),
      origin: 'memory',
      reasoning: expect.any(String),
      metadata: expect.any(Object),
    });
  });

  it('uses LLM synthesis when memory is empty', async () => {
    const responses = new Map<string, Response>([
      [
        'http://memory.local/state',
        new Response(
          JSON.stringify({
            provenance: {
              recentActions: [],
            },
          })
        ),
      ],
      [
        'http://llm.local',
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify([
                    {
                      id: 'collect-wood',
                      goalType: 'resource_gathering',
                      description: 'Collect additional wood for building',
                      priority: 0.65,
                      urgency: 0.5,
                      reasoning: 'Inventory shows limited wood resources',
                    },
                  ]),
                },
              },
            ],
          })
        ),
      ],
    ]);

    const fetchMock = vi.fn(async (url: string) => {
      const response = responses.get(url.replace(/\/$/, ''));
      if (!response) {
        throw new Error(`Unexpected fetch url ${url}`);
      }
      return response;
    });

    const bootstrapper = new TaskBootstrapper({
      memoryEndpoint: 'http://memory.local',
      llmEndpoint: 'http://llm.local',
      fetchImpl: fetchMock as any,
      environmentProvider,
    });

    const result = await bootstrapper.bootstrap({
      context: createPlanningContext(),
      signals: [],
    });

    expect(result.source).toBe('llm');
    expect(result.goals).toHaveLength(1);
    expect(result.goals[0].metadata?.origin).toBe('llm');
    expect(result.goals[0].type).toBe(GoalType.RESOURCE_GATHERING);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to exploration when memory and LLM provide nothing', async () => {
    const responses = new Map<string, Response>([
      [
        'http://memory.local/state',
        new Response(
          JSON.stringify({
            provenance: {
              recentActions: [],
            },
          })
        ),
      ],
      [
        'http://llm.local',
        new Response(null, { status: 500 }),
      ],
    ]);

    const fetchMock = vi.fn(async (url: string) => {
      const response = responses.get(url.replace(/\/$/, ''));
      if (!response) {
        throw new Error(`Unexpected fetch url ${url}`);
      }
      return response;
    });

    const bootstrapper = new TaskBootstrapper({
      memoryEndpoint: 'http://memory.local',
      llmEndpoint: 'http://llm.local',
      fetchImpl: fetchMock as any,
      environmentProvider,
    });

    const result = await bootstrapper.bootstrap({
      context: createPlanningContext(),
      signals: [],
    });

    expect(result.source).toBe('exploration');
    expect(result.goals.length).toBeGreaterThan(0);
    for (const goal of result.goals) {
      expect(goal.metadata?.origin).toBe('exploration');
    }
    expect(result.diagnostics.errors.some((err) => err.startsWith('llm:'))).toBe(
      true
    );
  });
});
