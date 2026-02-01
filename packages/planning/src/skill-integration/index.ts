/**
 * Skill Integration Module - Exports skill-related planning components
 *
 * Legacy exports removed:
 * - HybridSkillPlanner, HybridPlanningContext, HybridPlan, PlanningDecision — deleted
 * - integration-example, comprehensive-integration-example — deleted
 *
 * @author @darianrosebrook
 */

export { SkillComposerAdapter } from './skill-composer-adapter';
export { LLMSkillComposer } from './llm-skill-composer';
export { MCPSkillIntegration } from './mcp-integration';
/** @deprecated Use LLMSkillComposer */
export { LLMSkillComposer as LLMEnhancedSkillComposer } from './llm-skill-composer';
/** @deprecated Use MCPSkillIntegration */
export { MCPSkillIntegration as EnhancedMCPIntegration } from './mcp-integration';

export type {
  ComposedSkillAdapter,
  ExecutionStep,
  SkillCompositionRequest,
  SkillCompositionContext,
  SkillCompositionResult,
} from './skill-composer-adapter';

export type {
  LLMEnhancementConfig,
  GoalRefinementRequest,
  GoalRefinementResult,
  SkillGenerationRequest,
  SkillGenerationResult,
  GeneratedSkill,
  FeedbackAnalysisRequest,
  FeedbackAnalysisResult,
  SkillImprovement,
  CurriculumGoal,
} from './llm-skill-composer';

export type {
  MCPSkillConfig,
  MCPSkillConfig as EnhancedMCPConfig,
  MCPCapability,
  CapabilityDiscoveryRequest,
  CapabilityDiscoveryResult,
  CapabilityCompositionRequest,
  CapabilityCompositionResult,
  ComposedCapability,
  ExecutionStep as MCPExecutionStep,
  AdaptiveCapabilitySelector,
} from './mcp-integration';
