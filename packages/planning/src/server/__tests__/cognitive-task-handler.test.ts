/**
 * Tests for cognitive-task-handler.ts
 *
 * Validates:
 * - detectActionableSteps keyword matching
 * - extractActionableSteps sentence parsing
 * - determineActionType action mapping
 * - convertCognitiveReflectionToTasks: provenance, type, metadata
 *
 * @author @darianrosebrook
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectActionableSteps,
  extractActionableSteps,
  determineActionType,
  convertCognitiveReflectionToTasks,
} from '../cognitive-task-handler';
import type { ITaskIntegration } from '../../interfaces/task-integration';

function createMockTaskIntegration(): ITaskIntegration {
  return {
    addTask: vi.fn().mockResolvedValue({ id: 'mock-task-id' }),
    getActiveTasks: vi.fn().mockReturnValue([]),
    getTasks: vi.fn().mockReturnValue([]),
    updateTaskMetadata: vi.fn(),
    updateTaskProgress: vi.fn(),
    updateTaskStatus: vi.fn().mockResolvedValue(undefined),
    completeTaskStep: vi.fn().mockResolvedValue(true),
    startTaskStep: vi.fn().mockResolvedValue(true),
    regenerateSteps: vi.fn().mockResolvedValue({ steps: [] }),
    addStepsBeforeCurrent: vi.fn(),
    annotateCurrentStepWithLeaf: vi.fn(),
    annotateCurrentStepWithOption: vi.fn().mockReturnValue(true),
    registerSolver: vi.fn(),
    configureHierarchicalPlanner: vi.fn(),
    isHierarchicalPlannerConfigured: false,
    enableGoalResolver: vi.fn(),
    isGoalResolverConfigured: false,
    getMcDataPublic: vi.fn(),
    on: vi.fn().mockReturnThis(),
    emit: vi.fn().mockReturnValue(true),
    outbox: { enqueue: vi.fn() },
  } as any;
}

// ---------------------------------------------------------------------------
// detectActionableSteps
// ---------------------------------------------------------------------------
describe('detectActionableSteps', () => {
  it('returns true for content with actionable keywords', () => {
    expect(detectActionableSteps('I should craft a wooden pickaxe.')).toBe(true);
    expect(detectActionableSteps('Gather some wood from the forest.')).toBe(true);
    expect(detectActionableSteps('Build a shelter for the night.')).toBe(true);
  });

  it('returns false for content without actionable keywords', () => {
    expect(detectActionableSteps('I wonder what happened yesterday.')).toBe(false);
    expect(detectActionableSteps('The sky looks nice today.')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(detectActionableSteps('CRAFT something useful.')).toBe(true);
    expect(detectActionableSteps('Collect All The Things.')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// extractActionableSteps
// ---------------------------------------------------------------------------
describe('extractActionableSteps', () => {
  it('extracts sentences with actionable keywords', () => {
    const steps = extractActionableSteps('Approach the tree. Look around. Chop the wood.');
    expect(steps).toHaveLength(2);
    expect(steps[0].label).toBe('Approach the tree');
    expect(steps[1].label).toBe('Chop the wood');
  });

  it('returns empty for non-actionable content', () => {
    const steps = extractActionableSteps('Thinking about life.');
    expect(steps).toHaveLength(0);
  });

  it('sets default estimated duration', () => {
    const steps = extractActionableSteps('Craft a pickaxe.');
    expect(steps[0].estimatedDuration).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// determineActionType
// ---------------------------------------------------------------------------
describe('determineActionType', () => {
  it('maps approach/move to move_to', () => {
    expect(determineActionType('approach the tree')).toBe('move_to');
    expect(determineActionType('Move to the village')).toBe('move_to');
  });

  it('maps chop/cut to dig_block', () => {
    expect(determineActionType('chop the wood')).toBe('dig_block');
    expect(determineActionType('Cut down the tree')).toBe('dig_block');
  });

  it('maps craft to craft_recipe', () => {
    expect(determineActionType('craft a wooden pickaxe')).toBe('craft_recipe');
  });

  it('maps build/construct to build_structure', () => {
    expect(determineActionType('build a shelter')).toBe('build_structure');
    expect(determineActionType('construct a wall')).toBe('build_structure');
  });

  it('maps gather/collect to gather_resources', () => {
    expect(determineActionType('gather wood')).toBe('gather_resources');
    expect(determineActionType('collect some stones')).toBe('gather_resources');
  });

  it('returns generic_action for unmatched descriptions', () => {
    expect(determineActionType('ponder the meaning of existence')).toBe('generic_action');
  });
});

// ---------------------------------------------------------------------------
// convertCognitiveReflectionToTasks
// ---------------------------------------------------------------------------
describe('convertCognitiveReflectionToTasks', () => {
  let mockTI: ITaskIntegration;

  beforeEach(() => {
    mockTI = createMockTaskIntegration();
  });

  it('creates advisory_action tasks (not "action")', async () => {
    const cogTask = {
      id: 'cog-1',
      title: 'Reflecting on crafting',
      parameters: { thoughtContent: 'I should craft a pickaxe.' },
    };
    await convertCognitiveReflectionToTasks(cogTask, mockTI);

    expect(mockTI.addTask).toHaveBeenCalledTimes(1);
    const created = (mockTI.addTask as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(created.type).toBe('advisory_action');
  });

  it('sets source to autonomous', async () => {
    const cogTask = {
      id: 'cog-2',
      parameters: { thoughtContent: 'Gather wood from the forest.' },
    };
    await convertCognitiveReflectionToTasks(cogTask, mockTI);

    const created = (mockTI.addTask as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(created.source).toBe('autonomous');
  });

  it('sets taskProvenance with builder and source', async () => {
    const cogTask = {
      id: 'cog-3',
      parameters: { thoughtContent: 'Build a shelter near the cave.' },
    };
    await convertCognitiveReflectionToTasks(cogTask, mockTI);

    const created = (mockTI.addTask as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(created.metadata.taskProvenance).toEqual({
      builder: 'convertCognitiveReflectionToTasks',
      source: 'cognitive_reflection',
      actionType: 'build_structure',
    });
  });

  it('sets parentTaskId in metadata', async () => {
    const cogTask = {
      id: 'cog-4',
      parameters: { thoughtContent: 'Craft wooden planks from logs.' },
    };
    await convertCognitiveReflectionToTasks(cogTask, mockTI);

    const created = (mockTI.addTask as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(created.metadata.parentTaskId).toBe('cog-4');
  });

  it('includes cognitive and advisory tags', async () => {
    const cogTask = {
      id: 'cog-5',
      parameters: { thoughtContent: 'Collect some iron ore.' },
    };
    await convertCognitiveReflectionToTasks(cogTask, mockTI);

    const created = (mockTI.addTask as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(created.metadata.tags).toContain('cognitive');
    expect(created.metadata.tags).toContain('advisory');
  });

  it('does NOT include requirementCandidate (intentional for advisory)', async () => {
    const cogTask = {
      id: 'cog-6',
      parameters: { thoughtContent: 'Craft a stone sword.' },
    };
    await convertCognitiveReflectionToTasks(cogTask, mockTI);

    const created = (mockTI.addTask as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(created.parameters.requirementCandidate).toBeUndefined();
  });

  it('creates multiple tasks for multiple actionable sentences', async () => {
    const cogTask = {
      id: 'cog-7',
      parameters: {
        thoughtContent: 'Approach the tree. Chop the wood. Craft planks.',
      },
    };
    await convertCognitiveReflectionToTasks(cogTask, mockTI);

    expect(mockTI.addTask).toHaveBeenCalledTimes(3);
    const calls = (mockTI.addTask as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0].parameters.action).toBe('move_to');
    expect(calls[1][0].parameters.action).toBe('dig_block');
    expect(calls[2][0].parameters.action).toBe('craft_recipe');
  });

  it('marks cognitive task completed when no actionable steps found', async () => {
    const cogTask = {
      id: 'cog-8',
      parameters: { thoughtContent: 'I wonder about the meaning of life.' },
    };
    await convertCognitiveReflectionToTasks(cogTask, mockTI);

    expect(mockTI.addTask).not.toHaveBeenCalled();
    expect(mockTI.updateTaskStatus).toHaveBeenCalledWith('cog-8', 'completed');
  });

  it('marks cognitive task failed on error', async () => {
    (mockTI.addTask as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('test error')
    );
    const cogTask = {
      id: 'cog-9',
      parameters: { thoughtContent: 'Craft a diamond sword.' },
    };
    await convertCognitiveReflectionToTasks(cogTask, mockTI);

    expect(mockTI.updateTaskStatus).toHaveBeenCalledWith('cog-9', 'failed');
  });

  it('does not set id on tasks (let addTask handle it)', async () => {
    const cogTask = {
      id: 'cog-10',
      parameters: { thoughtContent: 'Gather some wood.' },
    };
    await convertCognitiveReflectionToTasks(cogTask, mockTI);

    const created = (mockTI.addTask as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(created.id).toBeUndefined();
  });

  it('inherits priority and urgency from cognitive task', async () => {
    const cogTask = {
      id: 'cog-11',
      priority: 0.9,
      urgency: 0.8,
      parameters: { thoughtContent: 'Craft a wooden sword immediately.' },
    };
    await convertCognitiveReflectionToTasks(cogTask, mockTI);

    const created = (mockTI.addTask as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(created.priority).toBe(0.9);
    expect(created.urgency).toBe(0.8);
  });

  it('sets advisorySpawned marker and blockedReason on parent after spawning', async () => {
    const cogTask = {
      id: 'cog-12',
      parameters: { thoughtContent: 'Gather wood from the forest.' },
    };
    await convertCognitiveReflectionToTasks(cogTask, mockTI);

    expect(mockTI.updateTaskMetadata).toHaveBeenCalledWith('cog-12', {
      advisorySpawned: true,
      advisorySpawnedAt: expect.any(Number),
      advisoryCount: 1,
      blockedReason: 'advisory_spawned',
    });
  });

  it('skips if advisorySpawned is already set (idempotency)', async () => {
    const cogTask = {
      id: 'cog-13',
      parameters: { thoughtContent: 'Craft a wooden pickaxe.' },
      metadata: { advisorySpawned: true },
    };
    await convertCognitiveReflectionToTasks(cogTask, mockTI);

    expect(mockTI.addTask).not.toHaveBeenCalled();
    expect(mockTI.updateTaskStatus).not.toHaveBeenCalled();
  });

  it('does not set advisorySpawned when no actionable steps found', async () => {
    const cogTask = {
      id: 'cog-14',
      parameters: { thoughtContent: 'I wonder about the meaning of life.' },
    };
    await convertCognitiveReflectionToTasks(cogTask, mockTI);

    expect(mockTI.updateTaskMetadata).not.toHaveBeenCalled();
  });

  it('parent reflection excluded from selection after advisory spawn', async () => {
    // Simulate: first call spawns advisory actions + sets blocked metadata
    const cogTask = {
      id: 'cog-15',
      parameters: { thoughtContent: 'Craft a wooden sword.' },
      metadata: {} as Record<string, any>,
    };
    await convertCognitiveReflectionToTasks(cogTask, mockTI);

    // Verify blockedReason was set on the parent
    const metadataCall = (mockTI.updateTaskMetadata as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(metadataCall[0]).toBe('cog-15');
    expect(metadataCall[1].blockedReason).toBe('advisory_spawned');

    // Simulate executor selection filter: tasks with blockedReason are excluded
    const parentMetadata = { ...metadataCall[1] };
    const isEligible = !parentMetadata.blockedReason;
    expect(isEligible).toBe(false);

    // Simulate re-selection: if somehow re-called with advisorySpawned set, handler bails
    cogTask.metadata = parentMetadata;
    (mockTI.addTask as ReturnType<typeof vi.fn>).mockClear();
    await convertCognitiveReflectionToTasks(cogTask, mockTI);
    expect(mockTI.addTask).not.toHaveBeenCalled();
  });
});
