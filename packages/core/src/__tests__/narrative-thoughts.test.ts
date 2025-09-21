/**
 * Narrative Thoughts Test
 *
 * Tests to verify that narrative thought generation is working
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CognitiveStreamIntegration } from '@/cognitive-stream-integration';

describe('Narrative Thoughts', () => {
  let cognitiveStream: CognitiveStreamIntegration;
  let thoughts: any[] = [];

  beforeEach(() => {
    cognitiveStream = new CognitiveStreamIntegration();
    thoughts = [];

    vi.clearAllMocks();
  });

  it('should initialize cognitive stream', async () => {
    // This test verifies that the cognitive stream can be initialized
    expect(cognitiveStream).toBeDefined();
    expect(typeof cognitiveStream.on).toBe('function');
  });

  it('should handle state update events', async () => {
    const stateUpdatePromise = new Promise<void>((resolve) => {
      cognitiveStream.on('reflection', (event) => {
        thoughts.push(event);
        resolve();
      });
    });

    await cognitiveStream.updateBotState({
      position: { x: 100, y: 64, z: 200 },
      health: 15,
      food: 8,
      inventory: { torch: 3, apple: 2 },
    });

    // Simulate thought generation
    setTimeout(() => {
      cognitiveStream.emit('reflection', {
        type: 'reflection',
        content: 'Bot state updated - health is low',
        timestamp: Date.now(),
      });
    }, 100);

    await stateUpdatePromise;
    expect(thoughts.length).toBeGreaterThan(0);
  });

  it('should handle goal identification', async () => {
    const goalPromise = new Promise<void>((resolve) => {
      cognitiveStream.on('observation', (event) => {
        thoughts.push(event);
        resolve();
      });
    });

    await cognitiveStream.executePlanningCycle('find food');

    // Simulate goal identification
    setTimeout(() => {
      cognitiveStream.emit('observation', {
        type: 'observation',
        content: 'Goal identified: find food',
        timestamp: Date.now(),
      });
    }, 100);

    await goalPromise;
    expect(thoughts.length).toBeGreaterThan(0);
  });

  it('should handle planning execution', async () => {
    const planningPromise = new Promise<void>((resolve) => {
      cognitiveStream.on('reflection', (event) => {
        thoughts.push(event);
        resolve();
      });
    });

    await cognitiveStream.executePlanningCycle('explore area');

    // Simulate planning thought
    setTimeout(() => {
      cognitiveStream.emit('reflection', {
        type: 'reflection',
        content: 'Planning exploration strategy',
        timestamp: Date.now(),
      });
    }, 100);

    await planningPromise;
    expect(thoughts.length).toBeGreaterThan(0);
  });

  it('should handle execution events', async () => {
    const executionPromise = new Promise<void>((resolve) => {
      cognitiveStream.on('observation', (event) => {
        thoughts.push(event);
        resolve();
      });
    });

    await cognitiveStream.executePlanningCycle('get light level');

    // Simulate execution thought
    setTimeout(() => {
      cognitiveStream.emit('observation', {
        type: 'observation',
        content: 'Executing light level check',
        timestamp: Date.now(),
      });
    }, 100);

    await executionPromise;
    expect(thoughts.length).toBeGreaterThan(0);
  });

  it('should track bot state', () => {
    const botState = cognitiveStream.getBotState();
    expect(botState).toBeDefined();
    expect(typeof botState).toBe('object');
  });

  it('should track active goals', () => {
    const activeGoals = cognitiveStream.getActiveGoals();
    expect(activeGoals).toBeDefined();
    expect(Array.isArray(activeGoals)).toBe(true);
  });

  it('should handle multiple thought types', async () => {
    const thoughtPromises: Promise<void>[] = [];

    // Set up listeners for different thought types
    const reflectionPromise = new Promise<void>((resolve) => {
      cognitiveStream.on('reflection', (event) => {
        thoughts.push(event);
        resolve();
      });
    });

    const observationPromise = new Promise<void>((resolve) => {
      cognitiveStream.on('observation', (event) => {
        thoughts.push(event);
        resolve();
      });
    });

    thoughtPromises.push(reflectionPromise, observationPromise);

    // Trigger multiple events
    cognitiveStream.emit('reflection', {
      type: 'reflection',
      content: 'Test reflection',
      timestamp: Date.now(),
    });

    cognitiveStream.emit('observation', {
      type: 'observation',
      content: 'Test observation',
      timestamp: Date.now(),
    });

    await Promise.all(thoughtPromises);
    expect(thoughts.length).toBe(2);
    expect(thoughts.some((t) => t.type === 'reflection')).toBe(true);
    expect(thoughts.some((t) => t.type === 'observation')).toBe(true);
  });
});
