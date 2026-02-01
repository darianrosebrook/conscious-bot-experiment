/**
 * Tests for capability-aware action plan routing.
 *
 * Verifies:
 * - Each requirement kind routes to the correct backend
 * - Fail-closed: null requirement -> unplannable in strict mode
 * - Permissive: null requirement -> compiler in non-strict mode
 * - No route returns a 'legacy' equivalent
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { routeActionPlan } from '../action-plan-backend';
import type { TaskRequirement } from '../requirements';

describe('routeActionPlan', () => {
  const originalEnv = process.env.STRICT_REQUIREMENTS;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.STRICT_REQUIREMENTS;
    } else {
      process.env.STRICT_REQUIREMENTS = originalEnv;
    }
  });

  // -----------------------------------------------------------------------
  // Routing per requirement kind
  // -----------------------------------------------------------------------

  it('routes craft requirement to sterling Rig A', () => {
    const req: TaskRequirement = { kind: 'craft', outputPattern: 'wooden_pickaxe', quantity: 1 };
    const route = routeActionPlan(req);
    expect(route.backend).toBe('sterling');
    expect(route.requiredRig).toBe('A');
    expect(route.requiredCapabilities).toContain('craft');
    expect(route.reason).toBe('craft-requirement');
  });

  it('routes tool_progression requirement to sterling Rig B', () => {
    const req: TaskRequirement = {
      kind: 'tool_progression',
      targetTool: 'iron_pickaxe',
      toolType: 'pickaxe',
      targetTier: 'iron',
      quantity: 1,
    };
    const route = routeActionPlan(req);
    expect(route.backend).toBe('sterling');
    expect(route.requiredRig).toBe('B');
    expect(route.requiredCapabilities).toContain('tool_progression');
    expect(route.reason).toBe('tool-progression-requirement');
  });

  it('routes build requirement to sterling Rig G', () => {
    const req: TaskRequirement = { kind: 'build', structure: 'basic_shelter_5x5', quantity: 1 };
    const route = routeActionPlan(req);
    expect(route.backend).toBe('sterling');
    expect(route.requiredRig).toBe('G');
    expect(route.requiredCapabilities).toContain('build');
    expect(route.reason).toBe('build-requirement');
  });

  it('routes collect requirement to compiler (deterministic lowering)', () => {
    const req: TaskRequirement = { kind: 'collect', patterns: ['oak_log'], quantity: 8 };
    const route = routeActionPlan(req);
    expect(route.backend).toBe('compiler');
    expect(route.requiredRig).toBeNull();
    expect(route.requiredCapabilities).toContain('collect');
    expect(route.reason).toBe('collect-requirement');
  });

  it('routes mine requirement to compiler (deterministic lowering)', () => {
    const req: TaskRequirement = { kind: 'mine', patterns: ['iron_ore'], quantity: 3 };
    const route = routeActionPlan(req);
    expect(route.backend).toBe('compiler');
    expect(route.requiredRig).toBeNull();
    expect(route.requiredCapabilities).toContain('mine');
    expect(route.reason).toBe('mine-requirement');
  });

  // -----------------------------------------------------------------------
  // Fail-closed: null requirement
  // -----------------------------------------------------------------------

  it('returns unplannable for null requirement in strict mode (default)', () => {
    const route = routeActionPlan(null, { strict: true });
    expect(route.backend).toBe('unplannable');
    expect(route.reason).toBe('no-requirement');
  });

  it('returns unplannable for null requirement when env default is strict', () => {
    delete process.env.STRICT_REQUIREMENTS;
    const route = routeActionPlan(null);
    expect(route.backend).toBe('unplannable');
    expect(route.reason).toBe('no-requirement');
  });

  // -----------------------------------------------------------------------
  // Permissive mode
  // -----------------------------------------------------------------------

  it('returns compiler for null requirement in non-strict mode', () => {
    const route = routeActionPlan(null, { strict: false });
    expect(route.backend).toBe('compiler');
    expect(route.reason).toBe('permissive-fallback');
  });

  it('respects STRICT_REQUIREMENTS=false env var', () => {
    process.env.STRICT_REQUIREMENTS = 'false';
    const route = routeActionPlan(null);
    expect(route.backend).toBe('compiler');
    expect(route.reason).toBe('permissive-fallback');
  });

  // -----------------------------------------------------------------------
  // No legacy backend values
  // -----------------------------------------------------------------------

  it('never returns a legacy backend value', () => {
    const requirements: (TaskRequirement | null)[] = [
      { kind: 'craft', outputPattern: 'stick', quantity: 1 },
      { kind: 'tool_progression', targetTool: 'stone_pickaxe', toolType: 'pickaxe', targetTier: 'stone', quantity: 1 },
      { kind: 'build', structure: 'wall', quantity: 1 },
      { kind: 'collect', patterns: ['dirt'], quantity: 1 },
      { kind: 'mine', patterns: ['coal_ore'], quantity: 5 },
      null,
    ];

    for (const req of requirements) {
      const route = routeActionPlan(req, { strict: false });
      expect(['sterling', 'compiler', 'unplannable']).toContain(route.backend);
      // No 'goap', 'hrm', 'htn', 'hybrid', 'legacy', or similar
      expect(route.backend).not.toBe('goap');
      expect(route.backend).not.toBe('legacy');
    }
  });

  // -----------------------------------------------------------------------
  // CapabilityRoute shape
  // -----------------------------------------------------------------------

  it('always returns a well-formed CapabilityRoute', () => {
    const req: TaskRequirement = { kind: 'craft', outputPattern: 'chest', quantity: 1 };
    const route = routeActionPlan(req);
    expect(route).toHaveProperty('backend');
    expect(route).toHaveProperty('requiredRig');
    expect(route).toHaveProperty('requiredCapabilities');
    expect(route).toHaveProperty('availableCapabilities');
    expect(route).toHaveProperty('reason');
    expect(Array.isArray(route.requiredCapabilities)).toBe(true);
    expect(Array.isArray(route.availableCapabilities)).toBe(true);
  });
});
