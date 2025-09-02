# Skill Composer Integration

This module integrates the autonomous **SkillComposer** system with the existing conscious bot planning architecture, enabling dynamic skill composition from primitive actions while maintaining the structured planning approach.

## 🎯 Overview

The integration provides a bridge between:
- **Autonomous SkillComposer**: Dynamically composes complex skills from primitive actions (leaves)
- **Conscious Planning System**: Traditional HTN/GOAP planning with skill registry
- **Hybrid Approach**: Combines both systems for optimal planning

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    HybridSkillPlanner                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │   Traditional   │  │   Dynamic       │  │   Fallback  │ │
│  │   Planning      │  │   Composition   │  │   Planning  │ │
│  │   (HTN/GOAP)   │  │   (SkillComposer)│  │   (GOAP)   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ SkillComposer   │
                    │    Adapter      │
                    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   SkillComposer │
                    │  (Minecraft)    │
                    └─────────────────┘
```

## 🚀 Key Features

### 1. **Dynamic Skill Composition**
- Automatically combines primitive actions (leaves) into complex skills
- Goal-driven composition based on natural language descriptions
- Intelligent leaf matching and combination logic

### 2. **Seamless Integration**
- Works alongside existing planning approaches
- Fallback to traditional planning when composition fails
- Shared skill registry for both composed and pre-defined skills

### 3. **Intelligent Caching**
- Caches successful skill compositions
- Avoids redundant composition for similar goals
- Configurable cache management

### 4. **Event-Driven Monitoring**
- Real-time composition event tracking
- Error handling and fallback strategies
- Performance monitoring and debugging

## 📦 Components

### SkillComposerAdapter
The main integration layer that:
- Converts planning goals to skill composition requests
- Manages the bridge between planning context and execution context
- Handles skill registration and metadata conversion
- Provides fallback skill suggestions

### HybridSkillPlanner Integration
Enhanced planning system that:
- Attempts traditional planning first
- Falls back to dynamic skill composition
- Integrates both approaches seamlessly
- Provides unified planning interface

## 🔧 Usage

### Basic Setup

```typescript
import { SkillComposerAdapter } from './skill-composer-adapter';
import { HybridSkillPlanner } from './hybrid-skill-planner';
import { SkillComposer } from '@conscious-bot/minecraft-interface';
import { SkillRegistry } from '@conscious-bot/memory';

// Initialize components
const skillComposer = new SkillComposer();
const skillRegistry = new SkillRegistry();

// Create adapter
const skillComposerAdapter = new SkillComposerAdapter(skillComposer, skillRegistry);

// Create integrated planner
const hybridPlanner = new HybridSkillPlanner(
  skillRegistry,
  btRunner,
  hrmPlanner,
  goapPlanner,
  undefined, // mcpRegistry (optional)
  undefined, // mcpDynamicFlow (optional)
  skillComposerAdapter // Pass the adapter
);
```

### Goal Handling

```typescript
const goal: Goal = {
  id: 'survival_goal',
  type: GoalType.SURVIVAL,
  priority: 9,
  urgency: 8,
  utility: 0.95,
  description: 'Survive the night by finding shelter',
  // ... other properties
};

// Handle goal with integrated system
const result = await hybridPlanner.attemptDynamicSkillComposition(goal, context);

if (result.success) {
  console.log(`🎯 Skill composed: ${result.composedSkill?.name}`);
} else {
  console.log(`⚠️ Fallback skills: ${result.fallbackSkills?.join(', ')}`);
}
```

## 🎯 Goal Types Supported

The integration automatically maps different goal types to appropriate skill requirements:

| Goal Type | Skill Requirements | Description |
|-----------|-------------------|-------------|
| `SURVIVAL` | `safety_assessment`, `movement`, `resource_gathering` | Basic survival needs |
| `SAFETY` | `safety_assessment`, `movement` | Threat avoidance and safety |
| `EXPLORATION` | `movement`, `safety_assessment` | Safe exploration of new areas |
| `REACH_LOCATION` | `movement`, `safety_assessment` | Navigation to specific locations |
| `ACQUIRE_ITEM` | `resource_gathering`, `movement` | Resource collection and gathering |
| `SURVIVE_THREAT` | `safety_assessment`, `movement` | Immediate threat response |
| `CREATIVITY` | `crafting`, `resource_gathering` | Building and creation tasks |
| `ACHIEVEMENT` | `crafting`, `resource_gathering`, `movement` | Complex goal achievement |

## 🔄 Workflow

### 1. **Goal Analysis**
- Goal is analyzed for skill requirements
- Priority and urgency determine planning approach
- Context is converted to execution format

### 2. **Planning Attempt**
- Traditional planning (HTN/GOAP) is attempted first
- If successful, plan is executed normally
- If failed, dynamic composition is triggered

### 3. **Dynamic Composition**
- Goal description is parsed for skill requirements
- Compatible leaves are identified and combined
- Execution plan is generated with dependencies

### 4. **Skill Registration**
- Composed skill is registered with skill registry
- Metadata is converted to registry format
- Skill becomes available for future use

### 5. **Execution & Monitoring**
- Composed skill is executed via behavior trees
- Events are monitored for debugging
- Performance metrics are tracked

## 📊 Benefits

### For Developers
- **Unified Interface**: Single planning system for all approaches
- **Extensible**: Easy to add new planning strategies
- **Debuggable**: Comprehensive event logging and monitoring
- **Testable**: Well-defined interfaces and mockable components

### For the Bot
- **Adaptive**: Learns new skill combinations automatically
- **Efficient**: Caches successful compositions
- **Robust**: Multiple fallback strategies
- **Emergent**: Discovers new behaviors through composition

## 🧪 Testing

Run the integration tests:

```bash
cd packages/planning
pnpm test src/skill-integration/__tests__/skill-composer-adapter.test.ts
```

## 🔮 Future Enhancements

### 1. **LLM Integration**
- Use language models for goal parsing
- Generate more sophisticated skill descriptions
- Improve composition quality

### 2. **Vector Database**
- Store skill embeddings for similarity search
- Improve skill matching and composition
- Enable skill discovery and recommendation

### 3. **Adaptive Curriculum**
- Generate learning goals based on current capabilities
- Progressive skill complexity building
- Automatic difficulty adjustment

### 4. **Self-Verification**
- Validate composed skill effectiveness
- Learn from execution outcomes
- Refine composition strategies

## 📚 Related Documentation

- [SkillComposer Implementation](../minecraft-interface/src/skill-composer/)
- [Hybrid Skill Planner](./hybrid-skill-planner.ts)
- [Planning System Overview](../README.md)
- [Goal Formulation System](../goal-formulation/)

## 🤝 Contributing

When adding new features to the integration:

1. **Maintain Compatibility**: Ensure existing planning approaches continue to work
2. **Add Tests**: Include comprehensive test coverage for new functionality
3. **Update Documentation**: Keep this README and related docs current
4. **Follow Patterns**: Use the established event-driven architecture
5. **Consider Fallbacks**: Always provide graceful degradation paths

---

**Author**: @darianrosebrook  
**Last Updated**: ${new Date().toISOString().split('T')[0]}
