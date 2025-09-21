/**
 * Task Parser - Unified Integration
 * 
 * Provides a unified, schema-first task parsing system that integrates
 * dual-channel prompting and creative paraphrasing for sophisticated
 * user interaction and task understanding.
 * 
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

import {
  TaskDefinition,
  TaskParsingResult,
  TaskValidationResult,
  TaskFeasibility,
  EnvironmentalContext,
  TaskParserConfig,
  TaskParserError,
  TaskParserErrorInfo,
  TaskPerformanceMetrics,
} from './types';

import {
  DualChannelPrompting,
  ChannelType,
  DualChannelConfig,
  DEFAULT_DUAL_CHANNEL_CONFIG,
  PromptResult,
  TaskParaphraseResult,
} from './dual-channel-prompting';

import {
  CreativeParaphrasing,
  CreativeParaphrasingConfig,
  DEFAULT_CREATIVE_PARAPHRASING_CONFIG,
  ParaphrasingContext,
  ParaphrasingStyle,
  EnhancedParaphraseResult,
  LanguageGenerationRequest,
} from './creative-paraphrasing';

// ===== TASK PARSER SCHEMAS =====

/**
 * Task parser configuration
 */
export interface TaskParserConfig {
  dual_channel: DualChannelConfig;
  creative_paraphrasing: CreativeParaphrasingConfig;
  enable_schema_validation: boolean;
  enable_context_awareness: boolean;
  enable_adaptive_learning: boolean;
  enable_user_feedback_integration: boolean;
  max_paraphrase_options: number;
  paraphrase_confidence_threshold: number;
}

/**
 * Task parsing result
 */
export interface TaskParsingResult {
  paraphrase_options: EnhancedParaphraseResult[];
  selected_paraphrase: EnhancedParaphraseResult;
  channel_used: ChannelType;
  context_adaptations: string[];
  user_interaction_metadata: Record<string, any>;
}

/**
 * User interaction context
 */
export interface UserInteractionContext {
  user_id?: string;
  session_id?: string;
  interaction_history: string[];
  user_preferences: Record<string, any>;
  expertise_level: 'beginner' | 'intermediate' | 'expert';
  preferred_style: ParaphrasingStyle;
  emotional_state?: string;
  urgency_level: number;
  cultural_context?: string;
}

/**
 * Schema validation result
 */
export interface SchemaValidationResult {
  is_valid: boolean;
  schema_version: string;
  validation_errors: string[];
  schema_compliance_score: number;
  suggested_improvements: string[];
}

// ===== DEFAULT CONFIGURATIONS =====

/**
 * Enhanced task parser configuration
 */
export const ENHANCED_TASK_PARSER_CONFIG = {
  dual_channel: DEFAULT_DUAL_CHANNEL_CONFIG,
  creative_paraphrasing: DEFAULT_CREATIVE_PARAPHRASING_CONFIG,
  enable_schema_validation: true,
  enable_context_awareness: true,
  enable_adaptive_learning: true,
  enable_user_feedback_integration: true,
  max_paraphrase_options: 3,
  paraphrase_confidence_threshold: 0.7,
};

// ===== TASK PARSER SYSTEM =====

/**
 * Task Parser
 *
 * Unified task parsing system that integrates dual-channel prompting,
 * creative paraphrasing, and schema-first validation for sophisticated
 * user interaction and task understanding.
 */
export class TaskParser extends EventEmitter {
  private config: any; // Enhanced config with additional properties
  private dualChannelPrompting: DualChannelPrompting;
  private creativeParaphrasing: CreativeParaphrasing;
  private taskHistory: Map<string, TaskParsingResult> = new Map();
  private userInteractionHistory: Map<string, UserInteractionContext> =
    new Map();
  private performanceMetrics: TaskPerformanceMetrics = {
    parsing_time: 0,
    validation_time: 0,
    feasibility_time: 0,
    execution_time: 0,
    success_rate: 0,
    error_rate: 0,
    recovery_rate: 0,
  };

