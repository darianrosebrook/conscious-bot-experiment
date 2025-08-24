/**
 * Cognitive Integration Layer
 *
 * Bridges the Enhanced Task Parser with the conscious-bot's cognitive architecture,
 * incorporating the best patterns from both vibe-coded and conscious-bot systems.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { TaskParser, EnvironmentalImmersion } from './index';
import {
  TaskDefinition,
  TaskParsingResult,
  EnvironmentalContext,
  ChatMessage,
  Command,
  TaskExecutionContext,
} from './types';

/**
 * Cognitive task integration interface
 */
export interface CognitiveTaskIntegration {
  /**
   * Convert external task to cognitive task
   */
  externalTaskToCognitive(
    task: TaskDefinition,
    context: TaskExecutionContext
  ): any;

  /**
   * Convert cognitive goal to executable task
   */
  cognitiveGoalToTask(goal: any, context: TaskExecutionContext): TaskDefinition;

  /**
   * Merge external and internal task priorities
   */
  mergeTaskPriorities(
    externalPriority: number,
    internalPriority: number
  ): number;
}

/**
 * Enhanced Task Parser with Cognitive Integration
 *
 * Integrates sophisticated task parsing with the conscious-bot's cognitive architecture,
 * incorporating proven patterns from vibe-coded while maintaining cognitive depth.
 */
export class CognitiveTaskParser extends EventEmitter {
  private taskParser: TaskParser;
  private environmentalImmersion: EnvironmentalImmersion;
  private cognitiveIntegration: CognitiveTaskIntegration;
  private worldStateCache: any = null;
  private lastContextUpdate: number = 0;
  private contextUpdateInterval: number = 1000; // 1 second

  constructor(
    taskParserConfig: any = {},
    cognitiveIntegration: CognitiveTaskIntegration
  ) {
    super();
    this.taskParser = new TaskParser(taskParserConfig);
    this.environmentalImmersion = new EnvironmentalImmersion();
    this.cognitiveIntegration = cognitiveIntegration;

    // Set up event listeners for cognitive integration
    this.setupCognitiveEventListeners();
  }

  /**
   * Parse user command with cognitive context
   */
  async parseUserCommand(
    userMessage: string,
    cognitiveContext: any,
    worldState: any
  ): Promise<{
    task: TaskDefinition;
    cognitiveTask: any;
    environmentalContext: EnvironmentalContext;
    priority: number;
    reasoning: string;
  }> {
    // Update environmental context
    const environmentalContext = this.updateEnvironmentalContext(worldState);

    // Parse the user command into a task
    const parsingResult = await this.taskParser.parseLLMOutput(
      userMessage,
      environmentalContext
    );

    // Create task execution context
    const taskContext: TaskExecutionContext = {
      task: parsingResult.task,
      environmental_context: environmentalContext,
      available_resources: environmentalContext.resource_availability,
      current_skills: this.getCurrentSkills(cognitiveContext),
      social_context: environmentalContext.social_context,
      timestamp: Date.now(),
    };

    // Convert to cognitive task
    const cognitiveTask = this.cognitiveIntegration.externalTaskToCognitive(
      parsingResult.task,
      taskContext
    );

    // Merge priorities (external command vs internal drives)
    const mergedPriority = this.cognitiveIntegration.mergeTaskPriorities(
      parsingResult.task.priority || 0.5,
      cognitiveContext.currentPriority || 0.3
    );

    // Generate reasoning for the task
    const reasoning = this.generateTaskReasoning(
      parsingResult,
      cognitiveContext,
      environmentalContext
    );

    const result = {
      task: parsingResult.task,
      cognitiveTask,
      environmentalContext,
      priority: mergedPriority,
      reasoning,
    };

    this.emit('user_command_parsed', result);
    return result;
  }

