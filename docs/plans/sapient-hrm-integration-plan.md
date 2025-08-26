# Sapient HRM Integration Plan

**Purpose:** Integrate the actual 27M parameter Sapient HRM (Python) with our TypeScript conscious bot system  
**Author:** @darianrosebrook  
**Status:** Implementation Ready  
**Priority:** High - Research Validation

## Executive Summary

This document outlines the integration of the actual **Sapient Hierarchical Reasoning Model (HRM)** - a 27M parameter Python model that achieves exceptional performance on structured reasoning tasks - with our TypeScript-based conscious bot system. This creates a **hybrid cognitive architecture** that combines the best of both worlds:

- **Sapient HRM**: Specialized for structured reasoning (puzzles, optimization, pathfinding)
- **LLM HRM**: Specialized for narrative reasoning (social, creative, ambiguous)
- **GOAP**: Specialized for reactive responses (safety, reflexes)

## Architecture Overview

### Current State Analysis

**Sapient HRM (Python)**:
- ✅ 27M parameter hierarchical reasoning model
- ✅ Dual-system: High-level (abstract) + Low-level (detailed) reasoning
- ✅ Single forward pass with iterative refinement
- ✅ ACT (Adaptive Computation Time) for dynamic halting
- ✅ Exceptional performance on ARC, Sudoku, Maze tasks
- ❌ Python-based, requires separate process
- ❌ Limited to structured reasoning tasks

**Our Current HRM (TypeScript)**:
- ✅ LLM-based dual-system using Ollama models
- ✅ Integrated with conscious bot architecture
- ✅ Good for narrative reasoning
- ❌ Much larger models (14B+ parameters)
- ❌ Slower inference (15+ seconds)
- ❌ Expensive for structured tasks

### Hybrid Architecture

```typescript
interface HybridCognitiveArchitecture {
  // Tier 1: Reactive (GOAP) - <50ms responses
  reactive: {
    purpose: 'Emergency responses and reflex actions';
    latency: '<10ms';
    complexity: 'Simple stimulus-response patterns';
    triggers: ['danger', 'immediate_needs', 'reflexes'];
  };
  
  // Tier 2: Structured (Sapient HRM) - 50-200ms responses  
  structured: {
    purpose: 'Logical reasoning and systematic problem-solving';
    latency: '50-150ms';
    complexity: 'Multi-step logical inference and planning';
    triggers: ['puzzles', 'optimization', 'systematic_planning', 'tool_use'];
    model: 'Sapient HRM (27M parameters)';
  };
  
  // Tier 3: Narrative (LLM HRM) - 200-1000ms responses
  narrative: {
    purpose: 'Social reasoning and creative problem-solving';
    latency: '200-800ms';
    complexity: 'Open-ended reasoning and communication';
    triggers: ['social_interaction', 'creative_tasks', 'ambiguous_problems', 'ethical_dilemmas'];
    model: 'LLM HRM (14B+ parameters)';
  };
}
```

## Implementation Strategy

### 1. Python Bridge Architecture

**REST API Bridge**:
```python
# sapient-hrm/hrm_bridge.py
class HRMBridge:
    def __init__(self, model_path: str, device: str):
        self.model = HierarchicalReasoningModel_ACTV1(config)
        self.device = device
    
    async def infer(self, request: HRMRequest) -> HRMResponse:
        # Convert task to HRM input format
        # Run inference with actual Sapient HRM
        # Return structured response
```

**TypeScript Interface**:
```typescript
// packages/core/src/mcp-capabilities/hybrid-hrm-integration.ts
class HybridHRMRouter {
  private pythonHRM: PythonHRMInterface;
  private llmHRM: HRMLLMInterface;
  
  async reason(task: string, context: LeafContext): Promise<HybridReasoningResult> {
    const signature = this.analyzeTaskSignature(task);
    
    if (this.shouldUsePythonHRM(signature)) {
      return this.executePythonHRM(task, context);
    } else if (this.shouldUseLLMHRM(signature)) {
      return this.executeLLMHRM(task, context);
    } else {
      return this.executeGOAP(task, context);
    }
  }
}
```

### 2. Task Routing Heuristics

**Structured Reasoning Indicators**:
```typescript
const structuredKeywords = [
  'puzzle', 'solve', 'optimize', 'path', 'route', 'algorithm',
  'calculate', 'compute', 'find', 'determine', 'figure out',
  'sudoku', 'maze', 'puzzle', 'logic', 'constraint', 'satisfaction'
];
```

**Narrative Reasoning Indicators**:
```typescript
const narrativeKeywords = [
  'explain', 'describe', 'story', 'narrative', 'social', 'interact',
  'communicate', 'discuss', 'analyze', 'interpret', 'understand',
  'creative', 'imagine', 'hypothesize', 'theorize', 'reflect'
];
```

**Reactive Response Indicators**:
```typescript
const reactiveKeywords = [
  'danger', 'emergency', 'immediate', 'urgent', 'stop', 'avoid',
  'escape', 'defend', 'protect', 'safety', 'critical', 'reflex'
];
```

### 3. Collaborative Reasoning

