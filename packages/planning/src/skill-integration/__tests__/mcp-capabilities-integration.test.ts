/**
 * MCP Capabilities Integration Test
 *
 * Tests the integration between MCP capabilities and the planning system
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HybridSkillPlanner } from '../hybrid-skill-planner';
import { MCPCapabilitiesAdapter } from '../mcp-capabilities-adapter';
import { EnhancedRegistry } from '../../../../core/src/mcp-capabilities/enhanced-registry';
import { DynamicCreationFlow } from '../../../../core/src/mcp-capabilities/dynamic-creation-flow';
import { SkillRegistry } from '../../../../memory/src/skills/SkillRegistry';
import { BehaviorTreeRunner } from '../../behavior-trees/BehaviorTreeRunner';
import { HRMInspiredPlanner } from '../../hierarchical-planner/hrm-inspired-planner';
import { EnhancedGOAPPlanner } from '../../reactive-executor/enhanced-goap-planner';

// Mock dependencies
vi.mock('../../../../core/src/mcp-capabilities/enhanced-registry');
vi.mock('../../../../core/src/mcp-capabilities/dynamic-creation-flow');
vi.mock('../../../../memory/src/skills/SkillRegistry');
vi.mock('../../behavior-trees/BehaviorTreeRunner');
vi.mock('../../hierarchical-planner/hrm-inspired-planner');
vi.mock('../../reactive-executor/enhanced-goap-planner');

describe('MCP Capabilities Integration', () => {
  let hybridPlanner: HybridSkillPlanner;
  let mockRegistry: EnhancedRegistry;
  let mockDynamicFlow: DynamicCreationFlow;
  let mockSkillRegistry: SkillRegistry;
  let mockBtRunner: BehaviorTreeRunner;
  let mockHrmPlanner: HRMInspiredPlanner;
  let mockGoapPlanner: EnhancedGOAPPlanner;

  beforeEach(() => {
    // Create mocks
    mockRegistry = {
      listCapabilities: vi.fn().mockResolvedValue([
        {
          id: 'opt.torch_corridor@1.0.0',
          name: 'opt.torch_corridor',
          version: '1.0.0',
          status: 'active',
          provenance: {
            author: 'llm-proposal',
            codeHash: 'abc123',
            createdAt: new Date().toISOString(),
          },
        },
      ]),
      getCapability: vi.fn().mockReturnValue({
        id: 'opt.torch_corridor@1.0.0',
        name: 'opt.torch_corridor',
        version: '1.0.0',
        status: 'active',
      }),
      executeShadowRun: vi.fn().mockResolvedValue({
        id: 'shadow-run-1',
        timestamp: Date.now(),
        status: 'success',
        durationMs: 5000,
      }),
    } as any;

    mockDynamicFlow = {
      checkImpasse: vi.fn().mockReturnValue({
        isImpasse: false,
        reason: 'no_impasse',
        metrics: {
          consecutiveFailures: 0,
          timeSinceLastFailure: 0,
          timeSinceLastProposal: 0,
          proposalsThisHour: 0,
        },
      }),
      proposeNewCapability: vi.fn().mockResolvedValue(null),
    } as any;

    mockSkillRegistry = {
      getAllSkills: vi.fn().mockReturnValue([]),
    } as any;

    mockBtRunner = {} as any;
    mockHrmPlanner = {} as any;
    mockGoapPlanner = {} as any;

    // Create hybrid planner with MCP capabilities
    hybridPlanner = new HybridSkillPlanner(
      mockSkillRegistry,
      mockBtRunner,
      mockHrmPlanner,
      mockGoapPlanner,
      mockRegistry,
      mockDynamicFlow
    );
  });

  describe('MCP Capabilities Planning', () => {
    it('should prefer MCP capabilities for torch corridor goals', async () => {
      const goal = 'torch the mining corridor safely';
      const context = {
        skillRegistry: mockSkillRegistry,
        mcpRegistry: mockRegistry,
        mcpDynamicFlow: mockDynamicFlow,
        worldState: {},
        availableResources: {},
        timeConstraints: {
          urgency: 'medium' as const,
          maxPlanningTime: 10000,
        },
        planningPreferences: {
          preferSkills: false,
          preferMCP: true,
          preferHTN: false,
          preferGOAP: false,
          allowHybrid: true,
        },
        constraints: [],
        domain: 'minecraft',
      };

      const result = await hybridPlanner.plan(goal, context);

      expect(result.success).toBe(true);
      expect(result.decision.approach).toBe('mcp-capabilities');
      expect(result.plan.planningApproach).toBe('mcp-capabilities');
      expect(result.plan.mcpCapabilityPlan).toBeDefined();
    });

    it('should detect impasse and propose new capabilities', async () => {
      // Mock impasse detection
      mockDynamicFlow.checkImpasse = vi.fn().mockReturnValue({
        isImpasse: true,
        reason: 'repeated_failures',
        metrics: {
          consecutiveFailures: 3,
          timeSinceLastFailure: 1000,
          timeSinceLastProposal: 5000,
          proposalsThisHour: 2,
        },
      });

      mockDynamicFlow.proposeNewCapability = vi.fn().mockResolvedValue({
        name: 'opt.safe_mining@1.0.0',
        version: '1.0.0',
        btDsl: {},
        confidence: 0.8,
        estimatedSuccessRate: 0.8,
        reasoning: 'Proposed safe mining capability',
      });

      const goal = 'mine safely in dark areas';
      const context = {
        skillRegistry: mockSkillRegistry,
        mcpRegistry: mockRegistry,
        mcpDynamicFlow: mockDynamicFlow,
        worldState: {},
        availableResources: {},
        timeConstraints: {
          urgency: 'high' as const,
          maxPlanningTime: 5000,
        },
        planningPreferences: {
          preferSkills: false,
          preferMCP: true,
          preferHTN: false,
          preferGOAP: false,
          allowHybrid: true,
        },
        constraints: [],
        domain: 'minecraft',
      };

      const result = await hybridPlanner.plan(goal, context);

      expect(result.success).toBe(true);
      expect(mockDynamicFlow.checkImpasse).toHaveBeenCalledWith(
        goal,
        expect.any(Object)
      );
      expect(mockDynamicFlow.proposeNewCapability).toHaveBeenCalled();
    });

    it('should execute MCP capability plans', async () => {
      const goal = 'torch the corridor';
      const context = {
        skillRegistry: mockSkillRegistry,
        mcpRegistry: mockRegistry,
        mcpDynamicFlow: mockDynamicFlow,
        worldState: {},
        availableResources: {},
        timeConstraints: {
          urgency: 'medium' as const,
          maxPlanningTime: 10000,
        },
        planningPreferences: {
          preferSkills: false,
          preferMCP: true,
          preferHTN: false,
          preferGOAP: false,
          allowHybrid: true,
        },
        constraints: [],
        domain: 'minecraft',
      };

      const planResult = await hybridPlanner.plan(goal, context);
      expect(planResult.success).toBe(true);

      const executionResult = await hybridPlanner.executePlan(
        planResult.plan,
        context
      );

      expect(executionResult.success).toBe(true);
      expect(executionResult.completedSteps).toContain(
        'opt.torch_corridor@1.0.0'
      );
    });

    it('should fallback to other approaches when MCP capabilities unavailable', async () => {
      const goal = 'build a house';
      const context = {
        skillRegistry: mockSkillRegistry,
        mcpRegistry: undefined, // No MCP registry
        mcpDynamicFlow: undefined,
        worldState: {},
        availableResources: {},
        timeConstraints: {
          urgency: 'low' as const,
          maxPlanningTime: 15000,
        },
        planningPreferences: {
          preferSkills: true,
          preferMCP: false,
          preferHTN: true,
          preferGOAP: true,
          allowHybrid: true,
        },
        constraints: [],
        domain: 'minecraft',
      };

      const result = await hybridPlanner.plan(goal, context);

      expect(result.success).toBe(true);
      expect(result.decision.approach).not.toBe('mcp-capabilities');
      expect(result.plan.mcpCapabilityPlan).toBeUndefined();
    });
  });

  describe('MCP Capabilities Adapter', () => {
    it('should find applicable capabilities for goals', async () => {
      const adapter = new MCPCapabilitiesAdapter(mockRegistry, mockDynamicFlow);

      const context = {
        leafContext: {} as any,
        availableCapabilities: [],
        registry: mockRegistry,
        dynamicFlow: mockDynamicFlow,
        worldState: {},
        goalRequirements: {},
        constraints: [],
        domain: 'minecraft',
      };

      const plan = await adapter.generateCapabilityPlan(
        'torch the corridor',
        context
      );

      expect(plan.planningApproach).toBe('mcp-capabilities');
      expect(plan.capabilityDecomposition).toHaveLength(1);
      expect(plan.capabilityDecomposition[0].capabilityId).toBe(
        'opt.torch_corridor@1.0.0'
      );
    });

    it('should execute shadow runs for shadow capabilities', async () => {
      // Mock shadow capability
      mockRegistry.listCapabilities = vi.fn().mockResolvedValue([
        {
          id: 'opt.experimental_mining@1.0.0',
          name: 'opt.experimental_mining',
          version: '1.0.0',
          status: 'shadow',
        },
      ]);

      const adapter = new MCPCapabilitiesAdapter(mockRegistry, mockDynamicFlow);

      const context = {
        leafContext: {} as any,
        availableCapabilities: [],
        registry: mockRegistry,
        dynamicFlow: mockDynamicFlow,
        worldState: {},
        goalRequirements: {},
        constraints: [],
        domain: 'minecraft',
      };

      const plan = await adapter.generateCapabilityPlan(
        'experimental mining',
        context
      );
      const result = await adapter.executeCapabilityPlan(plan, context);

      expect(mockRegistry.executeShadowRun).toHaveBeenCalled();
      expect(result.shadowRunResults).toHaveLength(1);
    });
  });

  describe('Integration with Planning System', () => {
    it('should integrate MCP capabilities with hybrid planning', async () => {
      const goal = 'create a safe mining environment';
      const context = {
        skillRegistry: mockSkillRegistry,
        mcpRegistry: mockRegistry,
        mcpDynamicFlow: mockDynamicFlow,
        worldState: {},
        availableResources: {},
        timeConstraints: {
          urgency: 'medium' as const,
          maxPlanningTime: 10000,
        },
        planningPreferences: {
          preferSkills: false,
          preferMCP: true,
          preferHTN: true,
          preferGOAP: true,
          allowHybrid: true,
        },
        constraints: [],
        domain: 'minecraft',
      };

      const result = await hybridPlanner.plan(goal, context);

      expect(result.success).toBe(true);
      expect(result.plan.planningApproach).toBe('mcp-capabilities');
      expect(result.plan.nodes).toHaveLength(1);
      expect(result.plan.nodes[0].source).toBe('mcp-capability');
    });
  });
});