  constructor(config: Partial<TaskParserConfig> = {}) {
    super();
    this.config = { ...ENHANCED_TASK_PARSER_CONFIG, ...config };

    // Initialize dual-channel prompting
    this.dualChannelPrompting = new DualChannelPrompting(
      this.config.dual_channel
    );

    // Initialize creative paraphrasing
    this.creativeParaphrasing = new CreativeParaphrasing(
      this.dualChannelPrompting,
      this.config.creative_paraphrasing
    );

    // Set up event listeners for integration
    this.setupEventListeners();
  }

  /**
   * Parse user input with advanced capabilities
   */
  async parseUserInput(
    userInput: string,
    environmentalContext: EnvironmentalContext,
    userContext?: Partial<UserInteractionContext>
  ): Promise<TaskParsingResult> {
    const startTime = Date.now();
    const taskId = uuidv4();

    try {
      // Get or create user interaction context
      const interactionContext = this.getUserInteractionContext(userContext);

      // Select appropriate channel
      const channel = this.dualChannelPrompting.selectChannel(
        userInput,
        environmentalContext,
        this.buildChannelSelectionCriteria(
          userInput,
          environmentalContext,
          interactionContext
        )
      );

      // Parse user input using dual-channel approach
      const baseParsingResult = await this.dualChannelPrompting.parseUserInput(
        userInput,
        environmentalContext
      );

      // Generate paraphrase options
      const paraphraseOptions = await this.generateParaphraseOptions(
        baseParsingResult.task,
        environmentalContext,
        this.buildParaphrasingContext(interactionContext),
        channel
      );

      // Select best paraphrase
      const selectedParaphrase = this.selectBestParaphrase(
        paraphraseOptions,
        interactionContext
      );

      // Validate schema compliance
      const schemaValidation = await this.validateSchemaCompliance(
        baseParsingResult.task
      );

      // Apply context adaptations
      const contextAdaptations = this.determineContextAdaptations(
        environmentalContext,
        interactionContext
      );
      
      const parsingTime = Date.now() - startTime;

      const result: TaskParsingResult = {
        ...baseParsingResult,
        paraphrase_options: paraphraseOptions,
        selected_paraphrase: selectedParaphrase,
        channel_used: channel,
        context_adaptations: contextAdaptations,
        user_interaction_metadata: {
          user_id: interactionContext.user_id,
          session_id: interactionContext.session_id,
          expertise_level: interactionContext.expertise_level,
          preferred_style: interactionContext.preferred_style,
          emotional_state: interactionContext.emotional_state,
          urgency_level: interactionContext.urgency_level,
        },
      };
      
      // Store in history
      this.storeTaskResult(result);
      this.updateUserInteractionHistory(interactionContext, userInput, result);
      this.updatePerformanceMetrics(parsingTime, true);
      
      this.emit('task_parsed', result);
      return result;
    } catch (error) {
      const parsingTime = Date.now() - startTime;
      this.updatePerformanceMetrics(parsingTime, false);
      
      const errorInfo: TaskParserErrorInfo = {
        type: TaskParserError.PARSING_ERROR,
        message: error instanceof Error ? error.message : 'Parsing failed',
        context: { userInput, environmentalContext, userContext },
        timestamp: Date.now(),
      };
      
      this.emit('parsing_error', errorInfo);
      throw error;
    }
  }

  /**
   * Generate response to user input
   */
  async generateResponse(
    userInput: string,
    environmentalContext: EnvironmentalContext,
    userContext?: Partial<UserInteractionContext>
  ): Promise<string> {
    try {
      const interactionContext = this.getUserInteractionContext(userContext);

      const response = await this.dualChannelPrompting.generateCreativeResponse(
        userInput,
        environmentalContext,
        this.buildBotPersonality(interactionContext)
      );

      this.emit('response_generated', {
        response,
        userInput,
        interactionContext,
      });
      return response;
    } catch (error) {
      this.emit('response_error', { error, userInput });
      throw error;
    }
  }