**Parallel Execution**:
```typescript
async collaborativeReason(task: string, context: LeafContext): Promise<HybridReasoningResult> {
  // Execute both systems in parallel
  const [pythonResult, llmResult] = await Promise.allSettled([
    this.executePythonHRM(task, context),
    this.executeLLMHRM(task, context),
  ]);
  
  // Analyze consensus and choose primary result
  return this.analyzeCollaboration(pythonResult, llmResult);
}
```

## Implementation Timeline

### Phase 1: Foundation (Week 1)

**Deliverables**:
- [x] Python HRM bridge server (`sapient-hrm/hrm_bridge.py`)
- [x] TypeScript hybrid router (`packages/core/src/mcp-capabilities/hybrid-hrm-integration.ts`)
- [x] Basic task routing heuristics
- [x] REST API communication layer

**Success Criteria**:
- Python HRM server starts successfully
- TypeScript can communicate with Python HRM
- Basic task routing works correctly
- Fallback mechanisms function properly

### Phase 2: Integration (Week 2)

**Deliverables**:
- [ ] Enhanced task signature analysis
- [ ] Collaborative reasoning implementation
- [ ] Performance monitoring and metrics
- [ ] Error handling and recovery

**Success Criteria**:
- Task routing accuracy >90%
- Collaborative reasoning produces better results than individual systems
- Performance metrics are collected and analyzed
- System gracefully handles failures

### Phase 3: Optimization (Week 3)

**Deliverables**:
- [ ] Model caching and optimization
- [ ] Advanced consensus mechanisms
- [ ] Dynamic routing based on performance
- [ ] Integration with existing conscious bot systems

**Success Criteria**:
- Response times meet performance budgets
- Consensus mechanisms improve decision quality
- System adapts routing based on historical performance
- Full integration with conscious bot architecture

### Phase 4: Validation (Week 4)

**Deliverables**:
- [ ] Comprehensive testing suite
- [ ] Performance benchmarking
- [ ] Research validation metrics
- [ ] Documentation and examples

**Success Criteria**:
- All tests pass consistently
- Performance targets achieved
- Research hypothesis validated
- System ready for production use

## Technical Implementation Details

### Python HRM Bridge

**Dependencies**:
```bash
# sapient-hrm/requirements.txt
torch
flask
flask-cors
pydantic
```

**Server Configuration**:
```bash
# Start the HRM bridge server
cd sapient-hrm
python hrm_bridge.py --host localhost --port 5000 --device cpu
```

**API Endpoints**:
- `GET /health` - Health check
- `POST /initialize` - Initialize HRM model
- `POST /infer` - Perform inference
- `GET /status` - Get model status

### TypeScript Integration

**Configuration**:
```typescript
const hybridRouter = new HybridHRMRouter({
  modelPath: undefined, // Use default model
  device: 'cpu', // or 'cuda', 'mps'
  maxSteps: 8,
  confidenceThreshold: 0.7,
});
```

**Usage**:
```typescript
const result = await hybridRouter.reason(
  "Find the optimal path through a complex maze",
  context,
  { maxTimeMs: 10000, maxComplexity: 0.8 }
);

console.log(`Selected system: ${result.primarySystem}`);
console.log(`Confidence: ${result.confidence}`);
console.log(`Execution time: ${result.executionTime}ms`);
```

### Task Classification Algorithm

**Signature Analysis**:
```typescript
interface TaskSignature {
  structuredReasoning: number; // 0-1 score
  narrativeReasoning: number; // 0-1 score
  reactiveResponse: number; // 0-1 score
  complexity: number; // 0-1 score
  timeCritical: boolean;
  safetyCritical: boolean;
}
```

**Routing Logic**:
```typescript
private shouldUsePythonHRM(signature: TaskSignature): boolean {
  return (
    signature.structuredReasoning > 0.6 &&
    signature.complexity > 0.3 &&
    !signature.timeCritical &&
    this.pythonHRM.isAvailable()
  );
}
```

## Performance Expectations

### Latency Targets

**Sapient HRM (Python)**:
- Structured reasoning: 50-150ms
- Model loading: <5 seconds
- Memory usage: <200MB

**LLM HRM (TypeScript)**:
- Narrative reasoning: 200-800ms
- Model loading: <30 seconds
- Memory usage: <4GB

**Hybrid System**:
- Task routing: <10ms
- Collaborative reasoning: 100-500ms
- Fallback time: <50ms

### Accuracy Targets

**Task Routing**:
- Structured tasks → Python HRM: >90%
- Narrative tasks → LLM HRM: >85%
- Reactive tasks → GOAP: >95%

**Collaborative Reasoning**:
- Consensus agreement: >80%
- Quality improvement: >15% over individual systems
- Confidence calibration: ±0.1 accuracy

## Research Validation

### Core Hypothesis Testing

**Architecture-over-Scale Hypothesis**:
- **Test**: Compare Sapient HRM (27M) vs LLM HRM (14B+) on structured tasks
- **Expected**: Sapient HRM outperforms on structured reasoning
- **Metric**: Accuracy, latency, resource usage

