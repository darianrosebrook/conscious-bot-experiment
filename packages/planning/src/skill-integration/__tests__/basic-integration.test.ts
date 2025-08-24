/**
 * Basic Skill Integration Test
 *
 * Simple test to verify the skill integration system is working
 *
 * @author @darianrosebrook
 */

import { SkillRegistry } from '../../../../memory/src/skills/SkillRegistry';
import { BehaviorTreeRunner } from '../../behavior-trees/BehaviorTreeRunner';

// Mock tool executor for testing
const mockToolExecutor = {
  async execute(tool: string, args: Record<string, any>) {
    return {
      ok: true,
      data: { result: 'mock_success', worldStateChanges: {} },
      environmentDeltas: {},
    };
  },
};

describe('Basic Skill Integration', () => {
  let skillRegistry: SkillRegistry;
  let btRunner: BehaviorTreeRunner;

  beforeEach(() => {
    skillRegistry = new SkillRegistry();
    btRunner = new BehaviorTreeRunner(mockToolExecutor);
  });

  it('should have skills registered', () => {
    const skills = skillRegistry.getAllSkills();
    expect(skills.length).toBeGreaterThan(0);
    expect(skills.some((skill) => skill.id === 'opt.shelter_basic')).toBe(true);
    expect(skills.some((skill) => skill.id === 'opt.chop_tree_safe')).toBe(
      true
    );
  });

  it('should be able to get specific skills', () => {
    const shelterSkill = skillRegistry.getSkill('opt.shelter_basic');
    expect(shelterSkill).toBeDefined();
    expect(shelterSkill?.name).toBe('Basic Shelter');
    expect(shelterSkill?.description).toContain('shelter');
  });

  it('should have behavior tree runner initialized', () => {
    expect(btRunner).toBeDefined();
    expect(btRunner).toHaveProperty('runOption');
    expect(typeof btRunner.runOption).toBe('function');
  });

  it('should be able to find skills for preconditions', () => {
    const state = { wood: 10, time: 'dusk' };
    const applicableSkills = skillRegistry.findSkillsForPreconditions(state);
    expect(applicableSkills.length).toBeGreaterThan(0);
  });

  it('should record skill usage', () => {
    const skillId = 'opt.shelter_basic';
    skillRegistry.recordSkillUsage(skillId, true, 5000);

    const skill = skillRegistry.getSkill(skillId);
    expect(skill?.metadata.usageCount).toBe(1);
    expect(skill?.metadata.successRate).toBe(1.0);
  });

  it('should have skill reuse statistics', () => {
    const stats = skillRegistry.getSkillReuseStats();
    expect(stats.totalSkills).toBeGreaterThan(0);
    expect(stats.averageSuccessRate).toBeGreaterThan(0);
    expect(stats.averageSuccessRate).toBeLessThanOrEqual(1);
  });
});