  /**
   * Generate multiple options for a task
   */
  async generateOptions(
    task: TaskDefinition,
    environmentalContext: EnvironmentalContext,
    userContext?: Partial<UserInteractionContext>,
    styles?: ParaphrasingStyle[]
  ): Promise<any[]> {
    try {
      const interactionContext = this.getUserInteractionContext(userContext);
      const paraphrasingContext =
        this.buildParaphrasingContext(interactionContext);

      const options =
        await this.creativeParaphrasing.generateParaphrasingOptions(
          task,
          environmentalContext,
          paraphrasingContext,
          styles
        );

      this.emit('options_generated', {
        options,
        task,
        interactionContext,
      });
      return options;
    } catch (error) {
      this.emit('options_error', { error, task });
      throw error;
    }
  }

  /**
   * Provide user feedback for task parsing quality
   */
  provideUserFeedback(
    taskId: string,
    feedbackScore: number,
    feedback?: string,
    paraphraseId?: string
  ): void {
    const task = this.taskHistory.get(taskId);
    if (task) {
      // Update task-level feedback
      task.user_interaction_metadata.feedback_score = feedbackScore;
      task.user_interaction_metadata.feedback_text = feedback;

      // Update paraphrase feedback if provided
      if (paraphraseId) {
        this.creativeParaphrasing.provideUserFeedback(
          paraphraseId,
          feedbackScore,
          feedback
        );
      }

      // Update user interaction history
      this.updateUserFeedbackHistory(taskId, feedbackScore, feedback);

      this.emit('user_feedback_received', {
        taskId,
        feedbackScore,
        feedback,
        paraphraseId,
      });
    }
  }

  /**
   * Get user interaction context
   */
  getUserInteractionContext(
    userContext?: Partial<UserInteractionContext>
  ): UserInteractionContext {
    const userId = userContext?.user_id || 'default_user';
    const sessionId = userContext?.session_id || uuidv4();

    let context = this.userInteractionHistory.get(userId);

    if (!context) {
      context = {
        user_id: userId,
        session_id: sessionId,
        interaction_history: [],
        user_preferences: {},
        expertise_level: 'intermediate',
        preferred_style: 'conversational',
        urgency_level: 0.5,
        ...userContext,
      };
      this.userInteractionHistory.set(userId, context);
    }

    // Update with any new context information
    if (userContext) {
      context = { ...context, ...userContext };
      this.userInteractionHistory.set(userId, context);
    }

    return context;
  }

