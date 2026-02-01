/**
 * LLM Skill Composer - Integrates Language Models with Skill Composition
 *
 * This enhanced version of the SkillComposer uses language models to:
 * - Refine and expand goal descriptions
 * - Generate new skill combinations
 * - Analyze execution feedback for improvement
 * - Create adaptive skill curricula
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { SkillComposer, ComposedSkill, ExecutionContext } from './types';
import { Goal, GoalType, GoalStatus } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface LLMEnhancementConfig {
  enableGoalRefinement: boolean;
  enableSkillGeneration: boolean;
  enableFeedbackAnalysis: boolean;
  enableCurriculumGeneration: boolean;
  maxRefinementIterations: number;
  confidenceThreshold: number;
  llmEndpoint?: string;
  llmModel?: string;
}

export interface GoalRefinementRequest {
  originalGoal: Goal;
  context: ExecutionContext;
  refinementType: 'expand' | 'clarify' | 'optimize' | 'adapt';
  constraints?: string[];
  preferences?: Record<string, any>;
}

export interface GoalRefinementResult {
  success: boolean;
  refinedGoal?: Goal;
  alternativeGoals?: Goal[];
  reasoning: string;
  confidence: number;
  suggestions: string[];
}

export interface SkillGenerationRequest {
  goal: Goal;
  context: ExecutionContext;
  availableLeaves: string[];
  complexity: 'simple' | 'moderate' | 'complex';
  style: 'conservative' | 'balanced' | 'innovative';
}

export interface SkillGenerationResult {
  success: boolean;
  generatedSkills: GeneratedSkill[];
  reasoning: string;
  confidence: number;
  metadata: {
    novelty: number;
    complexity: number;
    feasibility: number;
  };
}

export interface GeneratedSkill {
  name: string;
  description: string;
  leafCombination: string[];
  estimatedComplexity: number;
  prerequisites: string[];
  expectedOutcomes: string[];
  riskAssessment: 'low' | 'medium' | 'high';
}

export interface FeedbackAnalysisRequest {
  composedSkill: ComposedSkill;
  executionResult: {
    success: boolean;
    duration: number;
    worldStateChanges: Record<string, any>;
    errors?: string[];
    unexpectedOutcomes?: string[];
  };
  context: ExecutionContext;
}

export interface FeedbackAnalysisResult {
  success: boolean;
  improvements: SkillImprovement[];
  insights: string[];
  confidence: number;
  nextSteps: string[];
}

export interface SkillImprovement {
  type:
    | 'parameter_adjustment'
    | 'leaf_replacement'
    | 'execution_order'
    | 'prerequisite_addition';
  description: string;
  impact: 'low' | 'medium' | 'high';
  implementation: string;
  confidence: number;
}

export interface CurriculumGoal {
  id: string;
  type: 'skill_building' | 'exploration' | 'mastery' | 'innovation';
  description: string;
  targetSkills: string[];
  prerequisites: string[];
  difficulty: number;
  estimatedDuration: number;
  successCriteria: string[];
}

// ============================================================================
// LLM Skill Composer Implementation
// ============================================================================

export class LLMSkillComposer extends EventEmitter {
  private baseSkillComposer: SkillComposer;
  private config: LLMEnhancementConfig;
  private refinementHistory: Map<string, GoalRefinementResult[]> = new Map();
  private generationHistory: Map<string, SkillGenerationResult[]> = new Map();
  private feedbackHistory: Map<string, FeedbackAnalysisResult[]> = new Map();
  private curriculumGoals: CurriculumGoal[] = [];

  constructor(
    baseSkillComposer: SkillComposer,
    config: Partial<LLMEnhancementConfig> = {}
  ) {
    super();
    this.baseSkillComposer = baseSkillComposer;
    this.config = {
      enableGoalRefinement: true,
      enableSkillGeneration: true,
      enableFeedbackAnalysis: true,
      enableCurriculumGeneration: true,
      maxRefinementIterations: 3,
      confidenceThreshold: 0.7,
      llmEndpoint: process.env.LLM_ENDPOINT || 'http://localhost:3004',
      llmModel: process.env.LLM_MODEL || 'gpt-4',
      ...config,
    };

    this.setupEventHandlers();
  }

  /**
   * Set up event handlers for monitoring and debugging
   */
  private setupEventHandlers(): void {
    this.baseSkillComposer.on('skillComposed', (skill: ComposedSkill) => {
      this.emit('skillComposed', skill);
      console.log(`🎯 LLM skill composed: ${skill.name}`);
    });

    this.baseSkillComposer.on('compositionError', (error: Error) => {
      this.emit('compositionError', error);
      console.error(`❌ LLM composition error: ${error.message}`);
    });
  }

  /**
   * Enhanced skill composition with LLM assistance
   */
  async composeLeavesWithLLM(
    goal: Goal,
    context: ExecutionContext,
    options?: {
      enableRefinement?: boolean;
      enableGeneration?: boolean;
      maxIterations?: number;
    }
  ): Promise<ComposedSkill | null> {
    try {
      console.log(`🧠 LLM composition for goal: ${goal.description}`);

      let currentGoal = goal;
      let iteration = 0;
      const maxIterations =
        options?.maxIterations || this.config.maxRefinementIterations;

      // Iterative goal refinement and skill composition
      while (iteration < maxIterations) {
        console.log(`🔄 Iteration ${iteration + 1}/${maxIterations}`);

        // 1. Goal refinement (if enabled)
        if (
          options?.enableRefinement !== false &&
          this.config.enableGoalRefinement
        ) {
          const refinementResult = await this.refineGoal({
            originalGoal: currentGoal,
            context,
            refinementType: 'optimize',
          });

          if (refinementResult.success && refinementResult.refinedGoal) {
            currentGoal = refinementResult.refinedGoal;
            console.log(`✨ Goal refined: ${refinementResult.reasoning}`);
            this.emit('goalRefined', {
              original: goal,
              refined: currentGoal,
              iteration,
            });
          }
        }

        // 2. Attempt base composition
        const composedSkill = await this.baseSkillComposer.composeLeaves(
          currentGoal.description,
          context
        );

        if (composedSkill) {
          console.log(
            `✅ Skill composed successfully on iteration ${iteration + 1}`
          );
          this.emit('skillComposedWithLLM', {
            skill: composedSkill,
            goal: currentGoal,
            iterations: iteration + 1,
          });
          return composedSkill;
        }

        // 3. Skill generation (if enabled and composition failed)
        if (
          options?.enableGeneration !== false &&
          this.config.enableSkillGeneration
        ) {
          console.log(`🔧 Composition failed, attempting skill generation...`);

          const generationResult = await this.generateSkills({
            goal: currentGoal,
            context,
            availableLeaves: this.getAvailableLeaves(context),
            complexity: this.determineComplexity(currentGoal),
            style: 'balanced',
          });

          if (
            generationResult.success &&
            generationResult.generatedSkills.length > 0
          ) {
            console.log(
              `🎨 Generated ${generationResult.generatedSkills.length} new skill ideas`
            );

            // Try to implement the most promising generated skill
            const bestSkill = this.selectBestGeneratedSkill(
              generationResult.generatedSkills
            );
            console.log(`🎯 Attempting to implement: ${bestSkill.name}`);

            // For now, we'll just return the base composition result
            // In a full implementation, we'd create new leaves or modify existing ones
            this.emit('skillGenerated', {
              generatedSkill: bestSkill,
              goal: currentGoal,
            });
          }
        }

        iteration++;

        if (iteration < maxIterations) {
          console.log(`⏳ Retrying with refined approach...`);
          // Add a small delay between iterations
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      console.log(
        `❌ Failed to compose skill after ${maxIterations} iterations`
      );
      this.emit('compositionFailed', {
        goal: currentGoal,
        iterations: maxIterations,
      });
      return null;
    } catch (error) {
      console.error('Error in LLM composition:', error);
      this.emit('compositionError', error);
      return null;
    }
  }

  /**
   * Refine a goal using LLM analysis
   */
  async refineGoal(
    request: GoalRefinementRequest
  ): Promise<GoalRefinementResult> {
    try {
      console.log(`🔍 Refining goal: ${request.originalGoal.description}`);

      // Create LLM prompt for goal refinement
      const prompt = this.createGoalRefinementPrompt(request);

      // Call LLM for refinement (mock implementation for now)
      const llmResponse = await this.callLLM(prompt, 'goal_refinement');

      // Parse and validate LLM response
      const refinementResult = this.parseGoalRefinementResponse(
        llmResponse,
        request.originalGoal
      );

      // Store in history
      const historyKey = request.originalGoal.id;
      if (!this.refinementHistory.has(historyKey)) {
        this.refinementHistory.set(historyKey, []);
      }
      this.refinementHistory.get(historyKey)!.push(refinementResult);

      this.emit('goalRefined', { request, result: refinementResult });
      return refinementResult;
    } catch (error) {
      console.error('Error in goal refinement:', error);
      return {
        success: false,
        reasoning: `Refinement failed: ${error}`,
        confidence: 0,
        suggestions: [],
      };
    }
  }

  /**
   * Generate new skill ideas using LLM
   */
  async generateSkills(
    request: SkillGenerationRequest
  ): Promise<SkillGenerationResult> {
    try {
      console.log(`🎨 Generating skills for goal: ${request.goal.description}`);

      // Create LLM prompt for skill generation
      const prompt = this.createSkillGenerationPrompt(request);

      // Call LLM for skill generation
      const llmResponse = await this.callLLM(prompt, 'skill_generation');

      // Parse and validate LLM response
      const generationResult = this.parseSkillGenerationResponse(llmResponse);

      // Store in history
      const historyKey = request.goal.id;
      if (!this.generationHistory.has(historyKey)) {
        this.generationHistory.set(historyKey, []);
      }
      this.generationHistory.get(historyKey)!.push(generationResult);

      this.emit('skillsGenerated', { request, result: generationResult });
      return generationResult;
    } catch (error) {
      console.error('Error in skill generation:', error);
      return {
        success: false,
        generatedSkills: [],
        reasoning: `Generation failed: ${error}`,
        confidence: 0,
        metadata: { novelty: 0, complexity: 0, feasibility: 0 },
      };
    }
  }

  /**
   * Analyze execution feedback for skill improvement
   */
  async analyzeFeedback(
    request: FeedbackAnalysisRequest
  ): Promise<FeedbackAnalysisResult> {
    try {
      console.log(
        `📊 Analyzing feedback for skill: ${request.composedSkill.name}`
      );

      // Create LLM prompt for feedback analysis
      const prompt = this.createFeedbackAnalysisPrompt(request);

      // Call LLM for analysis
      const llmResponse = await this.callLLM(prompt, 'feedback_analysis');

      // Parse and validate LLM response
      const analysisResult = this.parseFeedbackAnalysisResponse(llmResponse);

      // Store in history
      const historyKey = request.composedSkill.id;
      if (!this.feedbackHistory.has(historyKey)) {
        this.feedbackHistory.set(historyKey, []);
      }
      this.feedbackHistory.get(historyKey)!.push(analysisResult);

      this.emit('feedbackAnalyzed', { request, result: analysisResult });
      return analysisResult;
    } catch (error) {
      console.error('Error in feedback analysis:', error);
      return {
        success: false,
        improvements: [],
        insights: [`Analysis failed: ${error}`],
        confidence: 0,
        nextSteps: [],
      };
    }
  }

  /**
   * Generate adaptive curriculum goals
   */
  async generateCurriculumGoals(
    currentSkills: string[],
    worldState: Record<string, any>,
    preferences?: Record<string, any>
  ): Promise<CurriculumGoal[]> {
    try {
      console.log(
        `📚 Generating curriculum goals for ${currentSkills.length} skills`
      );

      // Create LLM prompt for curriculum generation
      const prompt = this.createCurriculumGenerationPrompt(
        currentSkills,
        worldState,
        preferences
      );

      // Call LLM for curriculum generation
      const llmResponse = await this.callLLM(prompt, 'curriculum_generation');

      // Parse and validate LLM response
      const curriculumGoals =
        this.parseCurriculumGenerationResponse(llmResponse);

      // Store generated goals
      this.curriculumGoals.push(...curriculumGoals);

      this.emit('curriculumGenerated', {
        goals: curriculumGoals,
        currentSkills,
        worldState,
      });
      return curriculumGoals;
    } catch (error) {
      console.error('Error in curriculum generation:', error);
      return [];
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Create LLM prompt for goal refinement
   */
  private createGoalRefinementPrompt(request: GoalRefinementRequest): string {
    const { originalGoal, context, refinementType, constraints, preferences } =
      request;

    return `
Refine the following goal for better skill composition.

ORIGINAL GOAL:
- Type: ${originalGoal.type}
- Description: ${originalGoal.description}
- Priority: ${originalGoal.priority}/10
- Urgency: ${originalGoal.urgency}/10
- Utility: ${originalGoal.utility}

CONTEXT:
- World State: ${JSON.stringify(context.worldState)}
- Available Resources: ${JSON.stringify(context.availableResources)}
- Time Constraints: ${JSON.stringify(context.timeConstraints)}

REFINEMENT TYPE: ${refinementType.toUpperCase()}
${constraints ? `CONSTRAINTS: ${constraints.join(', ')}` : ''}
${preferences ? `PREFERENCES: ${JSON.stringify(preferences)}` : ''}

Please refine this goal to make it more specific, actionable, and suitable for skill composition. Consider:
1. Breaking down complex goals into simpler sub-goals
2. Adding specific parameters and constraints
3. Clarifying expected outcomes
4. Optimizing for available resources and capabilities

Respond with a JSON object containing:
{
  "refinedGoal": {
    "description": "refined goal description",
    "subGoals": ["sub-goal 1", "sub-goal 2"],
    "parameters": {"param1": "value1"},
    "constraints": ["constraint1", "constraint2"],
    "expectedOutcomes": ["outcome1", "outcome2"]
  },
  "reasoning": "explanation of refinements",
  "confidence": 0.8,
  "suggestions": ["suggestion1", "suggestion2"]
}
`;
  }

  /**
   * Create LLM prompt for skill generation
   */
  private createSkillGenerationPrompt(request: SkillGenerationRequest): string {
    const { goal, context, availableLeaves, complexity, style } = request;

    return `
Generate new skill ideas to accomplish the following goal.

GOAL:
- Description: ${goal.description}
- Type: ${goal.type}
- Priority: ${goal.priority}/10

CONTEXT:
- World State: ${JSON.stringify(context.worldState)}
- Available Resources: ${JSON.stringify(context.availableResources)}
- Time Constraints: ${JSON.stringify(context.timeConstraints)}

AVAILABLE PRIMITIVE ACTIONS (leaves):
${availableLeaves.map((leaf) => `- ${leaf}`).join('\n')}

REQUIREMENTS:
- Complexity: ${complexity}
- Style: ${style}
- Focus on combining available leaves in innovative ways

Generate 3-5 new skill ideas that could help achieve this goal. Each skill should:
1. Combine multiple primitive actions
2. Have clear inputs and outputs
3. Be feasible with available resources
4. Match the specified complexity and style

Respond with a JSON array of skills:
[
  {
    "name": "Skill Name",
    "description": "Detailed description of what this skill does",
    "leafCombination": ["leaf1", "leaf2", "leaf3"],
    "estimatedComplexity": 5,
    "prerequisites": ["prereq1", "prereq2"],
    "expectedOutcomes": ["outcome1", "outcome2"],
    "riskAssessment": "medium"
  }
]
`;
  }

  /**
   * Create LLM prompt for feedback analysis
   */
  private createFeedbackAnalysisPrompt(
    request: FeedbackAnalysisRequest
  ): string {
    const { composedSkill, executionResult, context } = request;

    return `
Analyze the following execution feedback for the composed skill.

SKILL:
- Name: ${composedSkill.name}
- Description: ${composedSkill.description}
- Complexity: ${composedSkill.metadata.complexity}
- Leaves Used: ${composedSkill.leaves.map((l: any) => l.name).join(', ')}

EXECUTION RESULT:
- Success: ${executionResult.success}
- Duration: ${executionResult.duration}ms
- World State Changes: ${JSON.stringify(executionResult.worldStateChanges)}
${executionResult.errors ? `- Errors: ${executionResult.errors.join(', ')}` : ''}
${executionResult.unexpectedOutcomes ? `- Unexpected Outcomes: ${executionResult.unexpectedOutcomes.join(', ')}` : ''}

CONTEXT:
- World State: ${JSON.stringify(context.worldState)}
- Available Resources: ${JSON.stringify(context.availableResources)}

Please analyze this feedback and suggest improvements. Consider:
1. What went wrong and why?
2. How could the skill be improved?
3. What alternative approaches might work better?
4. What should be tried next?

Respond with a JSON object containing:
{
  "improvements": [
    {
      "type": "parameter_adjustment|leaf_replacement|execution_order|prerequisite_addition",
      "description": "description of the improvement",
      "impact": "low|medium|high",
      "implementation": "how to implement this improvement",
      "confidence": 0.8
    }
  ],
  "insights": ["insight1", "insight2"],
  "confidence": 0.8,
  "nextSteps": ["step1", "step2"]
}
`;
  }

  /**
   * Create LLM prompt for curriculum generation
   */
  private createCurriculumGenerationPrompt(
    currentSkills: string[],
    worldState: Record<string, any>,
    preferences?: Record<string, any>
  ): string {
    return `
Generate a learning curriculum based on the following current skills and world state.

CURRENT SKILLS:
${currentSkills.map((skill) => `- ${skill}`).join('\n')}

WORLD STATE:
${JSON.stringify(worldState, null, 2)}

${preferences ? `PREFERENCES: ${JSON.stringify(preferences)}` : ''}

Generate 5-8 curriculum goals that will help the bot:
1. Build upon existing skills
2. Learn new capabilities
3. Explore different aspects of the world
4. Develop more complex behaviors

Each goal should have:
- Clear learning objectives
- Appropriate difficulty progression
- Realistic success criteria
- Estimated time requirements

Respond with a JSON array of curriculum goals:
[
  {
    "id": "curriculum_goal_1",
    "type": "skill_building|exploration|mastery|innovation",
    "description": "goal description",
    "targetSkills": ["skill1", "skill2"],
    "prerequisites": ["prereq1", "prereq2"],
    "difficulty": 5,
    "estimatedDuration": 300000,
    "successCriteria": ["criterion1", "criterion2"]
  }
]
`;
  }

  /**
   * Call the LLM service
   */
  private async callLLM(prompt: string, taskType: string): Promise<string> {
    try {
      // Mock LLM call for now - in practice this would call an actual LLM service
      console.log(`🤖 Mock LLM call for ${taskType}`);
      console.log(`📝 Prompt: ${prompt.substring(0, 200)}...`);

      // Simulate LLM processing time
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Return mock response based on task type
      return this.generateMockLLMResponse(taskType, prompt);
    } catch (error) {
      console.error('Error calling LLM:', error);
      throw new Error(`LLM call failed: ${error}`);
    }
  }

  /**
   * Generate mock LLM responses for testing
   */
  private generateMockLLMResponse(taskType: string, prompt: string): string {
    switch (taskType) {
      case 'goal_refinement':
        return JSON.stringify({
          refinedGoal: {
            description: 'Refined goal description with better specificity',
            subGoals: ['sub-goal 1', 'sub-goal 2'],
            parameters: { param1: 'value1' },
            constraints: ['constraint1', 'constraint2'],
            expectedOutcomes: ['outcome1', 'outcome2'],
          },
          reasoning: 'Goal was too vague and needed specific parameters',
          confidence: 0.8,
          suggestions: ['Add time constraints', 'Specify resource amounts'],
        });

      case 'skill_generation':
        return JSON.stringify([
          {
            name: 'Advanced Resource Gathering',
            description: 'Efficiently gather multiple resource types',
            leafCombination: ['movement_leaf', 'resource_leaf', 'safety_leaf'],
            estimatedComplexity: 6,
            prerequisites: ['basic_movement', 'basic_gathering'],
            expectedOutcomes: ['resources_collected', 'area_explored'],
            riskAssessment: 'medium',
          },
        ]);

      case 'feedback_analysis':
        return JSON.stringify({
          improvements: [
            {
              type: 'parameter_adjustment',
              description: 'Adjust timing parameters for better coordination',
              impact: 'medium',
              implementation: 'Increase delay between leaf executions',
              confidence: 0.7,
            },
          ],
          insights: [
            'Skill execution was too rushed',
            'Better coordination needed',
          ],
          confidence: 0.8,
          nextSteps: ['Test with adjusted timing', 'Monitor coordination'],
        });

      case 'curriculum_generation':
        return JSON.stringify([
          {
            id: 'curriculum_goal_1',
            type: 'skill_building',
            description: 'Master basic movement and navigation',
            targetSkills: ['movement', 'navigation'],
            prerequisites: [],
            difficulty: 3,
            estimatedDuration: 180000,
            successCriteria: [
              'Can move to any visible location',
              'Can navigate around obstacles',
            ],
          },
        ]);

      default:
        return JSON.stringify({ error: 'Unknown task type' });
    }
  }

  /**
   * Parse LLM response for goal refinement
   */
  private parseGoalRefinementResponse(
    llmResponse: string,
    originalGoal: Goal
  ): GoalRefinementResult {
    try {
      const parsed = JSON.parse(llmResponse);

      if (parsed.refinedGoal) {
        const refinedGoal: Goal = {
          ...originalGoal,
          description: parsed.refinedGoal.description,
          updatedAt: Date.now(),
        };

        return {
          success: true,
          refinedGoal,
          reasoning: parsed.reasoning || 'Goal refined successfully',
          confidence: parsed.confidence || 0.7,
          suggestions: parsed.suggestions || [],
        };
      }

      return {
        success: false,
        reasoning: 'Invalid LLM response format',
        confidence: 0,
        suggestions: [],
      };
    } catch (error) {
      return {
        success: false,
        reasoning: `Failed to parse LLM response: ${error}`,
        confidence: 0,
        suggestions: [],
      };
    }
  }

  /**
   * Parse LLM response for skill generation
   */
  private parseSkillGenerationResponse(
    llmResponse: string
  ): SkillGenerationResult {
    try {
      const parsed = JSON.parse(llmResponse);

      if (Array.isArray(parsed)) {
        const generatedSkills: GeneratedSkill[] = parsed.map((skill) => ({
          name: skill.name || 'Unknown Skill',
          description: skill.description || 'No description',
          leafCombination: skill.leafCombination || [],
          estimatedComplexity: skill.estimatedComplexity || 5,
          prerequisites: skill.prerequisites || [],
          expectedOutcomes: skill.expectedOutcomes || [],
          riskAssessment: skill.riskAssessment || 'medium',
        }));

        return {
          success: true,
          generatedSkills,
          reasoning: 'Skills generated successfully',
          confidence: 0.8,
          metadata: {
            novelty: 0.7,
            complexity: 0.6,
            feasibility: 0.8,
          },
        };
      }

      return {
        success: false,
        generatedSkills: [],
        reasoning: 'Invalid LLM response format',
        confidence: 0,
        metadata: { novelty: 0, complexity: 0, feasibility: 0 },
      };
    } catch (error) {
      return {
        success: false,
        generatedSkills: [],
        reasoning: `Failed to parse LLM response: ${error}`,
        confidence: 0,
        metadata: { novelty: 0, complexity: 0, feasibility: 0 },
      };
    }
  }

  /**
   * Parse LLM response for feedback analysis
   */
  private parseFeedbackAnalysisResponse(
    llmResponse: string
  ): FeedbackAnalysisResult {
    try {
      const parsed = JSON.parse(llmResponse);

      if (parsed.improvements) {
        const improvements: SkillImprovement[] = parsed.improvements.map(
          (imp: any) => ({
            type: imp.type || 'parameter_adjustment',
            description: imp.description || 'No description',
            impact: imp.impact || 'medium',
            implementation: imp.implementation || 'No implementation details',
            confidence: imp.confidence || 0.5,
          })
        );

        return {
          success: true,
          improvements,
          insights: parsed.insights || [],
          confidence: parsed.confidence || 0.7,
          nextSteps: parsed.nextSteps || [],
        };
      }

      return {
        success: false,
        improvements: [],
        insights: ['Invalid LLM response format'],
        confidence: 0,
        nextSteps: [],
      };
    } catch (error) {
      return {
        success: false,
        improvements: [],
        insights: [`Failed to parse LLM response: ${error}`],
        confidence: 0,
        nextSteps: [],
      };
    }
  }

  /**
   * Parse LLM response for curriculum generation
   */
  private parseCurriculumGenerationResponse(
    llmResponse: string
  ): CurriculumGoal[] {
    try {
      const parsed = JSON.parse(llmResponse);

      if (Array.isArray(parsed)) {
        return parsed.map((goal) => ({
          id: goal.id || `curriculum_${Date.now()}`,
          type: goal.type || 'skill_building',
          description: goal.description || 'No description',
          targetSkills: goal.targetSkills || [],
          prerequisites: goal.prerequisites || [],
          difficulty: goal.difficulty || 5,
          estimatedDuration: goal.estimatedDuration || 300000,
          successCriteria: goal.successCriteria || [],
        }));
      }

      return [];
    } catch (error) {
      console.error('Failed to parse curriculum generation response:', error);
      return [];
    }
  }

  /**
   * Get available leaves from context
   */
  private getAvailableLeaves(context: ExecutionContext): string[] {
    // This would extract available leaves from the context
    // For now, return a mock list
    return [
      'movement_leaf',
      'safety_leaf',
      'resource_leaf',
      'crafting_leaf',
      'interaction_leaf',
    ];
  }

  /**
   * Determine appropriate complexity for a goal
   */
  private determineComplexity(goal: Goal): 'simple' | 'moderate' | 'complex' {
    if (goal.priority <= 3) return 'simple';
    if (goal.priority <= 7) return 'moderate';
    return 'complex';
  }

  /**
   * Select the best generated skill from a list
   */
  private selectBestGeneratedSkill(skills: GeneratedSkill[]): GeneratedSkill {
    // Simple selection based on complexity and risk
    return skills.reduce((best, current) => {
      const bestScore =
        10 -
        best.estimatedComplexity +
        (best.riskAssessment === 'low'
          ? 3
          : best.riskAssessment === 'medium'
            ? 2
            : 1);
      const currentScore =
        10 -
        current.estimatedComplexity +
        (current.riskAssessment === 'low'
          ? 3
          : current.riskAssessment === 'medium'
            ? 2
            : 1);
      return currentScore > bestScore ? current : best;
    });
  }

  /**
   * Get refinement history for a goal
   */
  getRefinementHistory(goalId: string): GoalRefinementResult[] {
    return this.refinementHistory.get(goalId) || [];
  }

  /**
   * Get generation history for a goal
   */
  getGenerationHistory(goalId: string): SkillGenerationResult[] {
    return this.generationHistory.get(goalId) || [];
  }

  /**
   * Get feedback history for a skill
   */
  getFeedbackHistory(skillId: string): FeedbackAnalysisResult[] {
    return this.feedbackHistory.get(skillId) || [];
  }

  /**
   * Get all curriculum goals
   */
  getCurriculumGoals(): CurriculumGoal[] {
    return [...this.curriculumGoals];
  }

  /**
   * Clear all history and generated data
   */
  clearHistory(): void {
    this.refinementHistory.clear();
    this.generationHistory.clear();
    this.feedbackHistory.clear();
    this.curriculumGoals = [];
    this.emit('historyCleared');
  }
}
