# Critical Integration Fixes - Action Plan

**Author:** @darianrosebrook  
**Date:** January 2025  
**Status:** Action Plan - Critical Fixes Required  
**Priority:** High - Fix Integration Points

## Executive Summary

Based on the systematic verification analysis, I've identified the specific integration points that need to be fixed to achieve the intended dynamic behavior creation workflow. This action plan provides concrete steps to connect the existing components and complete the end-to-end integration.

## Priority 1: Fix Planning Integration

### **Issue**: Planning system doesn't use MCP capabilities

**Current State**: `HybridSkillPlanner` exists but doesn't integrate with MCP capabilities for dynamic behavior creation.

**Fix Required**: Connect planning system to MCP capabilities adapter.

#### **Action 1.1: Update HybridSkillPlanner**
**File**: `packages/planning/src/skill-integration/hybrid-skill-planner.ts`

**Changes**:
```typescript
// Add MCP capabilities as first-class planning approach
private decidePlanningApproach(
  goal: string,
  context: HybridPlanningContext
): PlanningDecision {
  // Check if MCP capabilities are available and applicable
  if (context.mcpRegistry && context.mcpDynamicFlow) {
    const applicableCapabilities = this.mcpCapabilitiesAdapter?.findApplicableCapabilities(goal, context);
    if (applicableCapabilities && applicableCapabilities.length > 0) {
      return {
        approach: 'mcp-capabilities',
        reasoning: 'MCP capabilities available for this goal',
        confidence: 0.85,
        estimatedLatency: 150,
      };
    }
  }
  
  // Fall back to other approaches...
}
```

#### **Action 1.2: Add Impasse Detection**
**File**: `packages/planning/src/skill-integration/hybrid-skill-planner.ts`

**Changes**:
```typescript
// Add impasse detection to planning decision
private async checkForImpasse(goal: string, context: HybridPlanningContext): Promise<boolean> {
  if (!context.mcpDynamicFlow) return false;
  
  const impasseResult = context.mcpDynamicFlow.checkImpasse(goal, {
    code: 'unknown',
    detail: 'planning_analysis',
    retryable: false,
  });
  
  return impasseResult.isImpasse;
}
```

## Priority 2: Complete BT-DSL Integration

### **Issue**: BT-DSL parser exists but not integrated with execution

**Current State**: BT-DSL parser can parse JSON but doesn't connect to LLM proposals or execution.

**Fix Required**: Connect BT-DSL parser to LLM integration and execution pipeline.

#### **Action 2.1: Connect LLM to BT-DSL**
**File**: `packages/core/src/mcp-capabilities/llm-integration.ts`

**Changes**:
```typescript
// Add BT-DSL generation to LLM interface
private async generateBTDSL(plan: any, request: any): Promise<any> {
  const systemPrompt = `You are an expert in Behavior Tree Domain Specific Language (BT-DSL). 
  Generate valid BT-DSL JSON that implements the provided plan.`;
  
  const userPrompt = `Convert this plan into BT-DSL JSON:
  Plan: ${plan.detailedPlan}
  Task: ${request.currentTask}
  Recent failures: ${request.recentFailures.map(f => f.detail).join(', ')}`;
  
  const response = await this.ollamaClient.generate(
    this.config.detailedExecutor.model,
    userPrompt,
    { systemPrompt, temperature: 0.1, maxTokens: 2048 }
  );
  
  // Extract and validate JSON
  const jsonMatch = response.response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }
  
  throw new Error('Failed to generate valid BT-DSL JSON');
}
```

#### **Action 2.2: Connect BT-DSL to Execution**
**File**: `packages/core/src/mcp-capabilities/enhanced-registry.ts`

