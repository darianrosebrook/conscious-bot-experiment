/**
 * Theory of Mind Engine
 *
 * Implements sophisticated theory of mind reasoning to understand and predict
 * other agents' mental states, beliefs, and intentions.
 *
 * @author @darianrosebrook
 */

import { LLMInterface, LLMContext } from '../cognitive-core/llm-interface';
import { AgentModeler } from './agent-modeler';
import { AgentModel, Intention } from './types';

// ============================================================================
// JSON Parsing Utilities (robust extraction from LLM output)
// ============================================================================

/**
 * Event emitted when JSON parsing fails.
 */
export interface TomParseFailedEvent {
  type: 'tom_inference_parse_failed';
  payload: {
    error: string;
    prefix: string;
    length: number;
    method: string;
  };
}

/**
 * Strip markdown code fences from response.
 */
function stripCodeFences(s: string): string {
  const t = s.trim();
  if (t.startsWith('```')) {
    const lines = t.split('\n');
    if (lines.length >= 2) {
      // drop first line (``` or ```json)
      const body = lines.slice(1).join('\n');
      const end = body.lastIndexOf('```');
      return (end >= 0 ? body.slice(0, end) : body).trim();
    }
  }
  return t;
}

/**
 * Strip leading markdown bullet if present.
 * Only strips if it looks like a bullet (followed by whitespace/bracket),
 * NOT a negative number (followed by digit).
 */
function stripLeadingBulletIfPresent(s: string): string {
  const t = s.trimStart();
  if (t.startsWith('-')) {
    const next = t.charAt(1);
    // Only strip if followed by whitespace, bracket, or backtick (not digit)
    if (next === ' ' || next === '\t' || next === '\n' || next === '\r' ||
        next === '{' || next === '[' || next === '`' || next === '') {
      return t.slice(1).trimStart();
    }
  }
  return s.trim();
}

/**
 * Extract the first complete JSON object or array from a string.
 * Uses brace matching to handle nested structures.
 */
function extractFirstJsonValue(s: string): string | null {
  const t = s.trim();
  const startObj = t.indexOf('{');
  const startArr = t.indexOf('[');
  const start = startObj === -1
    ? startArr
    : startArr === -1
      ? startObj
      : Math.min(startObj, startArr);

  if (start === -1) return null;

  let inString = false;
  let escape = false;
  let depth = 0;

  for (let i = start; i < t.length; i++) {
    const ch = t[i];

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
        continue;
      }
      continue;
    } else {
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '{' || ch === '[') depth++;
      if (ch === '}' || ch === ']') depth--;
      if (depth === 0) return t.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Robustly extract JSON from LLM response.
 * Handles code fences, markdown bullets, and preamble text.
 */
function extractJson(raw: string): string {
  const cleaned = stripLeadingBulletIfPresent(stripCodeFences(raw));
  return extractFirstJsonValue(cleaned) ?? cleaned;
}

// ============================================================================
// Theory of Mind Core Types
// ============================================================================

export interface MentalStateInference {
  agentId: string;
  currentBeliefs: Record<string, BeliefState>;
  currentGoals: Goal[];
  currentEmotions: EmotionalState;
  attentionFocus: AttentionState;
  knowledgeState: KnowledgeState;
  confidence: number;
  inferenceReasoning: string;
  timestamp: number;
}

export interface BeliefState {
  content: string;
  confidence: number;
  accuracy: boolean | null; // null if unknown
  source: string;
  lastUpdated: number;
}

export interface Goal {
  id: string;
  description: string;
  priority: number;
  urgency: number;
  progress: number;
  obstacles: string[];
  subgoals: string[];
}

export interface EmotionalState {
  primary: string;
  intensity: number;
  secondary: string[];
  triggers: string[];
  duration: number;
  stability: number;
}

export interface AttentionState {
  focusTarget: string;
  focusIntensity: number;
  distractions: string[];
  attentionSpan: number;
  multitasking: boolean;
}

export interface KnowledgeState {
  knownFacts: string[];
  uncertainties: string[];
  misconceptions: string[];
  knowledgeGaps: string[];
  expertiseDomains: string[];
  confidence: number;
}