  /**
   * Update user preferences and learning
   */
  updateUserPreferences(
    userId: string,
    preferences: Partial<UserInteractionContext>
  ): void {
    const context = this.userInteractionHistory.get(userId);
    if (context) {
      const updatedContext = { ...context, ...preferences };
      this.userInteractionHistory.set(userId, updatedContext);

      this.emit('user_preferences_updated', {
        userId,
        preferences,
        updatedContext,
      });
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  /**
   * Set up event listeners for integration
   */
  private setupEventListeners(): void {
    // Dual-channel prompting events
    this.dualChannelPrompting.on('prompt_generated', (result: PromptResult) => {
      this.emit('dual_channel_prompt_generated', result);
    });

    this.dualChannelPrompting.on('fallback_triggered', (data) => {
      this.emit('dual_channel_fallback', data);
    });

    // Creative paraphrasing events
    this.creativeParaphrasing.on(
      'paraphrase_generated',
      (result: EnhancedParaphraseResult) => {
        this.emit('creative_paraphrase_generated', result);
      }
    );

    this.creativeParaphrasing.on('user_feedback_received', (data) => {
      this.emit('creative_paraphrase_feedback', data);
    });
  }

  /**
   * Build channel selection criteria
   */
  private buildChannelSelectionCriteria(
    userInput: string,
    environmentalContext: EnvironmentalContext,
    interactionContext: UserInteractionContext
  ) {
    return {
      task_complexity: this.analyzeTaskComplexity(userInput),
      user_intent: this.analyzeUserIntent(userInput),
      environmental_context:
        this.analyzeEnvironmentalContext(environmentalContext),
      urgency: interactionContext.urgency_level,
      social_context: this.analyzeSocialContext(interactionContext),
    };
  }

  /**
   * Build paraphrasing context
   */
  private buildParaphrasingContext(
    interactionContext: UserInteractionContext
  ): ParaphrasingContext {
    return {
      user_personality: this.extractUserPersonality(interactionContext),
      user_expertise_level: interactionContext.expertise_level,
      user_preferred_style: interactionContext.preferred_style,
      cultural_context: interactionContext.cultural_context,
      emotional_state: interactionContext.emotional_state,
      urgency_level: interactionContext.urgency_level,
      previous_interactions: interactionContext.interaction_history.slice(-5), // Last 5 interactions
    };
  }

  /**
   * Build bot personality based on user context
   */
  private buildBotPersonality(
    interactionContext: UserInteractionContext
  ): string {
    const basePersonality = 'friendly and helpful';

    if (interactionContext.expertise_level === 'beginner') {
      return `${basePersonality}, patient and instructional`;
    } else if (interactionContext.expertise_level === 'expert') {
      return `${basePersonality}, efficient and technical`;
    }

    return basePersonality;
  }

  /**
   * Generate paraphrase options
   */
  private async generateParaphraseOptions(
    task: TaskDefinition,
    environmentalContext: EnvironmentalContext,
    paraphrasingContext: ParaphrasingContext,
    channel: ChannelType
  ): Promise<any[]> {
    const maxOptions = this.config.max_paraphrase_options;
    const confidenceThreshold = this.config.paraphrase_confidence_threshold;

    // Determine styles based on channel and context
    const styles = this.determineParaphraseStyles(channel, paraphrasingContext);

    const options = await this.creativeParaphrasing.generateParaphrasingOptions(
      task,
      environmentalContext,
      paraphrasingContext,
      styles.slice(0, maxOptions)
    );

    // Filter by confidence threshold
    return options.filter((option) => option.confidence >= confidenceThreshold);
  }

  /**
   * Select best paraphrase based on context
   */
  private selectBestParaphrase(
    options: any[],
    interactionContext: UserInteractionContext
  ): any {
    if (options.length === 0) {
      throw new Error('No paraphrase options available');
    }

    // If user has a preferred style, prioritize it
    if (interactionContext.preferred_style) {
      const preferredOption = options.find(
        (option) => option.style_used === interactionContext.preferred_style
      );
      if (preferredOption) {
        return preferredOption;
      }
    }

    // Otherwise, select by highest confidence
    return options.reduce((best, current) =>
      current.confidence > best.confidence ? current : best
    );
  }

  /**
   * Validate schema compliance
   */
  private async validateSchemaCompliance(
    task: TaskDefinition
  ): Promise<SchemaValidationResult> {
    if (!this.config.enable_schema_validation) {
      return {
        is_valid: true,
        schema_version: '1.0',
        validation_errors: [],
        schema_compliance_score: 1.0,
        suggested_improvements: [],
      };
    }

    const errors: string[] = [];
    let complianceScore = 1.0;

    // Basic schema validation
    if (!task.type) {
      errors.push('Task type is required');
      complianceScore -= 0.3;
    }

    if (!task.parameters || Object.keys(task.parameters).length === 0) {
      errors.push('Task parameters are required');
      complianceScore -= 0.2;
    }

    if (
      task.priority !== undefined &&
      (task.priority < 0 || task.priority > 1)
    ) {
      errors.push('Task priority must be between 0 and 1');
      complianceScore -= 0.1;
    }

    const suggestions: string[] = [];
    if (complianceScore < 0.8) {
      suggestions.push('Consider adding more specific task parameters');
      suggestions.push('Ensure task type is properly specified');
    }

    return {
      is_valid: errors.length === 0,
      schema_version: '1.0',
      validation_errors: errors,
      schema_compliance_score: Math.max(0, complianceScore),
      suggested_improvements: suggestions,
    };
  }

  /**
   * Determine context adaptations
   */
  private determineContextAdaptations(
    environmentalContext: EnvironmentalContext,
    interactionContext: UserInteractionContext
  ): string[] {
    const adaptations: string[] = [];

    if (environmentalContext.threat_level > 0.7) {
      adaptations.push('Added safety context for dangerous environment');
    }

    if (environmentalContext.time_of_day === 'night') {
      adaptations.push('Adjusted for nighttime conditions');
    }

    if (interactionContext.expertise_level === 'beginner') {
      adaptations.push('Simplified language for beginner user');
    }

    if (interactionContext.urgency_level > 0.8) {
      adaptations.push('Added urgency indicators');
    }

    return adaptations;
  }

  /**
   * Determine paraphrase styles based on channel and context
   */
  private determineParaphraseStyles(
    channel: ChannelType,
    paraphrasingContext: ParaphrasingContext
  ): ParaphrasingStyle[] {
    if (channel === 'operational') {
      return ['instructional', 'technical', 'formal'];
    } else {
      return ['conversational', 'casual', 'storytelling'];
    }
  }

  /**
   * Analyze task complexity
   */
  private analyzeTaskComplexity(userInput: string): number {
    const lowerInput = userInput.toLowerCase();
    let complexity = 0.3;

    if (lowerInput.includes('and') || lowerInput.includes('then')) {
      complexity += 0.2;
    }

    if (lowerInput.includes('if') || lowerInput.includes('when')) {
      complexity += 0.2;
    }

    if (lowerInput.match(/\d+/)) {
      complexity += 0.1;
    }

    return Math.min(1.0, complexity);
  }

  /**
   * Analyze user intent
   */
  private analyzeUserIntent(
    userInput: string
  ): 'command' | 'question' | 'conversation' | 'creative' {
    const lowerInput = userInput.toLowerCase();

    if (
      lowerInput.includes('?') ||
      lowerInput.includes('what') ||
      lowerInput.includes('how')
    ) {
      return 'question';
    } else if (
      lowerInput.includes('please') ||
      lowerInput.includes('can you')
    ) {
      return 'command';
    } else if (lowerInput.includes('hello') || lowerInput.includes('hi')) {
      return 'conversation';
    } else if (lowerInput.includes('story') || lowerInput.includes('imagine')) {
      return 'creative';
    } else {
      return 'command';
    }
  }

  /**
   * Analyze environmental context
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
    } else {
      return 'normal';
    }
  }

  /**
   * Analyze social context
   */
  private analyzeSocialContext(
    interactionContext: UserInteractionContext
  ): string {
    if (interactionContext.expertise_level === 'expert') {
      return 'technical';
    } else if (interactionContext.expertise_level === 'beginner') {
      return 'supportive';
    } else {
      return 'neutral';
    }
  }

  /**
   * Extract user personality from context
   */
  private extractUserPersonality(
    interactionContext: UserInteractionContext
  ): string {
    if (interactionContext.user_preferences.personality) {
      return interactionContext.user_preferences.personality;
    }

    // Infer from expertise level and preferred style
    if (interactionContext.expertise_level === 'expert') {
      return 'technical and efficient';
    } else if (interactionContext.expertise_level === 'beginner') {
      return 'patient and learning-oriented';
    } else {
      return 'balanced and adaptable';
    }
  }

  /**
   * Store task result in history
   */
  private storeTaskResult(result: TaskParsingResult): void {
    this.taskHistory.set(result.task.id, result);
    
    // Maintain history size limit
    if (this.taskHistory.size > this.config.max_task_history) {
      const oldestKey = this.taskHistory.keys().next().value;
      if (oldestKey) {
        this.taskHistory.delete(oldestKey);
      }
    }
  }

  /**
   * Update user interaction history
   */
  private updateUserInteractionHistory(
    interactionContext: UserInteractionContext,
    userInput: string,
    result: TaskParsingResult
  ): void {
    if (interactionContext.user_id) {
      const context = this.userInteractionHistory.get(
        interactionContext.user_id
      );
      if (context) {
        context.interaction_history.push(userInput);

        // Keep only last 50 interactions
        if (context.interaction_history.length > 50) {
          context.interaction_history = context.interaction_history.slice(-50);
        }

        // Update learning preferences based on successful interactions
        if (result.selected_paraphrase.confidence > 0.8) {
          context.preferred_style = result.selected_paraphrase.style_used;
        }

        this.userInteractionHistory.set(interactionContext.user_id, context);
      }
    }
  }

  /**
   * Update user feedback history
   */
  private updateUserFeedbackHistory(
    taskId: string,
    feedbackScore: number,
    feedback?: string
  ): void {
    const task = this.taskHistory.get(taskId);
    if (task && task.user_interaction_metadata.user_id) {
      const userId = task.user_interaction_metadata.user_id;
      const context = this.userInteractionHistory.get(userId);

      if (context) {
        // Update user preferences based on feedback
        if (feedbackScore > 0.8) {
          // Positive feedback - reinforce current preferences
          context.user_preferences.successful_interactions =
            (context.user_preferences.successful_interactions || 0) + 1;
        } else if (feedbackScore < 0.4) {
          // Negative feedback - consider adjusting preferences
          context.user_preferences.unsuccessful_interactions =
            (context.user_preferences.unsuccessful_interactions || 0) + 1;
        }

        this.userInteractionHistory.set(userId, context);
      }
    }
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(
    parsingTime: number,
    success: boolean
  ): void {
    this.performanceMetrics.parsing_time = parsingTime;
    
    // Update success/error rates
    const totalTasks = this.taskHistory.size;
    if (totalTasks > 0) {
      const successCount = Array.from(this.taskHistory.values()).filter(
        (t) => t.user_interaction_metadata.feedback_score > 0.7
      ).length;
      this.performanceMetrics.success_rate = successCount / totalTasks;
      this.performanceMetrics.error_rate =
        1 - this.performanceMetrics.success_rate;
    }
  }

  // ===== PUBLIC GETTERS =====

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): TaskPerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Get dual-channel prompting metrics
   */
  getDualChannelMetrics() {
    return this.dualChannelPrompting.getPerformanceMetrics();
  }

  /**
   * Get creative paraphrasing metrics
   */
  getCreativeParaphrasingMetrics() {
    return this.creativeParaphrasing.getPerformanceMetrics();
  }

  /**
   * Get task history
   */
  getTaskHistory(): TaskParsingResult[] {
    return Array.from(this.taskHistory.values());
  }

  /**
   * Get user interaction history
   */
  getUserInteractionHistory(): Map<string, UserInteractionContext> {
    return new Map(this.userInteractionHistory);
  }

  /**
   * Get configuration
   */
  getConfig(): TaskParserConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<TaskParserConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Update sub-components
    this.dualChannelPrompting.updateConfig(newConfig.dual_channel || {});
    this.creativeParaphrasing.updateConfig(
      newConfig.creative_paraphrasing || {}
    );
  }

  /**
   * Clear task history
   */
  clearTaskHistory(): void {
    this.taskHistory.clear();
  }

  /**
   * Clear user interaction history
   */
  clearUserInteractionHistory(): void {
    this.userInteractionHistory.clear();
  }
}