  /**
   * Convert cognitive goal to executable task
   */
  async cognitiveGoalToExecutableTask(
    cognitiveGoal: any,
    worldState: any
  ): Promise<TaskDefinition> {
    const environmentalContext = this.updateEnvironmentalContext(worldState);

    const taskContext: TaskExecutionContext = {
      task: {} as TaskDefinition, // Placeholder
      environmental_context: environmentalContext,
      available_resources: environmentalContext.resource_availability,
      current_skills: this.getCurrentSkills(cognitiveGoal),
      social_context: environmentalContext.social_context,
      timestamp: Date.now(),
    };

    const task = this.cognitiveIntegration.cognitiveGoalToTask(
      cognitiveGoal,
      taskContext
    );

    this.emit('cognitive_goal_converted', { goal: cognitiveGoal, task });
    return task;
  }

  /**
   * Process chat message with cognitive awareness
   */
  async processChatMessage(
    message: ChatMessage,
    cognitiveContext: any,
    worldState: any
  ): Promise<{
    command?: Command;
    task?: TaskDefinition;
    cognitiveResponse?: any;
    shouldRespond: boolean;
  }> {
    const environmentalContext = this.updateEnvironmentalContext(worldState);

    // Check if this is a command (e.g., ".bot mine coal")
    if (
      message.content.startsWith('.bot') ||
      message.content.startsWith('/bot')
    ) {
      const command = this.extractCommand(message);
      if (command) {
        const taskResult = await this.parseUserCommand(
          command.original_message,
          cognitiveContext,
          worldState
        );

        return {
          command,
          task: taskResult.task,
          shouldRespond: true,
        };
      }
    }

    // Check if this requires a cognitive response
    if (this.shouldGenerateCognitiveResponse(message, cognitiveContext)) {
      const cognitiveResponse = await this.generateCognitiveResponse(
        message,
        cognitiveContext,
        environmentalContext
      );

      return {
        cognitiveResponse,
        shouldRespond: true,
      };
    }

    return { shouldRespond: false };
  }

  /**
   * Generate contextual task reasoning
   */
  private generateTaskReasoning(
    parsingResult: TaskParsingResult,
    cognitiveContext: any,
    environmentalContext: EnvironmentalContext
  ): string {
    const reasons: string[] = [];

    // Add environmental context
    if (environmentalContext.threat_level > 0.7) {
      reasons.push('High threat environment requires immediate action');
    }

    if (environmentalContext.time_of_day === 'night') {
      reasons.push('Night time conditions affect task execution');
    }

    // Add cognitive context
    if (cognitiveContext.currentNeeds?.safety > 0.8) {
      reasons.push('Safety needs are high priority');
    }

    if (cognitiveContext.currentNeeds?.nutrition > 0.7) {
      reasons.push('Nutrition needs require attention');
    }

    // Add task-specific reasoning
    if (parsingResult.task.type === 'gathering') {
      reasons.push('Resource gathering supports current goals');
    }

    if (parsingResult.task.type === 'crafting') {
      reasons.push('Crafting advances technological capabilities');
    }

    return reasons.join('. ');
  }

  /**
   * Extract command from chat message
   */
  private extractCommand(message: ChatMessage): Command | null {
    const content = message.content;

    // Remove command prefix
    const commandText = content.replace(/^\.?bot\s+/i, '').trim();

    if (!commandText) {
      return null;
    }

    // Simple command extraction (can be enhanced with LLM)
    const command: Command = {
      type: 'user_command',
      parameters: {
        original_text: commandText,
        sender: message.sender,
      },
      confidence: 0.9,
      source: message.sender,
      timestamp: message.timestamp,
      original_message: content,
    };

    // Detect command type based on keywords
    const lowerText = commandText.toLowerCase();
    if (lowerText.includes('mine') || lowerText.includes('gather')) {
      command.type = 'gathering';
    } else if (lowerText.includes('craft') || lowerText.includes('make')) {
      command.type = 'crafting';
    } else if (lowerText.includes('go') || lowerText.includes('move')) {
      command.type = 'navigation';
    } else if (lowerText.includes('build') || lowerText.includes('construct')) {
      command.type = 'construction';
    }

    return command;
  }