export interface ActionPrediction {
  agentId: string;
  predictedActions: PredictedAction[];
  predictionConfidence: number;
  reasoningChain: ReasoningStep[];
  alternativeScenarios: AlternativeScenario[];
  temporalLikelihood: TemporalLikelihood;
  timestamp: number;
}

export interface PredictedAction {
  action: string;
  probability: number;
  reasoning: string;
  prerequisites: string[];
  expectedOutcome: string;
  confidence: number;
}

export interface ReasoningStep {
  step: number;
  type: ReasoningType;
  content: string;
  confidence: number;
  evidence: string[];
}

export interface AlternativeScenario {
  scenario: string;
  probability: number;
  triggerConditions: string[];
  expectedActions: string[];
  reasoning: string;
}

export interface TemporalLikelihood {
  immediate: number; // within minutes
  shortTerm: number; // within hours
  mediumTerm: number; // within days
  longTerm: number; // within weeks
}

export interface PerspectiveSimulation {
  agentId: string;
  scenario: string;
  simulatedViewpoint: string;
  simulatedBeliefs: Record<string, string>;
  simulatedGoals: string[];
  simulatedEmotions: string[];
  simulatedReactions: string[];
  confidence: number;
  reasoning: string;
  limitationsNoted: string[];
}

export interface FalseBeliefDetection {
  agentId: string;
  beliefDomain: string;
  suspectedFalseBeliefs: FalseBelief[];
  confidence: number;
  evidence: string[];
  reasoning: string;
  implications: string[];
}

export interface FalseBelief {
  belief: string;
  actualTruth: string;
  confidenceInFalseness: number;
  source: string;
  impact: string;
  correctionStrategy: string;
}

export interface MetaReasoning {
  agentId: string;
  reasoningTarget: string;
  agentThoughtsAboutTarget: string[];
  secondOrderBeliefs: Record<string, string>;
  agentModelOfTarget: string;
  confidence: number;
  reasoning: string;
  complexityLevel: number;
}

export enum ReasoningType {
  BELIEF_INFERENCE = 'belief_inference',
  GOAL_INFERENCE = 'goal_inference',
  EMOTION_INFERENCE = 'emotion_inference',
  ACTION_PREDICTION = 'action_prediction',
  PERSPECTIVE_TAKING = 'perspective_taking',
  CAUSAL_REASONING = 'causal_reasoning',
}

// ============================================================================
// Configuration
// ============================================================================

export interface TheoryOfMindConfig {
  enableFirstOrderToM: boolean;
  enableSecondOrderToM: boolean;
  enableFalseBeliefReasoning: boolean;
  tomReasoningDepth: number;
  confidenceThreshold: number;
  maxSimultaneousInferences: number;
  inferenceTimeoutMs: number;
  beliefUpdateSensitivity: number;
}

const DEFAULT_CONFIG: TheoryOfMindConfig = {
  enableFirstOrderToM: true,
  enableSecondOrderToM: true,
  enableFalseBeliefReasoning: true,
  tomReasoningDepth: 3,
  confidenceThreshold: 0.6,
  maxSimultaneousInferences: 5,
  inferenceTimeoutMs: 10000,
  beliefUpdateSensitivity: 0.1,
};

// ============================================================================
// Theory of Mind Engine Implementation
// ============================================================================

export class TheoryOfMindEngine {
  private llm: LLMInterface;
  private agentModeler: AgentModeler;
  private config: TheoryOfMindConfig;
  private mentalStateCache: Map<string, MentalStateInference> = new Map();
  private activeInferences: Set<string> = new Set();

  /**
   * Optional callback for structured parse failure events.
   * Set this to emit metrics/events when JSON parsing fails.
   */
  public emitParseFailedEvent?: (
    method: string,
    rawResponse: string,
    error: unknown
  ) => void;