**Changes**:
```typescript
// Add execution pipeline for compiled BT-DSL
async executeCompiledOption(
  optionId: string,
  leafContext: LeafContext,
  args: any,
  abortSignal?: AbortSignal
): Promise<ShadowRunResult> {
  const spec = this.enhancedSpecs.get(optionId);
  if (!spec) {
    throw new Error(`Option ${optionId} not found`);
  }
  
  const btDsl = this.optionDefs.get(optionId);
  if (!btDsl) {
    throw new Error(`BT-DSL definition not found for ${optionId}`);
  }
  
  // Parse and compile BT-DSL
  const parseResult = this.btParser.parse(btDsl, this.leafFactory);
  if (!parseResult.valid || !parseResult.compiled) {
    throw new Error(`Invalid BT-DSL: ${parseResult.errors?.join(', ')}`);
  }
  
  // Execute compiled tree
  const result = await this.btParser.execute(
    parseResult.compiled,
    this.leafFactory,
    leafContext,
    abortSignal
  );
  
  return {
    id: `shadow-${optionId}-${Date.now()}`,
    success: result.status === 'success',
    durationMs: result.metrics?.durationMs || 0,
    error: result.error,
  };
}
```

## Priority 3: Implement Server APIs

### **Issue**: No REST endpoints for dynamic registration

**Current State**: Enhanced registry exists but no way to register capabilities via API.

**Fix Required**: Add REST endpoints for dynamic capability registration.

#### **Action 3.1: Create Server API**
**File**: `packages/core/src/server.ts`

**Changes**:
```typescript
import express from 'express';
import { EnhancedRegistry } from './mcp-capabilities/enhanced-registry';
import { DynamicCreationFlow } from './mcp-capabilities/dynamic-creation-flow';

const app = express();
app.use(express.json());

const registry = new EnhancedRegistry();
const dynamicFlow = new DynamicCreationFlow(registry);

// Register option endpoint
app.post('/capabilities/option/register', async (req, res) => {
  try {
    const { btDsl, provenance, shadowConfig } = req.body;
    
    const result = registry.registerOption(btDsl, provenance, shadowConfig);
    
    if (result.ok) {
      res.json({ ok: true, id: result.id });
    } else {
      res.status(400).json({ ok: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Execute shadow run endpoint
app.post('/capabilities/:id/shadow-run', async (req, res) => {
  try {
    const { id } = req.params;
    const { leafContext, args } = req.body;
    
    const result = await registry.executeShadowRun(id, leafContext, undefined, args);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Promote option endpoint
app.post('/capabilities/:id/promote', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const success = await registry.promoteOption(id, reason);
    res.json({ ok: success });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export { app };
```

## Priority 4: Fix Test Infrastructure

### **Issue**: Jest configuration and type validation errors

**Current State**: Multiple test failures preventing validation of integration.

**Fix Required**: Resolve Jest setup and type validation issues.

#### **Action 4.1: Fix Jest Configuration**
**File**: `packages/core/jest.config.js`

