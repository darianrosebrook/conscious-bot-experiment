/**
 * Dual-Channel Prompting System
 *
 * Provides operational (low temperature) and expressive (high temperature) channels
 * for task parsing and user interaction, enabling both precise task execution
 * and creative, context-aware language generation.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import {
  EnvironmentalContext,
  TaskDefinition,
  TaskParsingResult,
  TaskValidationResult,
  TaskFeasibility,
  ChatMessage,
  Command,
} from './types';

// ===== DUAL-CHANNEL SCHEMAS =====

/**
 * Channel type enumeration
 */
export const ChannelTypeSchema = z.enum(['operational', 'expressive']);

export type ChannelType = z.infer<typeof ChannelTypeSchema>;

/**
 * Prompt configuration for each channel
 */
export const PromptConfigSchema = z.object({
  temperature: z.number().min(0).max(2),
  max_tokens: z.number().positive(),
  top_p: z.number().min(0).max(1),
  frequency_penalty: z.number().min(-2).max(2),
  presence_penalty: z.number().min(-2).max(2),
  system_prompt: z.string(),
  user_prompt_template: z.string(),
});

export type PromptConfig = z.infer<typeof PromptConfigSchema>;

/**
 * Dual-channel configuration
 */
export const DualChannelConfigSchema = z.object({
  operational: PromptConfigSchema,
  expressive: PromptConfigSchema,
  context_aware_routing: z.boolean(),
  auto_fallback: z.boolean(),
  max_retries: z.number().nonnegative(),
  timeout_ms: z.number().positive(),
});

export type DualChannelConfig = z.infer<typeof DualChannelConfigSchema>;

/**
 * Channel selection criteria
 */
export const ChannelSelectionCriteriaSchema = z.object({
  task_complexity: z.number().min(0).max(1),
  user_intent: z.enum(['command', 'question', 'conversation', 'creative']),
  environmental_context: z.string(),
  urgency: z.number().min(0).max(1),
  social_context: z.string(),
});

export type ChannelSelectionCriteria = z.infer<
  typeof ChannelSelectionCriteriaSchema
>;

/**
 * Prompt result with channel information
 */
export const PromptResultSchema = z.object({
  id: z.string(),
  channel: ChannelTypeSchema,
  prompt: z.string(),
  response: z.string(),
  confidence: z.number().min(0).max(1),
  processing_time: z.number(),
  metadata: z.record(z.any()),
});

export type PromptResult = z.infer<typeof PromptResultSchema>;

/**
 * Task paraphrasing result
 */