  constructor(
    llm: LLMInterface,
    agentModeler: AgentModeler,
    config: Partial<TheoryOfMindConfig> = {}
  ) {
    this.llm = llm;
    this.agentModeler = agentModeler;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async inferMentalState(
    agentId: string,
    context: SocialContext
  ): Promise<MentalStateInference> {
    if (this.activeInferences.has(agentId)) {
      const cached = this.mentalStateCache.get(agentId);
      if (cached && Date.now() - cached.timestamp < 30000) {
        // 30 second cache
        return cached;
      }
    }

    this.activeInferences.add(agentId);

    try {
      const agentModel = this.agentModeler.getAgentModel(agentId);
      if (!agentModel) {
        throw new Error(`Agent model for ${agentId} not found`);
      }

      const inference = await this.performMentalStateInference(
        agentModel,
        context
      );
      this.mentalStateCache.set(agentId, inference);

      return inference;
    } finally {
      this.activeInferences.delete(agentId);
    }
  }

  async predictAgentAction(
    agentId: string,
    situation: Situation
  ): Promise<ActionPrediction> {
    const mentalState = await this.inferMentalState(agentId, {
      situation: situation.description,
      participants: situation.participants,
      environment: situation.context,
    });

    const agentModel = this.agentModeler.getAgentModel(agentId);
    if (!agentModel) {
      throw new Error(`Agent model for ${agentId} not found`);
    }

    return await this.generateActionPrediction(
      agentModel,
      mentalState,
      situation
    );
  }

  async predictIntentions(
    agentId: string,
    context: SocialContext
  ): Promise<Intention[]> {
    const mentalState = await this.inferMentalState(agentId, context);

    const prompt = `Based on the mental state analysis, predict the agent's intentions:

Mental State:
- Beliefs: ${Object.values(mentalState.currentBeliefs)
      .map((b) => b.content)
      .join(', ')}
- Goals: ${mentalState.currentGoals.map((g) => g.description).join(', ')}
- Emotions: ${mentalState.currentEmotions.primary} (${mentalState.currentEmotions.intensity})

Context: ${context.situation} in ${context.environment}

Predict specific intentions the agent is likely to have.`;

    try {
      const response = await this.llm.generateResponse(prompt, {
        systemPrompt:
          'You are predicting agent intentions. Be specific and evidence-based.',
        temperature: 0.4,
        maxTokens: 512,
      });

      return this.parseIntentions(response.text);
    } catch (error) {
      console.error('Error predicting intentions:', error);
      return [];
    }
  }

  async simulatePerspective(agentId: string, situation: any): Promise<any> {
    const agentModel = this.agentModeler.getAgentModel(agentId);
    if (!agentModel) {
      return this.createEmptyPerspective(agentId);
    }

    const prompt = `Simulate the perspective of agent ${agentId} in this situation:

Situation: ${JSON.stringify(situation, null, 2)}

Agent Model:
- Personality: ${agentModel.personality}
- Beliefs: ${agentModel.beliefs.join(', ')}
- Goals: ${agentModel.goals.join(', ')}
- Behaviors: ${agentModel.behaviors.join(', ')}

Provide the agent's perspective on this situation.`;

    try {
      const response = await this.llm.generateResponse(prompt, {
        systemPrompt:
          "You are simulating an agent's perspective. Think from their viewpoint.",
        temperature: 0.5,
        maxTokens: 512,
      });

      return {
        agentId,
        perspective: response.text,
        confidence: 0.7,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Error simulating perspective:', error);
      return this.createEmptyPerspective(agentId);
    }
  }

  async simulateAgentPerspective(
    agentId: string,
    scenario: Scenario
  ): Promise<PerspectiveSimulation> {
    const agentModel = this.agentModeler.getAgentModel(agentId);
    if (!agentModel) {
      throw new Error(`Agent model for ${agentId} not found`);
    }

    const context: LLMContext = {
      systemPrompt: `You are simulating another agent's perspective. Put yourself in their mental state and respond as they would.`,
      messages: [
        {
          role: 'user',
          content: `Simulate the perspective of agent ${agentId} in this scenario: ${JSON.stringify(scenario, null, 2)}

Agent Profile:
- Personality: ${JSON.stringify(agentModel.inferredPersonality, null, 2)}
- Goals: ${JSON.stringify(agentModel.goalInferences, null, 2)}
- Beliefs: ${JSON.stringify(agentModel.beliefStates, null, 2)}
- Behavioral Patterns: ${JSON.stringify(agentModel.behavioralPatterns, null, 2)}

Please provide:
1. How this agent would view the scenario (their perspective)
2. What they would believe about the situation
3. What goals would be activated for them
4. What emotions they might experience
5. How they would likely react or respond
6. What limitations exist in this simulation

Think step by step from their viewpoint, not your own.
Respond in JSON format.`,
        },
      ],
      temperature: 0.4,
      maxTokens: 1200,
    };

    try {
      const response = await this.llm.generateResponse(
        context.messages?.[0]?.content || 'Simulate perspective',
        context
      );
      return this.parsePerspectiveSimulation(response.text, agentId, scenario);
    } catch (error) {
      console.warn(
        `Failed to simulate perspective for agent ${agentId}:`,
        error
      );
      return this.createEmptyPerspectiveSimulation(agentId, scenario);
    }
  }

  async detectFalseBeliefs(
    agentId: string,
    beliefDomain: string
  ): Promise<FalseBeliefDetection> {
    const agentModel = this.agentModeler.getAgentModel(agentId);
    if (!agentModel) {
      throw new Error(`Agent model for ${agentId} not found`);
    }

    const context: LLMContext = {
      systemPrompt: `You are analyzing an agent's beliefs to detect potentially false or inaccurate beliefs.`,
      messages: [
        {
          role: 'user',
          content: `Analyze agent ${agentId}'s beliefs in the domain of "${beliefDomain}" to detect potential false beliefs.

Agent's Current Beliefs:
${JSON.stringify(agentModel.beliefStates, null, 2)}

Observable Behavior Patterns:
${JSON.stringify(agentModel.behavioralPatterns, null, 2)}

Please identify:
1. Beliefs that might be false or inaccurate
2. Evidence supporting the falseness of each belief
3. What the actual truth likely is
4. How these false beliefs might impact the agent's behavior
5. Strategies for correcting these false beliefs

Focus on beliefs that could lead to suboptimal decisions or actions.
Respond in JSON format.`,
        },
      ],
      temperature: 0.3,
      maxTokens: 1000,
    };

    try {
      const response = await this.llm.generateResponse(
        context.messages?.[0]?.content || 'Detect false beliefs',
        context
      );
      return this.parseFalseBeliefDetection(
        response.text,
        agentId,
        beliefDomain
      );
    } catch (error) {
      console.warn(
        `Failed to detect false beliefs for agent ${agentId}:`,
        error
      );
      return this.createEmptyFalseBeliefDetection(agentId, beliefDomain);
    }
  }

  async reasonAboutAgentReasoning(
    agentId: string,
    reasoningTarget: string
  ): Promise<MetaReasoning> {
    if (!this.config.enableSecondOrderToM) {
      throw new Error('Second-order theory of mind is disabled');
    }

    const agentModel = this.agentModeler.getAgentModel(agentId);
    if (!agentModel) {
      throw new Error(`Agent model for ${agentId} not found`);
    }

    const context: LLMContext = {
      systemPrompt: `You are performing second-order theory of mind reasoning: thinking about what one agent thinks about another agent.`,
      messages: [
        {
          role: 'user',
          content: `Analyze what agent ${agentId} thinks about "${reasoningTarget}".

Agent ${agentId} Profile:
- Personality: ${JSON.stringify(agentModel.inferredPersonality, null, 2)}
- Social Role: ${JSON.stringify(agentModel.socialRole, null, 2)}
- Relationship Status: ${JSON.stringify(agentModel.relationshipStatus, null, 2)}
- Behavioral Patterns: ${JSON.stringify(agentModel.behavioralPatterns, null, 2)}

Please analyze:
1. What does agent ${agentId} think about ${reasoningTarget}?
2. What does agent ${agentId} believe ${reasoningTarget} thinks or believes?
3. How does agent ${agentId} model ${reasoningTarget}'s mental state?
4. What assumptions does agent ${agentId} make about ${reasoningTarget}?
5. How confident is agent ${agentId} in their understanding of ${reasoningTarget}?

This is complex reasoning about thinking about thinking. Be precise about the layers.
Respond in JSON format.`,
        },
      ],
      temperature: 0.3,
      maxTokens: 1000,
    };

    try {
      const response = await this.llm.generateResponse(
        context.messages?.[0]?.content || 'Reason about agent reasoning',
        context
      );
      return this.parseMetaReasoning(response.text, agentId, reasoningTarget);
    } catch (error) {
      console.warn(
        `Failed to reason about agent reasoning for ${agentId}:`,
        error
      );
      return this.createEmptyMetaReasoning(agentId, reasoningTarget);
    }
  }

  // ============================================================================
  // Core Mental State Inference
  // ============================================================================

  private async performMentalStateInference(
    agentModel: AgentModel,
    context: SocialContext
  ): Promise<MentalStateInference> {
    const context_: LLMContext = {
      systemPrompt: `You are performing theory of mind inference to understand an agent's current mental state.`,
      messages: [
        {
          role: 'user',
          content: `Infer the current mental state of agent ${agentModel.agentId} in this context: ${JSON.stringify(context, null, 2)}

Agent Model:
- Personality: ${JSON.stringify(agentModel.inferredPersonality, null, 2)}
- Goals: ${JSON.stringify(agentModel.goalInferences, null, 2)}
- Beliefs: ${JSON.stringify(agentModel.beliefStates, null, 2)}
- Behavioral Patterns: ${JSON.stringify(agentModel.behavioralPatterns, null, 2)}
- Social Role: ${JSON.stringify(agentModel.socialRole, null, 2)}

Please infer:
1. Current beliefs about the situation and key facts
2. Active goals and their priorities
3. Current emotional state and triggers
4. What the agent is focusing attention on
5. What the agent knows vs. doesn't know
6. Overall confidence in these inferences

Base inferences on the agent's established patterns and the current context.
Respond in JSON format.`,
        },
      ],
      temperature: 0.4,
      maxTokens: 1200,
    };

    try {
      const response = await this.llm.generateResponse(
        context_.messages?.[0]?.content || 'Infer mental state',
        context_
      );
      return this.parseMentalStateInference(response.text, agentModel.agentId);
    } catch (error) {
      console.warn(
        `Failed to infer mental state for agent ${agentModel.agentId}:`,
        error
      );
      return this.createEmptyMentalStateInference(agentModel.agentId);
    }
  }

  private async generateActionPrediction(
    agentModel: AgentModel,
    mentalState: MentalStateInference,
    situation: Situation
  ): Promise<ActionPrediction> {
    const context: LLMContext = {
      systemPrompt: `You are predicting an agent's likely actions based on their mental state and situation.`,
      messages: [
        {
          role: 'user',
          content: `Predict actions for agent ${agentModel.agentId} given their mental state and situation.

Current Mental State:
${JSON.stringify(mentalState, null, 2)}

Situation:
${JSON.stringify(situation, null, 2)}

Agent Capabilities:
${JSON.stringify(agentModel.capabilities, null, 2)}

Please provide:
1. Most likely actions (ranked by probability)
2. Reasoning chain for each prediction
3. Alternative scenarios that could change predictions
4. Timeline for when actions might occur
5. Confidence in predictions

Consider the agent's goals, beliefs, emotions, and capabilities.
Respond in JSON format.`,
        },
      ],
      temperature: 0.4,
      maxTokens: 1200,
    };

    try {
      const response = await this.llm.generateResponse(
        context.messages?.[0]?.content || 'Predict agent action',
        context
      );
      return this.parseActionPrediction(response.text, agentModel.agentId);
    } catch (error) {
      console.warn(
        `Failed to predict actions for agent ${agentModel.agentId}:`,
        error
      );
      return this.createEmptyActionPrediction(agentModel.agentId);
    }
  }

  // ============================================================================
  // Response Parsing Methods
  // ============================================================================

  private parseMentalStateInference(
    response: string,
    agentId: string
  ): MentalStateInference {
    try {
      const candidate = extractJson(response);
      const parsed = JSON.parse(candidate);
      return {
        agentId,
        currentBeliefs: this.parseBeliefs(parsed.beliefs || {}),
        currentGoals: this.parseGoals(parsed.goals || []),
        currentEmotions: this.parseEmotions(parsed.emotions || {}),
        attentionFocus: this.parseAttention(parsed.attention || {}),
        knowledgeState: this.parseKnowledge(parsed.knowledge || {}),
        confidence: parsed.confidence || 0.5,
        inferenceReasoning: parsed.reasoning || 'Theory of mind inference',
        timestamp: Date.now(),
      };
    } catch (error) {
      // Emit structured error for observability (not just console.error)
      console.error('Failed to parse mental state inference:', error);
      this.emitParseFailedEvent?.('parseMentalStateInference', response, error);
      return this.createEmptyMentalStateInference(agentId);
    }
  }

  private parseActionPrediction(
    response: string,
    agentId: string
  ): ActionPrediction {
    try {
      const candidate = extractJson(response);
      const parsed = JSON.parse(candidate);
      return {
        agentId,
        predictedActions: this.parsePredictedActions(parsed.actions || []),
        predictionConfidence: parsed.confidence || 0.5,
        reasoningChain: this.parseReasoningChain(parsed.reasoning || []),
        alternativeScenarios: this.parseAlternativeScenarios(
          parsed.alternatives || []
        ),
        temporalLikelihood: this.parseTemporalLikelihood(parsed.timeline || {}),
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Failed to parse action prediction:', error);
      this.emitParseFailedEvent?.('parseActionPrediction', response, error);
      return this.createEmptyActionPrediction(agentId);
    }
  }

  private parsePerspectiveSimulation(
    response: string,
    agentId: string,
    scenario: Scenario
  ): PerspectiveSimulation {
    try {
      const candidate = extractJson(response);
      const parsed = JSON.parse(candidate);
      return {
        agentId,
        scenario: scenario.description,
        simulatedViewpoint: parsed.viewpoint || '',
        simulatedBeliefs: parsed.beliefs || {},
        simulatedGoals: parsed.goals || [],
        simulatedEmotions: parsed.emotions || [],
        simulatedReactions: parsed.reactions || [],
        confidence: parsed.confidence || 0.5,
        reasoning: parsed.reasoning || 'Perspective simulation',
        limitationsNoted: parsed.limitations || [],
      };
    } catch (error) {
      console.warn('Failed to parse perspective simulation:', error);
      return this.createEmptyPerspectiveSimulation(agentId, scenario);
    }
  }

  private parseFalseBeliefDetection(
    response: string,
    agentId: string,
    beliefDomain: string
  ): FalseBeliefDetection {
    try {
      const parsed = JSON.parse(response);
      return {
        agentId,
        beliefDomain,
        suspectedFalseBeliefs: this.parseFalseBeliefs(
          parsed.falseBeliefs || []
        ),
        confidence: parsed.confidence || 0.5,
        evidence: parsed.evidence || [],
        reasoning: parsed.reasoning || 'False belief analysis',
        implications: parsed.implications || [],
      };
    } catch (error) {
      console.warn('Failed to parse false belief detection:', error);
      return this.createEmptyFalseBeliefDetection(agentId, beliefDomain);
    }
  }

  private parseMetaReasoning(
    response: string,
    agentId: string,
    reasoningTarget: string
  ): MetaReasoning {
    try {
      const parsed = JSON.parse(response);
      return {
        agentId,
        reasoningTarget,
        agentThoughtsAboutTarget: parsed.thoughts || [],
        secondOrderBeliefs: parsed.secondOrderBeliefs || {},
        agentModelOfTarget: parsed.modelOfTarget || '',
        confidence: parsed.confidence || 0.5,
        reasoning: parsed.reasoning || 'Meta-reasoning analysis',
        complexityLevel: parsed.complexity || 1,
      };
    } catch (error) {
      console.warn('Failed to parse meta-reasoning:', error);
      return this.createEmptyMetaReasoning(agentId, reasoningTarget);
    }
  }

  // ============================================================================
  // Sub-parsing Methods
  // ============================================================================

  private parseBeliefs(beliefs: any): Record<string, BeliefState> {
    const result: Record<string, BeliefState> = {};

    Object.entries(beliefs).forEach(([key, value]: [string, any]) => {
      result[key] = {
        content: value.content || value.toString(),
        confidence: value.confidence || 0.5,
        accuracy: value.accuracy || null,
        source: value.source || 'inferred',
        lastUpdated: Date.now(),
      };
    });

    return result;
  }

  private parseGoals(goals: any[]): Goal[] {
    return goals.map((goal, index) => ({
      id: goal.id || `goal_${index}`,
      description: goal.description || goal.toString(),
      priority: goal.priority || 0.5,
      urgency: goal.urgency || 0.5,
      progress: goal.progress || 0,
      obstacles: goal.obstacles || [],
      subgoals: goal.subgoals || [],
    }));
  }

  private parseEmotions(emotions: any): EmotionalState {
    return {
      primary: emotions.primary || 'neutral',
      intensity: emotions.intensity || 0.5,
      secondary: emotions.secondary || [],
      triggers: emotions.triggers || [],
      duration: emotions.duration || 0,
      stability: emotions.stability || 0.5,
    };
  }

  private parseAttention(attention: any): AttentionState {
    return {
      focusTarget: attention.target || 'unknown',
      focusIntensity: attention.intensity || 0.5,
      distractions: attention.distractions || [],
      attentionSpan: attention.span || 0,
      multitasking: attention.multitasking || false,
    };
  }

  private parseKnowledge(knowledge: any): KnowledgeState {
    return {
      knownFacts: knowledge.facts || [],
      uncertainties: knowledge.uncertainties || [],
      misconceptions: knowledge.misconceptions || [],
      knowledgeGaps: knowledge.gaps || [],
      expertiseDomains: knowledge.expertise || [],
      confidence: knowledge.confidence || 0.5,
    };
  }

  private parsePredictedActions(actions: any[]): PredictedAction[] {
    return actions.map((action) => ({
      action: action.action || action.toString(),
      probability: action.probability || 0.5,
      reasoning: action.reasoning || 'No reasoning provided',
      prerequisites: action.prerequisites || [],
      expectedOutcome: action.outcome || 'Unknown outcome',
      confidence: action.confidence || 0.5,
    }));
  }

  private parseReasoningChain(reasoning: any[]): ReasoningStep[] {
    return reasoning.map((step, index) => ({
      step: index + 1,
      type: this.parseReasoningType(step.type),
      content: step.content || step.toString(),
      confidence: step.confidence || 0.5,
      evidence: step.evidence || [],
    }));
  }

  private parseReasoningType(type: string): ReasoningType {
    const typeMap = {
      belief: ReasoningType.BELIEF_INFERENCE,
      goal: ReasoningType.GOAL_INFERENCE,
      emotion: ReasoningType.EMOTION_INFERENCE,
      action: ReasoningType.ACTION_PREDICTION,
      perspective: ReasoningType.PERSPECTIVE_TAKING,
      causal: ReasoningType.CAUSAL_REASONING,
    };

    return (
      typeMap[type.toLowerCase() as keyof typeof typeMap] ||
      ReasoningType.BELIEF_INFERENCE
    );
  }

  private parseAlternativeScenarios(scenarios: any[]): AlternativeScenario[] {
    return scenarios.map((scenario) => ({
      scenario: scenario.scenario || scenario.toString(),
      probability: scenario.probability || 0.3,
      triggerConditions: scenario.triggers || [],
      expectedActions: scenario.actions || [],
      reasoning: scenario.reasoning || 'Alternative scenario',
    }));
  }

  private parseTemporalLikelihood(timeline: any): TemporalLikelihood {
    return {
      immediate: timeline.immediate || 0.2,
      shortTerm: timeline.shortTerm || 0.3,
      mediumTerm: timeline.mediumTerm || 0.3,
      longTerm: timeline.longTerm || 0.2,
    };
  }

  private parseFalseBeliefs(beliefs: any[]): FalseBelief[] {
    return beliefs.map((belief) => ({
      belief: belief.belief || belief.toString(),
      actualTruth: belief.truth || 'Unknown',
      confidenceInFalseness: belief.confidence || 0.5,
      source: belief.source || 'inference',
      impact: belief.impact || 'Unknown impact',
      correctionStrategy: belief.correction || 'No strategy',
    }));
  }

  // ============================================================================
  // Factory Methods for Empty Objects
  // ============================================================================

  private createEmptyMentalStateInference(
    agentId: string
  ): MentalStateInference {
    return {
      agentId,
      currentBeliefs: {},
      currentGoals: [],
      currentEmotions: {
        primary: 'neutral',
        intensity: 0.5,
        secondary: [],
        triggers: [],
        duration: 0,
        stability: 0.5,
      },
      attentionFocus: {
        focusTarget: 'unknown',
        focusIntensity: 0.5,
        distractions: [],
        attentionSpan: 0,
        multitasking: false,
      },
      knowledgeState: {
        knownFacts: [],
        uncertainties: [],
        misconceptions: [],
        knowledgeGaps: [],
        expertiseDomains: [],
        confidence: 0.5,
      },
      confidence: 0.5,
      inferenceReasoning: 'No inference available',
      timestamp: Date.now(),
    };
  }

  private createEmptyActionPrediction(agentId: string): ActionPrediction {
    return {
      agentId,
      predictedActions: [],
      predictionConfidence: 0,
      reasoningChain: [],
      alternativeScenarios: [],
      temporalLikelihood: {
        immediate: 0.25,
        shortTerm: 0.25,
        mediumTerm: 0.25,
        longTerm: 0.25,
      },
      timestamp: Date.now(),
    };
  }

  private createEmptyPerspective(agentId: string): any {
    return {
      agentId,
      perspective: 'Unable to simulate perspective',
      confidence: 0,
      timestamp: Date.now(),
    };
  }

  private parseIntentions(response: string): Intention[] {
    return response
      .split('\n')
      .filter(
        (line) => line.trim().startsWith('-') || line.trim().startsWith('•')
      )
      .map((line, index) => ({
        id: `intention-${Date.now()}-${index}`,
        description: line.replace(/^[-•]\s*/, '').trim(),
        confidence: 0.7,
        reasoning: 'Based on mental state analysis',
        timestamp: Date.now(),
        type: 'general' as const,
        timeframe: 'short_term' as const,
        prerequisites: [],
      }))
      .filter((intention) => intention.description.length > 0);
  }

  private createEmptyPerspectiveSimulation(
    agentId: string,
    scenario: Scenario
  ): PerspectiveSimulation {
    return {
      agentId,
      scenario: scenario.description,
      simulatedViewpoint: 'No simulation available',
      simulatedBeliefs: {},
      simulatedGoals: [],
      simulatedEmotions: [],
      simulatedReactions: [],
      confidence: 0,
      reasoning: 'No simulation performed',
      limitationsNoted: ['No agent model available'],
    };
  }

  private createEmptyFalseBeliefDetection(
    agentId: string,
    beliefDomain: string
  ): FalseBeliefDetection {
    return {
      agentId,
      beliefDomain,
      suspectedFalseBeliefs: [],
      confidence: 0,
      evidence: [],
      reasoning: 'No analysis performed',
      implications: [],
    };
  }

  private createEmptyMetaReasoning(
    agentId: string,
    reasoningTarget: string
  ): MetaReasoning {
    return {
      agentId,
      reasoningTarget,
      agentThoughtsAboutTarget: [],
      secondOrderBeliefs: {},
      agentModelOfTarget: 'No model available',
      confidence: 0,
      reasoning: 'No meta-reasoning performed',
      complexityLevel: 0,
    };
  }

  // ============================================================================
  // Public Query Methods
  // ============================================================================

  getCachedMentalState(agentId: string): MentalStateInference | undefined {
    return this.mentalStateCache.get(agentId);
  }

  clearCache(): void {
    this.mentalStateCache.clear();
  }

  getStats() {
    return {
      cachedMentalStates: this.mentalStateCache.size,
      activeInferences: this.activeInferences.size,
      firstOrderToMEnabled: this.config.enableFirstOrderToM,
      secondOrderToMEnabled: this.config.enableSecondOrderToM,
      falseBeliefReasoningEnabled: this.config.enableFalseBeliefReasoning,
      reasoningDepth: this.config.tomReasoningDepth,
    };
  }
}

// ============================================================================
// Supporting Interfaces
// ============================================================================

export interface SocialContext {
  situation: string;
  participants: string[];
  environment: any;
  timeContext?: string;
  socialDynamics?: string[];
}

export interface Situation {
  description: string;
  context: any;
  participants: string[];
  urgency: number;
  complexity: number;
  timeConstraint?: number;
}

export interface Scenario {
  description: string;
  context: any;
  participants: string[];
  goals: string[];
  constraints: string[];
  timeframe: string;
}