  /**
   * Check if message requires cognitive response
   */
  private shouldGenerateCognitiveResponse(
    message: ChatMessage,
    cognitiveContext: any
  ): boolean {
    // Respond to direct questions
    if (message.content.includes('?')) {
      return true;
    }

    // Respond to greetings
    if (message.content.toLowerCase().match(/^(hi|hello|hey|greetings)/)) {
      return true;
    }

    // Respond to mentions
    if (
      message.content.toLowerCase().includes('bot') ||
      message.content.toLowerCase().includes('ai')
    ) {
      return true;
    }

    // Respond based on social context
    if (cognitiveContext.socialNeeds?.interaction > 0.6) {
      return true;
    }

    return false;
  }

  /**
   * Generate cognitive response to chat
   */
  private async generateCognitiveResponse(
    message: ChatMessage,
    cognitiveContext: any,
    environmentalContext: EnvironmentalContext
  ): Promise<any> {
    // This would integrate with the cognitive core's LLM interface
    // For now, return a structured response
    return {
      type: 'social_response',
      content: this.generateContextualResponse(
        message,
        cognitiveContext,
        environmentalContext
      ),
      priority: 0.5,
      reasoning: 'Social interaction maintains positive relationships',
    };
  }

  /**
   * Generate contextual response based on current state
   */
  private generateContextualResponse(
    message: ChatMessage,
    cognitiveContext: any,
    environmentalContext: EnvironmentalContext
  ): string {
    const responses: string[] = [];

    // Add environmental context
    if (environmentalContext.threat_level > 0.7) {
      responses.push("I'm currently dealing with some threats nearby.");
    }

    if (environmentalContext.time_of_day === 'night') {
      responses.push("It's getting dark, so I'm being extra careful.");
    }

    // Add cognitive context
    if (cognitiveContext.currentNeeds?.safety > 0.8) {
      responses.push("I'm prioritizing safety right now.");
    }

    if (cognitiveContext.currentNeeds?.nutrition > 0.7) {
      responses.push('I could use some food soon.');
    }

    // Add social context
    if (environmentalContext.social_context.nearby_players.length > 0) {
      responses.push('I see other players around - hello!');
    }

    // Default response
    if (responses.length === 0) {
      responses.push("I'm here and ready to help!");
    }

    return responses.join(' ');
  }

  /**
   * Update environmental context with caching
   */
  private updateEnvironmentalContext(worldState: any): EnvironmentalContext {
    const now = Date.now();

    // Use cached context if recent enough
    if (
      this.worldStateCache &&
      now - this.lastContextUpdate < this.contextUpdateInterval
    ) {
      return this.worldStateCache;
    }

    const context = this.environmentalImmersion.updateContext(worldState);
    this.worldStateCache = context;
    this.lastContextUpdate = now;

    return context;
  }

  /**
   * Get current skills from cognitive context
   */
  private getCurrentSkills(cognitiveContext: any): string[] {
    // This would integrate with the skill system
    const baseSkills = ['basic_movement', 'basic_interaction'];

    if (cognitiveContext.skills) {
      return [...baseSkills, ...cognitiveContext.skills];
    }

    return baseSkills;
  }

  /**
   * Set up event listeners for cognitive integration
   */
  private setupCognitiveEventListeners(): void {
    this.taskParser.on('task_parsed', (result) => {
      this.emit('task_parsed', result);
    });

    this.taskParser.on('parsing_error', (error) => {
      this.emit('parsing_error', error);
    });

    this.environmentalImmersion.on('context_updated', (context) => {
      this.emit('environmental_context_updated', context);
    });
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): any {
    return {
      taskParser: this.taskParser.getPerformanceMetrics(),
      environmentalImmersion: {
        contextHistorySize:
          this.environmentalImmersion.getContextHistory().length,
        currentContext:
          this.environmentalImmersion.getCurrentContext() !== null,
      },
    };
  }

  /**
   * Start environmental monitoring
   */
  startMonitoring(updateFrequencyMs: number = 1000): void {
    this.environmentalImmersion.start(updateFrequencyMs);
  }

  /**
   * Stop environmental monitoring
   */
  stopMonitoring(): void {
    this.environmentalImmersion.stop();
  }
}