**Hybrid Intelligence Hypothesis**:
- **Test**: Compare hybrid system vs individual systems
- **Expected**: Hybrid system achieves best overall performance
- **Metric**: Task completion rate, solution quality, user satisfaction

**Consciousness-like Behavior Hypothesis**:
- **Test**: Measure behavioral complexity and coherence
- **Expected**: Hybrid system exhibits more sophisticated behaviors
- **Metric**: Behavioral complexity index, narrative coherence, temporal consistency

### Validation Metrics

**Performance Metrics**:
```typescript
interface PerformanceMetrics {
  latency: {
    pythonHRM: LatencyDistribution;
    llmHRM: LatencyDistribution;
    hybrid: LatencyDistribution;
    routing: LatencyDistribution;
  };
  
  accuracy: {
    taskRouting: number;
    pythonHRM: Map<TaskType, number>;
    llmHRM: Map<TaskType, number>;
    collaborative: number;
  };
  
  resource: {
    memoryUsage: number;
    cpuUtilization: number;
    gpuUtilization: number;
  };
}
```

**Research Metrics**:
```typescript
interface ResearchMetrics {
  consciousness: {
    behavioralComplexity: number;
    narrativeCoherence: number;
    temporalConsistency: number;
    emergentBehaviors: number;
  };
  
  intelligence: {
    problemSolvingAccuracy: number;
    adaptationRate: number;
    generalizationAbility: number;
    creativityScore: number;
  };
}
```

## Risk Mitigation

### Technical Risks

**Python HRM Availability**:
- **Risk**: Python HRM fails to load or initialize
- **Mitigation**: Graceful fallback to LLM HRM
- **Monitoring**: Health checks and automatic restart

**Communication Latency**:
- **Risk**: REST API calls add significant overhead
- **Mitigation**: Connection pooling, caching, timeout management
- **Monitoring**: Network latency metrics

**Model Compatibility**:
- **Risk**: Input/output format mismatches
- **Mitigation**: Robust format conversion and validation
- **Testing**: Comprehensive integration tests

### Research Risks

**Performance Degradation**:
- **Risk**: Hybrid system performs worse than individual systems
- **Mitigation**: A/B testing, performance monitoring, rollback capability
- **Monitoring**: Real-time performance metrics

**Complexity Overhead**:
- **Risk**: System becomes too complex to maintain
- **Mitigation**: Clear separation of concerns, comprehensive documentation
- **Monitoring**: Code complexity metrics

## Success Criteria

### Quantitative Success Metrics

**Performance**:
- Task routing accuracy: >90%
- Python HRM latency: <150ms p95
- LLM HRM latency: <800ms p95
- Hybrid system latency: <500ms p95
- Resource overhead: <200MB additional memory

**Quality**:
- Collaborative reasoning improvement: >15%
- Consensus agreement rate: >80%
- Fallback success rate: >95%
- System uptime: >99%

**Research**:
- Architecture-over-scale validation: Sapient HRM outperforms on structured tasks
- Hybrid intelligence validation: Combined system achieves best overall performance
- Consciousness metrics improvement: >20% increase in behavioral complexity

### Qualitative Success Indicators

**User Experience**:
- Seamless integration with existing conscious bot
- Intuitive task routing behavior
- Reliable performance under various conditions
- Clear error messages and recovery

**Research Contributions**:
- Validation of architecture-over-scale hypothesis
- Demonstration of effective hybrid reasoning systems
- Insights into consciousness-like behavior emergence
- Practical framework for embodied AI reasoning

## Next Steps

### Immediate Actions

1. **Test Python HRM Bridge**:
   ```bash
   cd sapient-hrm
   python hrm_bridge.py --test
   ```

2. **Start HRM Server**:
   ```bash
   python hrm_bridge.py --host localhost --port 5000
   ```

3. **Run Hybrid Demo**:
   ```bash
   cd packages/minecraft-interface
   npx tsx src/examples/hybrid-hrm-demo.ts
   ```

### Future Enhancements

1. **Minecraft-Specific Training**: Train Sapient HRM on Minecraft reasoning tasks
2. **Advanced Consensus**: Implement more sophisticated consensus mechanisms
3. **Dynamic Routing**: Learn optimal routing based on historical performance
4. **Model Optimization**: Optimize Python HRM for real-time inference
5. **Integration Expansion**: Integrate with more conscious bot components

## Conclusion

The integration of the actual Sapient HRM with our TypeScript conscious bot system represents a significant advancement in hybrid cognitive architectures. By combining the specialized strengths of both systems, we create a more capable, efficient, and intelligent AI system that validates our core research hypothesis about architecture-over-scale.

This integration not only improves the practical capabilities of our conscious bot but also provides valuable insights into how different types of reasoning can be effectively combined to create more sophisticated AI systems. The hybrid approach demonstrates that the future of AI lies not in simply scaling up single models, but in creating intelligent architectures that can leverage the strengths of multiple specialized systems.

---

**Status**: Ready for implementation  
**Next Review**: After Phase 1 completion  
**Dependencies**: Sapient HRM repository, Flask, PyTorch