**Changes**:
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  testTimeout: 30000,
};
```

#### **Action 4.2: Fix Type Validation**
**File**: `packages/core/src/types.ts`

**Changes**:
```typescript
// Update signal types to match test expectations
export const SignalSchema = z.object({
  type: z.enum([
    'health', 'hunger', 'fatigue', 'threat', 'social', 'memory', 'intrusion',
    'safety', 'nutrition', 'progress' // Add missing types
  ]),
  intensity: z.number().min(0).max(1),
  urgency: z.number().min(0).max(1),
  // ... rest of schema
});
```

## Priority 5: Implement End-to-End Example

### **Issue**: Missing torch corridor demonstration

**Current State**: No complete end-to-end example showing dynamic capability creation.

**Fix Required**: Implement complete torch corridor workflow.

#### **Action 5.1: Create Torch Corridor BT-DSL**
**File**: `packages/core/src/examples/torch-corridor-bt-dsl.json`

**Content**:
```json
{
  "name": "opt.torch_corridor",
  "version": "1.0.0",
  "description": "Safely torch a mining corridor with hostile detection",
  "root": {
    "type": "Sequence",
    "children": [
      {
        "type": "Leaf",
        "leafName": "move_to",
        "args": { "pos": "$end", "safe": true }
      },
      {
        "type": "Repeat.Until",
        "condition": "distance_to_end",
        "child": {
          "type": "Sequence",
          "children": [
            {
              "type": "Leaf",
              "leafName": "sense_hostiles",
              "args": { "radius": "$hostilesRadius" }
            },
            {
              "type": "Decorator.FailOnTrue",
              "condition": "hostiles_present",
              "child": {
                "type": "Leaf",
                "leafName": "retreat_and_block"
              }
            },
            {
              "type": "Leaf",
              "leafName": "place_torch_if_needed",
              "args": { "interval": "$interval" }
            },
            {
              "type": "Leaf",
              "leafName": "step_forward_safely"
            }
          ]
        }
      }
    ]
  }
}
```

#### **Action 5.2: Create End-to-End Test**
**File**: `packages/core/src/__tests__/torch-corridor-e2e.test.ts`

**Content**:
```typescript
import { EnhancedRegistry } from '../mcp-capabilities/enhanced-registry';
import { DynamicCreationFlow } from '../mcp-capabilities/dynamic-creation-flow';
import torchCorridorBTDSL from '../examples/torch-corridor-bt-dsl.json';

describe('Torch Corridor End-to-End', () => {
  let registry: EnhancedRegistry;
  let dynamicFlow: DynamicCreationFlow;

  beforeEach(() => {
    registry = new EnhancedRegistry();
    dynamicFlow = new DynamicCreationFlow(registry);
  });

  test('should register and execute torch corridor capability', async () => {
    // 1. Register the capability
    const result = registry.registerOption(
      torchCorridorBTDSL,
      {
        author: 'llm',
        createdAt: new Date().toISOString(),
      },
      {
        successThreshold: 0.8,
        maxShadowRuns: 10,
        failureThreshold: 0.3,
        minShadowRuns: 3,
      }
    );

    expect(result.ok).toBe(true);
    expect(result.id).toBe('opt.torch_corridor@1.0.0');

    // 2. Execute shadow run
    const shadowResult = await registry.executeShadowRun(
      result.id!,
      mockLeafContext,
      undefined,
      {
        end: { x: 100, y: 12, z: -35 },
        interval: 6,
        hostilesRadius: 10,
      }
    );

    expect(shadowResult.success).toBe(true);
    expect(shadowResult.durationMs).toBeGreaterThan(0);
  });
});
```

## Implementation Timeline

### **Week 1: Core Integration Fixes**
- [ ] Fix planning integration (Actions 1.1, 1.2)
- [ ] Complete BT-DSL integration (Actions 2.1, 2.2)
- [ ] Fix Jest configuration (Action 4.1)

### **Week 2: API and Testing**
- [ ] Implement server APIs (Action 3.1)
- [ ] Fix type validation (Action 4.2)
- [ ] Create end-to-end example (Actions 5.1, 5.2)

### **Week 3: Validation and Testing**
- [ ] Run complete test suite
- [ ] Validate end-to-end workflow
- [ ] Document integration points

## Success Criteria

After implementing these fixes, the system should demonstrate:

1. ✅ **Planning Integration**: Planning system can use MCP capabilities
2. ✅ **Dynamic Creation**: Bot can create new behaviors when planning fails
3. ✅ **Safe Testing**: New capabilities are tested before promotion
4. ✅ **Immediate Use**: New capabilities are immediately available
5. ✅ **End-to-End Validation**: Torch corridor example works completely

## Conclusion

These critical integration fixes will transform the current partial implementation into a fully functional dynamic behavior creation system. The foundation is solid - we just need to connect the components properly.

---

**Status:** Action Plan Ready  
**Next Priority:** Implement Priority 1 fixes  
**Confidence Level:** High (Clear path forward)  
**Research Value:** Enables complete dynamic AI capability creation