export const TaskParaphraseResultSchema = z.object({
  original_task: z.string(),
  paraphrased_task: z.string(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  channel_used: ChannelTypeSchema,
  context_adaptations: z.array(z.string()),
});

export type TaskParaphraseResult = z.infer<typeof TaskParaphraseResultSchema>;

// ===== DEFAULT CONFIGURATIONS =====

/**
 * Default operational channel configuration (low temperature, precise)
 */
export const DEFAULT_OPERATIONAL_CONFIG: PromptConfig = {
  temperature: 0.1,
  max_tokens: 500,
  top_p: 0.9,
  frequency_penalty: 0.0,
  presence_penalty: 0.0,
  system_prompt: `You are a precise task parser for a Minecraft bot. Your role is to:
1. Parse user input into structured task definitions
2. Extract specific parameters and requirements
3. Provide clear, actionable instructions
4. Maintain consistency with game mechanics
5. Focus on accuracy over creativity

Always respond with valid JSON task definitions.`,
  user_prompt_template: `Parse the following user request into a structured task:

User Request: {user_input}
Environmental Context: {environmental_context}
Current Time: {timestamp}

Respond with a JSON task definition.`,
};

/**
 * Default expressive channel configuration (high temperature, creative)
 */
export const DEFAULT_EXPRESSIVE_CONFIG: PromptConfig = {
  temperature: 0.8,
  max_tokens: 800,
  top_p: 0.95,
  frequency_penalty: 0.1,
  presence_penalty: 0.1,
  system_prompt: `You are a creative, context-aware assistant for a Minecraft bot. Your role is to:
1. Understand user intent and emotions
2. Provide engaging, natural responses
3. Adapt language to the current context
4. Offer creative suggestions and alternatives
5. Maintain the bot's personality and character

Be helpful, friendly, and contextually aware.`,
  user_prompt_template: `Respond to the following user input in a natural, context-aware way:

User Input: {user_input}
Environmental Context: {environmental_context}
Bot Personality: {bot_personality}
Current Situation: {current_situation}

Provide a helpful, engaging response.`,
};

/**
 * Default dual-channel configuration
 */
export const DEFAULT_DUAL_CHANNEL_CONFIG: DualChannelConfig = {
  operational: DEFAULT_OPERATIONAL_CONFIG,
  expressive: DEFAULT_EXPRESSIVE_CONFIG,
  context_aware_routing: true,
  auto_fallback: true,
  max_retries: 3,
  timeout_ms: 10000,
};

// ===== DUAL-CHANNEL PROMPTING SYSTEM =====

/**
 * Dual-Channel Prompting System
 *
 * Manages operational and expressive channels for task parsing and user interaction,
 * providing context-aware routing and automatic fallback mechanisms.
 */
export class DualChannelPrompting extends EventEmitter {
  private config: DualChannelConfig;
  private promptHistory: Map<string, PromptResult> = new Map();
  private channelUsageStats: Map<ChannelType, number> = new Map();
  private performanceMetrics = {
    operational_success_rate: 0,
    expressive_success_rate: 0,
    average_response_time: 0,
    fallback_rate: 0,
    context_accuracy: 0,
  };

  constructor(config: Partial<DualChannelConfig> = {}) {
    super();
    this.config = { ...DEFAULT_DUAL_CHANNEL_CONFIG, ...config };
    this.channelUsageStats.set('operational', 0);
    this.channelUsageStats.set('expressive', 0);
  }

  /**
   * Select the appropriate channel based on context and user input
   */
  selectChannel(
    userInput: string,
    environmentalContext: EnvironmentalContext,
    criteria?: Partial<ChannelSelectionCriteria>
  ): ChannelType {
    const selectionCriteria: ChannelSelectionCriteria = {
      task_complexity: 0.5,
      user_intent: 'command',
      environmental_context: 'normal',
      urgency: 0.5,
      social_context: 'neutral',
      ...criteria,
    };

    // Analyze user input for intent
    const intent = this.analyzeUserIntent(userInput);
    selectionCriteria.user_intent = intent;

    // Analyze task complexity
    const complexity = this.analyzeTaskComplexity(userInput);
    selectionCriteria.task_complexity = complexity;

    // Analyze urgency
    const urgency = this.analyzeUrgency(userInput);
    selectionCriteria.urgency = urgency;

    // Analyze environmental context
    const envContext = this.analyzeEnvironmentalContext(environmentalContext);
    selectionCriteria.environmental_context = envContext;

    // Channel selection logic
    if (this.config.context_aware_routing) {
      return this.contextAwareChannelSelection(selectionCriteria);
    } else {
      return this.simpleChannelSelection(selectionCriteria);
    }
  }

  /**
   * Generate a prompt using the specified channel
   */
  async generatePrompt(
    channel: ChannelType,
    userInput: string,
    environmentalContext: EnvironmentalContext,
    additionalContext?: Record<string, any>
  ): Promise<PromptResult> {
    const startTime = Date.now();
    const promptId = uuidv4();

    try {
      const config = this.config[channel];
      const prompt = this.buildPrompt(
        config,
        userInput,
        environmentalContext,
        additionalContext
      );

      // Simulate LLM call (in real implementation, this would call the actual LLM)
      const response = await this.simulateLLMCall(channel, prompt, config);

      const processingTime = Date.now() - startTime;
      const confidence = this.calculateConfidence(
        channel,
        response,
        environmentalContext
      );

      const result: PromptResult = {
        id: promptId,
        channel,
        prompt,
        response,
        confidence,
        processing_time: processingTime,
        metadata: {
          config_used: config,
          environmental_context: environmentalContext,
          additional_context: additionalContext,
        },
      };

      // Store in history
      this.storePromptResult(result);
      this.updateChannelUsageStats(channel);
      this.updatePerformanceMetrics(channel, true, processingTime);

      this.emit('prompt_generated', result);
      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.updatePerformanceMetrics(channel, false, processingTime);

      // Handle fallback if enabled
      if (this.config.auto_fallback && channel === 'operational') {
        this.emit('fallback_triggered', {
          from: channel,
          to: 'expressive',
          error,
        });
        return this.generatePrompt(
          'expressive',
          userInput,
          environmentalContext,
          additionalContext
        );
      }

      throw error;
    }
  }

  /**
   * Parse user input into a structured task using dual-channel approach
   */
  async parseUserInput(
    userInput: string,
    environmentalContext: EnvironmentalContext
  ): Promise<TaskParsingResult> {
    const startTime = Date.now();

    // Validate input
    if (!userInput || userInput.trim().length === 0) {
      throw new Error('User input cannot be empty');
    }

    try {
      // Select appropriate channel
      const channel = this.selectChannel(userInput, environmentalContext);

      // Generate prompt and response
      const promptResult = await this.generatePrompt(
        channel,
        userInput,
        environmentalContext
      );

      // Parse the response into a task definition
      const task = await this.parseResponseToTask(
        promptResult.response,
        channel
      );

      // Validate the task
      const validation = await this.validateTask(task, environmentalContext);

      // Check feasibility
      const feasibility = await this.checkFeasibility(
        task,
        environmentalContext
      );

      const parsingTime = Date.now() - startTime;

      const result: TaskParsingResult = {
        task,
        validation,
        feasibility,
        environmental_context: environmentalContext,
        parsing_time: parsingTime,
      };

      this.emit('task_parsed', { result, channel_used: channel });
      return result;
    } catch (error) {
      const parsingTime = Date.now() - startTime;

      // If operational channel fails, try expressive channel
      if (this.config.auto_fallback) {
        this.emit('fallback_attempt', { error, retry_with: 'expressive' });
        return this.parseUserInputWithChannel(
          'expressive',
          userInput,
          environmentalContext
        );
      }

      throw error;
    }
  }

  /**
   * Paraphrase a task for better understanding and user interaction
   */
  async paraphraseTask(
    task: TaskDefinition,
    environmentalContext: EnvironmentalContext,
    targetAudience: 'user' | 'system' = 'user'
  ): Promise<TaskParaphraseResult> {
    const startTime = Date.now();

    try {
      // Select channel based on target audience
      const channel: ChannelType =
        targetAudience === 'user' ? 'expressive' : 'operational';

      // Create paraphrasing prompt
      const prompt = this.buildParaphrasingPrompt(
        task,
        environmentalContext,
        targetAudience
      );

      // Generate paraphrase
      const promptResult = await this.generatePrompt(
        channel,
        prompt,
        environmentalContext
      );

      // Extract paraphrased task and reasoning
      const paraphraseData = this.extractParaphraseData(promptResult.response);

      const processingTime = Date.now() - startTime;

      const result: TaskParaphraseResult = {
        original_task: JSON.stringify(task),
        paraphrased_task: paraphraseData.paraphrase,
        confidence: promptResult.confidence,
        reasoning: paraphraseData.reasoning,
        channel_used: channel,
        context_adaptations: paraphraseData.adaptations,
      };

      this.emit('task_paraphrased', result);
      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.emit('paraphrase_error', { error, task, processingTime });
      throw error;
    }
  }

  /**
   * Generate a creative, context-aware response to user input
   */
  async generateCreativeResponse(
    userInput: string,
    environmentalContext: EnvironmentalContext,
    botPersonality: string = 'friendly and helpful'
  ): Promise<string> {
    try {
      const promptResult = await this.generatePrompt(
        'expressive',
        userInput,
        environmentalContext,
        { bot_personality: botPersonality }
      );

      return promptResult.response;
    } catch (error) {
      this.emit('creative_response_error', { error, userInput });
      throw error;
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  /**
   * Analyze user intent from input text
   */
  private analyzeUserIntent(
    userInput: string
  ): ChannelSelectionCriteria['user_intent'] {
    const lowerInput = userInput.toLowerCase();

    if (
      lowerInput.includes('?') ||
      lowerInput.includes('what') ||
      lowerInput.includes('how')
    ) {
      return 'question';
    } else if (
      lowerInput.includes('please') ||
      lowerInput.includes('can you') ||
      lowerInput.includes('help')
    ) {
      return 'command';
    } else if (
      lowerInput.includes('hello') ||
      lowerInput.includes('hi') ||
      lowerInput.includes('greetings')
    ) {
      return 'conversation';
    } else if (
      lowerInput.includes('build') ||
      lowerInput.includes('gather') ||
      lowerInput.includes('craft')
    ) {
      return 'command';
    } else if (
      lowerInput.includes('story') ||
      lowerInput.includes('imagine') ||
      lowerInput.includes('creative')
    ) {
      return 'creative';
    } else {
      return 'command';
    }
  }

  /**
   * Analyze task complexity from user input
   */
  private analyzeTaskComplexity(userInput: string): number {
    const lowerInput = userInput.toLowerCase();
    let complexity = 0.3; // Base complexity

    // Add complexity for multi-step tasks
    if (lowerInput.includes('and') || lowerInput.includes('then')) {
      complexity += 0.2;
    }

    // Add complexity for specific requirements
    if (lowerInput.includes('specific') || lowerInput.includes('exact')) {
      complexity += 0.1;
    }

    // Add complexity for conditional logic
    if (
      lowerInput.includes('if') ||
      lowerInput.includes('when') ||
      lowerInput.includes('unless')
    ) {
      complexity += 0.2;
    }

    // Add complexity for resource specifications
    if (lowerInput.match(/\d+/)) {
      complexity += 0.1;
    }

    return Math.min(1.0, complexity);
  }

  /**
   * Analyze urgency from user input
   */
  private analyzeUrgency(userInput: string): number {
    const lowerInput = userInput.toLowerCase();
    let urgency = 0.5; // Base urgency

    if (
      lowerInput.includes('urgent') ||
      lowerInput.includes('immediately') ||
      lowerInput.includes('now')
    ) {
      urgency = 0.9;
    } else if (lowerInput.includes('soon') || lowerInput.includes('quickly')) {
      urgency = 0.7;
    } else if (
      lowerInput.includes('whenever') ||
      lowerInput.includes('sometime')
    ) {
      urgency = 0.3;
    }

    return urgency;
  }

  /**
   * Analyze environmental context for channel selection
   */
  private analyzeEnvironmentalContext(
    environmentalContext: EnvironmentalContext
  ): string {
    if (environmentalContext.threat_level > 0.8) {
      return 'dangerous';
    } else if (environmentalContext.threat_level > 0.5) {
      return 'risky';
    } else if (environmentalContext.time_of_day === 'night') {
      return 'night';
    } else if (environmentalContext.weather === 'storm') {
      return 'storm';
    } else {
      return 'normal';
    }
  }

  /**
   * Context-aware channel selection
   */
  private contextAwareChannelSelection(
    criteria: ChannelSelectionCriteria
  ): ChannelType {
    // High complexity tasks -> operational
    if (criteria.task_complexity > 0.7) {
      return 'operational';
    }

    // Creative or conversational intent -> expressive
    if (
      criteria.user_intent === 'creative' ||
      criteria.user_intent === 'conversation'
    ) {
      return 'expressive';
    }

    // High urgency -> operational for precision
    if (criteria.urgency > 0.8) {
      return 'operational';
    }

    // Dangerous environment -> operational for safety
    if (criteria.environmental_context === 'dangerous') {
      return 'operational';
    }

    // Questions -> expressive for better explanations
    if (criteria.user_intent === 'question') {
      return 'expressive';
    }

    // Default to operational for commands
    if (criteria.user_intent === 'command') {
      return 'operational';
    }

    // Default to expressive for natural interaction
    return 'expressive';
  }

  /**
   * Simple channel selection based on intent
   */
  private simpleChannelSelection(
    criteria: ChannelSelectionCriteria
  ): ChannelType {
    if (criteria.user_intent === 'command') {
      return 'operational';
    } else {
      return 'expressive';
    }
  }

  /**
   * Build prompt using the specified configuration
   */
  private buildPrompt(
    config: PromptConfig,
    userInput: string,
    environmentalContext: EnvironmentalContext,
    additionalContext?: Record<string, any>
  ): string {
    let prompt = config.user_prompt_template;

    // Replace template variables
    prompt = prompt.replace('{user_input}', userInput);
    prompt = prompt.replace(
      '{environmental_context}',
      JSON.stringify(environmentalContext)
    );
    prompt = prompt.replace('{timestamp}', Date.now().toString());

    if (additionalContext) {
      Object.entries(additionalContext).forEach(([key, value]) => {
        prompt = prompt.replace(`{${key}}`, String(value));
      });
    }

    return prompt;
  }

  /**
   * Build paraphrasing prompt
   */
  private buildParaphrasingPrompt(
    task: TaskDefinition,
    environmentalContext: EnvironmentalContext,
    targetAudience: 'user' | 'system'
  ): string {
    if (targetAudience === 'user') {
      return `Paraphrase this task in a natural, user-friendly way:

Task: ${JSON.stringify(task)}
Environmental Context: ${JSON.stringify(environmentalContext)}

Provide a clear, engaging description that a user would understand.`;
    } else {
      return `Convert this task into a precise system instruction:

Task: ${JSON.stringify(task)}
Environmental Context: ${JSON.stringify(environmentalContext)}

Provide a structured, technical description for system execution.`;
    }
  }

  /**
   * Simulate LLM call (placeholder for actual implementation)
   */
  private async simulateLLMCall(
    channel: ChannelType,
    prompt: string,
    config: PromptConfig
  ): Promise<string> {
    // Simulate processing time based on temperature (much faster for testing)
    const processingTime = Math.random() * 50 + 10; // 10-60ms instead of 500-1500ms
    await new Promise((resolve) => setTimeout(resolve, processingTime));

    // Analyze the prompt to determine task type
    const lowerPrompt = prompt.toLowerCase();
    let taskType = 'gathering';
    let resource = 'wood';
    let quantity = 10;
    let location = 'nearest_forest';

    // Look for crafting-related keywords
    if (
      lowerPrompt.includes('craft') ||
      lowerPrompt.includes('diamond pickaxe') ||
      lowerPrompt.includes('pickaxe') ||
      lowerPrompt.includes('crafting') ||
      lowerPrompt.includes('diamond')
    ) {
      taskType = 'crafting';
      resource = 'diamond';
      quantity = 1;
      location = 'crafting_table';
    } else if (
      lowerPrompt.includes('shelter') ||
      lowerPrompt.includes('house') ||
      lowerPrompt.includes('build') ||
      lowerPrompt.includes('construction')
    ) {
      taskType = 'building';
      resource = 'materials';
      quantity = 5;
      location = 'current_location';
    } else if (
      lowerPrompt.includes('explore') ||
      lowerPrompt.includes('search') ||
      lowerPrompt.includes('find')
    ) {
      taskType = 'exploration';
      resource = 'information';
      quantity = 1;
      location = 'surrounding_area';
    }

    if (channel === 'operational') {
      // Return structured task definition
      return JSON.stringify({
        type: taskType,
        parameters: {
          resource,
          quantity,
          location,
        },
        priority: 0.7,
        safety_level: 'safe',
        estimated_duration: 300000,
      });
    } else {
      // Return natural language response
      if (taskType === 'crafting') {
        return `I understand you'd like me to help you craft a diamond pickaxe. I'll gather the necessary materials and use the crafting table to create it for you. This should be a safe task that will take me about 5 minutes to complete.`;
      } else if (taskType === 'building') {
        return `I understand you need shelter immediately. I'll gather building materials and construct a safe shelter for you right away. This is urgent and I'll prioritize your safety.`;
      } else {
        return `I understand you'd like me to gather some ${resource} for you. I'll head to the ${location} and collect about ${quantity} pieces. This should be a safe task that will take me about 5 minutes to complete. I'll make sure to stay alert for any potential dangers while I'm out there.`;
      }
    }
  }

  /**
   * Calculate confidence score for the response
   */
  private calculateConfidence(
    channel: ChannelType,
    response: string,
    environmentalContext: EnvironmentalContext
  ): number {
    let confidence = 0.8; // Base confidence

    // Adjust based on channel
    if (channel === 'operational') {
      try {
        JSON.parse(response);
        confidence += 0.1; // Valid JSON
      } catch {
        confidence -= 0.2; // Invalid JSON
      }
    } else {
      // Expressive channel confidence based on response length and content
      if (response.length > 50) {
        confidence += 0.1;
      }
      if (response.includes('understand') || response.includes('help')) {
        confidence += 0.1;
      }
    }

    // Adjust based on environmental context
    if (environmentalContext.threat_level > 0.8) {
      confidence -= 0.1; // Lower confidence in dangerous situations
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Parse response to task definition
   */
  private async parseResponseToTask(
    response: string,
    channel: ChannelType
  ): Promise<TaskDefinition> {
    if (channel === 'operational') {
      try {
        const taskData = JSON.parse(response);
        return {
          id: uuidv4(),
          ...taskData,
          created_at: Date.now(),
          updated_at: Date.now(),
        };
      } catch (error) {
        throw new Error(
          `Failed to parse operational response as JSON: ${error}`
        );
      }
    } else {
      // For expressive channel, extract task information from natural language
      return this.extractTaskFromNaturalLanguage(response);
    }
  }

  /**
   * Extract task from natural language response
   */
  private extractTaskFromNaturalLanguage(response: string): TaskDefinition {
    // Enhanced extraction logic - in real implementation, this would be more sophisticated
    const lowerResponse = response.toLowerCase();

    let type = 'exploration';
    const parameters: Record<string, any> = {};

    // Check for crafting first (before gathering, since crafting responses might mention gathering materials)
    if (
      lowerResponse.includes('craft') ||
      lowerResponse.includes('diamond pickaxe') ||
      lowerResponse.includes('pickaxe') ||
      lowerResponse.includes('crafting')
    ) {
      type = 'crafting';
      parameters.resource = 'diamond';
      parameters.tool = 'crafting_table';
    } else if (
      lowerResponse.includes('build') ||
      lowerResponse.includes('construct') ||
      lowerResponse.includes('shelter')
    ) {
      type = 'building';
      parameters.material = 'building_materials';
      parameters.location = 'current_location';
    } else if (
      lowerResponse.includes('gather') ||
      lowerResponse.includes('collect')
    ) {
      type = 'gathering';
      const resourceMatch = lowerResponse.match(/(?:gather|collect)\s+(\w+)/);
      if (resourceMatch) {
        parameters.resource = resourceMatch[1];
      }
    } else if (
      lowerResponse.includes('explore') ||
      lowerResponse.includes('search') ||
      lowerResponse.includes('find')
    ) {
      type = 'exploration';
      parameters.target = 'information';
      parameters.area = 'surrounding_area';
    }

    return {
      id: uuidv4(),
      type: type as any,
      parameters,
      priority: 0.5,
      safety_level: 'safe',
      estimated_duration: 300000,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
  }

  /**
   * Extract paraphrase data from response
   */
  private extractParaphraseData(response: string): {
    paraphrase: string;
    reasoning: string;
    adaptations: string[];
  } {
    // Simple extraction - in real implementation, this would parse structured output
    return {
      paraphrase: response,
      reasoning: 'Generated based on task context and user preferences',
      adaptations: ['Simplified language', 'Added context awareness'],
    };
  }

  /**
   * Validate task (placeholder - would integrate with existing validation)
   */
  private async validateTask(
    task: TaskDefinition,
    environmentalContext: EnvironmentalContext
  ): Promise<TaskValidationResult> {
    // Placeholder implementation
    return {
      is_valid: true,
      errors: [],
      warnings: [],
      suggestions: [],
      confidence: 0.8,
    };
  }

  /**
   * Check feasibility (placeholder - would integrate with existing feasibility)
   */
  private async checkFeasibility(
    task: TaskDefinition,
    environmentalContext: EnvironmentalContext
  ): Promise<TaskFeasibility> {
    // Placeholder implementation
    return {
      is_feasible: true,
      confidence: 0.8,
      missing_resources: [],
      missing_skills: [],
      environmental_constraints: [],
      estimated_cost: 100,
      risk_assessment: {
        level: 'safe',
        factors: [],
        mitigation_strategies: [],
      },
    };
  }

  /**
   * Parse user input with specific channel
   */
  private async parseUserInputWithChannel(
    channel: ChannelType,
    userInput: string,
    environmentalContext: EnvironmentalContext
  ): Promise<TaskParsingResult> {
    const promptResult = await this.generatePrompt(
      channel,
      userInput,
      environmentalContext
    );
    const task = await this.parseResponseToTask(promptResult.response, channel);
    const validation = await this.validateTask(task, environmentalContext);
    const feasibility = await this.checkFeasibility(task, environmentalContext);

    return {
      task,
      validation,
      feasibility,
      environmental_context: environmentalContext,
      parsing_time: promptResult.processing_time,
    };
  }

  /**
   * Store prompt result in history
   */
  private storePromptResult(result: PromptResult): void {
    this.promptHistory.set(result.id, result);

    // Maintain history size limit
    if (this.promptHistory.size > 1000) {
      const oldestKey = this.promptHistory.keys().next().value;
      if (oldestKey) {
        this.promptHistory.delete(oldestKey);
      }
    }
  }

  /**
   * Update channel usage statistics
   */
  private updateChannelUsageStats(channel: ChannelType): void {
    const currentCount = this.channelUsageStats.get(channel) || 0;
    this.channelUsageStats.set(channel, currentCount + 1);
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(
    channel: ChannelType,
    success: boolean,
    processingTime: number
  ): void {
    // Update success rates
    const totalPrompts = Array.from(this.promptHistory.values()).length;
    if (totalPrompts > 0) {
      const successfulPrompts = Array.from(this.promptHistory.values()).filter(
        (p) => p.confidence > 0.5
      ).length;
      this.performanceMetrics.operational_success_rate =
        successfulPrompts / totalPrompts;
    }

    // Update average response time
    const allTimes = Array.from(this.promptHistory.values()).map(
      (p) => p.processing_time
    );
    this.performanceMetrics.average_response_time =
      allTimes.reduce((a, b) => a + b, 0) / allTimes.length;
  }

  // ===== PUBLIC GETTERS =====

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return { ...this.performanceMetrics };
  }

  /**
   * Get channel usage statistics
   */
  getChannelUsageStats() {
    return new Map(this.channelUsageStats);
  }

  /**
   * Get configuration
   */
  getConfig(): DualChannelConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<DualChannelConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get prompt history
   */
  getPromptHistory(): PromptResult[] {
    return Array.from(this.promptHistory.values());
  }

  /**
   * Clear prompt history
   */
  clearPromptHistory(): void {
    this.promptHistory.clear();
  }
}
