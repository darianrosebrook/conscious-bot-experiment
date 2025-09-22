/**
 * Social Awareness Manager
 *
 * Manages social interactions and entity acknowledgment decisions.
 * Prompts the bot to consider whether to acknowledge nearby entities
 * based on context, relationships, and current priorities.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';

export interface NearbyEntity {
  id: string;
  type: 'player' | 'mob' | 'animal' | 'villager' | 'other';
  distance: number;
  hostile?: boolean;
  friendly?: boolean;
  position?: { x: number; y: number; z: number };
  lastSeen?: number;
  relationship?: 'friend' | 'neutral' | 'enemy' | 'unknown';
  activity?: string;
  canSee?: boolean; // Can the bot see this entity?
  canGiveInstructions?: boolean; // Can this entity give instructions to the bot?
}

export interface ChatMessage {
  id: string;
  sender: string;
  senderType: 'player' | 'bot' | 'system' | 'other';
  content: string;
  timestamp: number;
  isDirect?: boolean; // Is this a direct message to the bot?
  senderRelationship?: 'friend' | 'neutral' | 'enemy' | 'unknown';
  urgency?: 'low' | 'medium' | 'high';
  context?: {
    location?: { x: number; y: number; z: number };
    world?: string;
    timeOfDay?: number;
  };
}

export interface SocialConsiderationResult {
  entity: NearbyEntity;
  shouldAcknowledge: boolean;
  reasoning: string;
  priority: 'low' | 'medium' | 'high';
  action?: string;
  timestamp: number;
}

export interface ChatConsiderationResult {
  message: ChatMessage;
  shouldRespond: boolean;
  reasoning: string;
  priority: 'low' | 'medium' | 'high';
  responseContent?: string;
  responseType?:
    | 'greeting'
    | 'acknowledgment'
    | 'question'
    | 'statement'
    | 'farewell';
  timestamp: number;
}

export interface SocialAwarenessConfig {
  maxDistance: number;
  considerationCooldownMs: number;
  enableVerboseLogging: boolean;
  cognitionEndpoint: string;
  enableSocialMemory: boolean;
  socialMemoryManager?: any; // Reference to social memory manager
}

const DEFAULT_CONFIG: SocialAwarenessConfig = {
  maxDistance: 15, // Consider entities within 15 blocks
  considerationCooldownMs: 30000, // 30 seconds between considerations for same entity
  enableVerboseLogging: true,
  cognitionEndpoint: 'http://localhost:3003',
  enableSocialMemory: true,
};

/**
 * Social Awareness Manager
 */
export class SocialAwarenessManager extends EventEmitter {
  private config: SocialAwarenessConfig;
  private considerationHistory: Map<string, number> = new Map();
  private entityTracking: Map<string, NearbyEntity> = new Map();

  constructor(config: Partial<SocialAwarenessConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Process nearby entities and generate social consideration prompts
   */
  async processNearbyEntities(
    entities: NearbyEntity[],
    context: {
      currentTasks: any[];
      health: number;
      position: { x: number; y: number; z: number };
      biome?: string;
      timeOfDay?: number;
    }
  ): Promise<SocialConsiderationResult[]> {
    const results: SocialConsiderationResult[] = [];
    const now = Date.now();

    // Filter entities based on visibility and instruction capability
    const visibleEntities = entities.filter((entity) => {
      if (entity.type === 'player') {
        // Players can always be seen and give instructions
        return true;
      }
      // For other entities, check visibility
      return entity.canSee !== false && entity.canGiveInstructions !== false;
    });

    for (const entity of visibleEntities) {
      // Skip entities that are too far
      if (entity.distance > this.config.maxDistance) {
        continue;
      }

      // Check cooldown for this entity
      const lastConsideration = this.considerationHistory.get(entity.id) || 0;
      if (now - lastConsideration < this.config.considerationCooldownMs) {
        if (this.config.enableVerboseLogging) {
          console.log(
            `⏰ Skipping consideration for ${entity.type} ${entity.id} - cooldown active`
          );
        }
        continue;
      }

      // Generate social consideration
      const result = await this.generateSocialConsideration(entity, context);

      if (result) {
        results.push(result);
        this.considerationHistory.set(entity.id, now);
        this.updateEntityTracking(entity);

        // Record social encounter in memory
        if (this.config.enableSocialMemory && this.config.socialMemoryManager) {
          await this.recordSocialEncounter({
            entityId: entity.id,
            type: 'observation',
            timestamp: now,
            description: `Considered acknowledging ${entity.type} ${entity.id} at ${entity.distance} blocks`,
            outcome: result.shouldAcknowledge ? 'positive' : 'neutral',
            newFacts: [],
            location: entity.position,
            emotionalImpact: result.shouldAcknowledge ? 0.1 : 0,
            memoryBoost: 0.2,
          });
        }

        this.emit('socialConsiderationGenerated', result);
      }
    }

    return results;
  }

  /**
   * Process incoming chat messages and decide whether to respond
   */
  async processChatMessage(
    message: ChatMessage,
    context: {
      currentTasks: any[];
      health: number;
      position: { x: number; y: number; z: number };
      biome?: string;
      timeOfDay?: number;
      nearbyEntities?: NearbyEntity[];
    }
  ): Promise<ChatConsiderationResult | null> {
    const now = Date.now();

    // Check cooldown for this sender
    const lastChatConsideration =
      this.considerationHistory.get(`chat-${message.sender}`) || 0;
    if (now - lastChatConsideration < this.config.considerationCooldownMs) {
      if (this.config.enableVerboseLogging) {
        console.log(
          `⏰ Skipping chat consideration for ${message.sender} - cooldown active`
        );
      }
      return null;
    }

    const result = await this.generateChatConsideration(message, context);

    if (result) {
      this.considerationHistory.set(`chat-${message.sender}`, now);

      // Record chat encounter in memory
      if (this.config.enableSocialMemory && this.config.socialMemoryManager) {
        await this.recordSocialEncounter({
          entityId: message.sender,
          type: 'chat',
          timestamp: now,
          description: `Chat message: "${message.content.substring(0, 50)}..."`,
          outcome: result.shouldRespond ? 'positive' : 'neutral',
          newFacts: [],
          location: message.context?.location,
          emotionalImpact: result.shouldRespond ? 0.2 : 0.1,
          memoryBoost: result.shouldRespond ? 0.3 : 0.1,
        });
      }

      // If we should respond, create a chat response goal
      if (result.shouldRespond && result.responseContent) {
        await this.createChatResponseGoal(message, result);
      }

      this.emit('chatConsiderationGenerated', result);
    }

    return result;
  }

  /**
   * Generate proactive communication when bot decides to leave an area
   */
  async generateDepartureCommunication(
    currentArea: {
      name: string;
      entities: NearbyEntity[];
      position: { x: number; y: number; z: number };
    },
    newTask: {
      title: string;
      type: string;
      priority: number;
      destination?: { x: number; y: number; z: number };
    },
    context: {
      currentTasks: any[];
      health: number;
      timeOfDay?: number;
    }
  ): Promise<{
    shouldAnnounce: boolean;
    message?: string;
    reasoning: string;
    priority: 'low' | 'medium' | 'high';
  }> {
    try {
      // Call cognition service for departure communication consideration
      const response = await fetch(
        `${this.config.cognitionEndpoint}/consider-departure`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentArea,
            newTask,
            context: {
              currentState: context,
              currentTasks: context.currentTasks,
              recentEvents: [],
              emotionalState: 'focused',
              memoryContext: {},
            },
          }),
          signal: AbortSignal.timeout(10000), // 10 second timeout
        }
      );

      if (!response.ok) {
        throw new Error(`Cognition service responded with ${response.status}`);
      }

      const result = (await response.json()) as {
        processed: boolean;
        shouldAnnounce: boolean;
        message?: string;
        reasoning: string;
        priority: 'low' | 'medium' | 'high';
      };

      return {
        shouldAnnounce: result.shouldAnnounce,
        message: result.message,
        reasoning: result.reasoning,
        priority: result.priority,
      };
    } catch (error) {
      console.error('❌ Failed to generate departure communication:', error);

      // Fallback logic for departure communication
      return this.generateDepartureCommunicationFallback(
        currentArea,
        newTask,
        context
      );
    }
  }

  /**
   * Generate social consideration for a specific entity
   */
  private async generateSocialConsideration(
    entity: NearbyEntity,
    context: any
  ): Promise<SocialConsiderationResult | null> {
    try {
      // Call cognition service for social consideration
      const response = await fetch(
        `${this.config.cognitionEndpoint}/consider-social`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entity,
            context: {
              currentState: context,
              currentTasks: context.currentTasks,
              recentEvents: [],
              emotionalState: 'thoughtful',
              memoryContext: {},
            },
          }),
          signal: AbortSignal.timeout(10000), // 10 second timeout
        }
      );

      if (!response.ok) {
        throw new Error(`Cognition service responded with ${response.status}`);
      }

      const result = (await response.json()) as {
        processed: boolean;
        thought: {
          content: string;
          [key: string]: any;
        };
        [key: string]: any;
      };

      if (result.processed && result.thought) {
        // Parse the bot's decision from the thought content
        const decision = this.parseSocialDecision(result.thought.content);

        return {
          entity,
          shouldAcknowledge: decision.shouldAcknowledge,
          reasoning: result.thought.content,
          priority: decision.priority,
          action: decision.action,
          timestamp: Date.now(),
        };
      }

      return null;
    } catch (error) {
      console.error(
        `❌ Failed to generate social consideration for ${entity.type}:`,
        error
      );

      // Fallback decision logic
      const fallbackDecision = this.generateFallbackDecision(entity, context);

      return {
        entity,
        shouldAcknowledge: fallbackDecision.shouldAcknowledge,
        reasoning: fallbackDecision.reasoning,
        priority: fallbackDecision.priority,
        action: fallbackDecision.action,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Parse social decision from thought content
   */
  private parseSocialDecision(thoughtContent: string): {
    shouldAcknowledge: boolean;
    priority: 'low' | 'medium' | 'high';
    action?: string;
  } {
    const content = thoughtContent.toLowerCase();

    // Check for acknowledgment intent
    const shouldAcknowledge =
      content.includes('should acknowledge') ||
      content.includes('should greet') ||
      content.includes('should talk') ||
      content.includes('should respond') ||
      content.includes('should say hello') ||
      content.includes('should interact') ||
      (content.includes('acknowledge') &&
        !content.includes('not acknowledge')) ||
      (content.includes('greet') && !content.includes('not greet'));

    // Determine priority
    let priority: 'low' | 'medium' | 'high' = 'medium';
    if (
      content.includes('immediate') ||
      content.includes('urgent') ||
      content.includes('threat')
    ) {
      priority = 'high';
    } else if (
      content.includes('maybe') ||
      content.includes('probably') ||
      content.includes('consider')
    ) {
      priority = 'low';
    }

    // Extract suggested action
    let action: string | undefined;
    const actionMatch = content.match(
      /(?:should|could|might)\s+([^.!?]+[.!?])/
    );
    if (actionMatch) {
      action = actionMatch[1].trim();
    }

    return { shouldAcknowledge, priority, action };
  }

  /**
   * Generate fallback decision when LLM fails
   */
  private generateFallbackDecision(
    entity: NearbyEntity,
    context: any
  ): {
    shouldAcknowledge: boolean;
    reasoning: string;
    priority: 'low' | 'medium' | 'high';
    action?: string;
  } {
    const { distance, hostile, friendly, type, relationship } = entity;
    const { health, currentTasks } = context;

    // High priority situations
    if (hostile && distance < 5) {
      return {
        shouldAcknowledge: true,
        reasoning: `This hostile ${type} is very close (${distance} blocks). Safety requires acknowledgment.`,
        priority: 'high',
        action: 'Warn about potential threat',
      };
    }

    if (friendly && distance < 8) {
      return {
        shouldAcknowledge: true,
        reasoning: `A friendly ${type} is nearby. Good relations suggest acknowledgment.`,
        priority: 'medium',
        action: 'Greet the entity',
      };
    }

    if (relationship === 'friend' && distance < 12) {
      return {
        shouldAcknowledge: true,
        reasoning: `A friend is nearby. Relationships benefit from acknowledgment.`,
        priority: 'medium',
        action: 'Greet my friend',
      };
    }

    // Medium priority situations
    if (distance < 6 && !hostile) {
      return {
        shouldAcknowledge: true,
        reasoning: `An entity is quite close (${distance} blocks). Social norms suggest acknowledgment.`,
        priority: 'medium',
        action: 'Acknowledge the nearby entity',
      };
    }

    // Low priority situations
    if (health < 10) {
      return {
        shouldAcknowledge: false,
        reasoning:
          'My health is low. I should focus on survival rather than social interactions.',
        priority: 'low',
      };
    }

    if (currentTasks.length > 0 && currentTasks[0].priority > 0.7) {
      return {
        shouldAcknowledge: false,
        reasoning: 'I have high-priority tasks. Social interactions can wait.',
        priority: 'low',
      };
    }

    // Default - no acknowledgment needed
    return {
      shouldAcknowledge: false,
      reasoning: `The ${type} is ${distance} blocks away and doesn't require immediate acknowledgment.`,
      priority: 'low',
    };
  }

  /**
   * Generate chat consideration for a specific message
   */
  private async generateChatConsideration(
    message: ChatMessage,
    context: any
  ): Promise<ChatConsiderationResult | null> {
    try {
      // Call cognition service for chat consideration
      const response = await fetch(
        `${this.config.cognitionEndpoint}/consider-chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            context: {
              currentState: context,
              currentTasks: context.currentTasks,
              recentEvents: [],
              emotionalState: 'thoughtful',
              memoryContext: {},
            },
          }),
          signal: AbortSignal.timeout(10000), // 10 second timeout
        }
      );

      if (!response.ok) {
        throw new Error(`Cognition service responded with ${response.status}`);
      }

      const result = (await response.json()) as {
        processed: boolean;
        shouldRespond: boolean;
        reasoning: string;
        priority: 'low' | 'medium' | 'high';
        responseContent?: string;
        responseType?:
          | 'greeting'
          | 'acknowledgment'
          | 'question'
          | 'statement'
          | 'farewell';
      };

      if (result.processed) {
        return {
          message,
          shouldRespond: result.shouldRespond,
          reasoning: result.reasoning,
          priority: result.priority,
          responseContent: result.responseContent,
          responseType: result.responseType,
          timestamp: Date.now(),
        };
      }

      return null;
    } catch (error) {
      console.error(
        `❌ Failed to generate chat consideration for ${message.sender}:`,
        error
      );

      // Fallback decision logic
      return this.generateChatConsiderationFallback(message, context);
    }
  }

  /**
   * Generate fallback chat consideration when LLM fails
   */
  private generateChatConsiderationFallback(
    message: ChatMessage,
    context: any
  ): ChatConsiderationResult {
    const { sender, senderType, content, isDirect, senderRelationship } =
      message;
    const { health, currentTasks } = context;

    // High priority responses
    if (isDirect && senderType === 'player') {
      return {
        message,
        shouldRespond: true,
        reasoning:
          'This is a direct message from a player and requires a response.',
        priority: 'high',
        responseContent: `I heard you, ${sender}. Let me think about that.`,
        responseType: 'acknowledgment',
        timestamp: Date.now(),
      };
    }

    if (senderRelationship === 'friend') {
      return {
        message,
        shouldRespond: true,
        reasoning: 'This message is from a friend, so I should acknowledge it.',
        priority: 'medium',
        responseContent: `Hey ${sender}, thanks for the message!`,
        responseType: 'acknowledgment',
        timestamp: Date.now(),
      };
    }

    if (health < 10) {
      return {
        message,
        shouldRespond: false,
        reasoning:
          'My health is low, I should focus on survival rather than chatting.',
        priority: 'low',
        timestamp: Date.now(),
      };
    }

    if (currentTasks.length > 0 && currentTasks[0].priority > 0.7) {
      return {
        message,
        shouldRespond: false,
        reasoning: 'I have high-priority tasks to focus on right now.',
        priority: 'low',
        timestamp: Date.now(),
      };
    }

    // Default - respond if it's a direct message or greeting
    const contentLower = content.toLowerCase();
    const isGreeting =
      contentLower.includes('hello') ||
      contentLower.includes('hi') ||
      contentLower.includes('hey');

    return {
      message,
      shouldRespond: isDirect || isGreeting,
      reasoning: isDirect
        ? 'Direct messages should be acknowledged.'
        : isGreeting
          ? 'Greetings should be reciprocated.'
          : "General chat that doesn't require immediate response.",
      priority: 'medium',
      responseContent: isGreeting ? `Hello ${sender}!` : undefined,
      responseType: isGreeting ? 'greeting' : 'acknowledgment',
      timestamp: Date.now(),
    };
  }

  /**
   * Generate fallback departure communication when LLM fails
   */
  private generateDepartureCommunicationFallback(
    currentArea: {
      name: string;
      entities: NearbyEntity[];
      position: { x: number; y: number; z: number };
    },
    newTask: {
      title: string;
      type: string;
      priority: number;
      destination?: { x: number; y: number; z: number };
    },
    context: {
      currentTasks: any[];
      health: number;
      timeOfDay?: number;
    }
  ): {
    shouldAnnounce: boolean;
    message?: string;
    reasoning: string;
    priority: 'low' | 'medium' | 'high';
  } {
    const { entities } = currentArea;
    const { title, priority } = newTask;

    // Only announce if there are players nearby
    const playersNearby = entities.filter(
      (e) => e.type === 'player' && e.distance < 10
    );

    if (playersNearby.length === 0) {
      return {
        shouldAnnounce: false,
        reasoning: 'No players nearby to announce departure to.',
        priority: 'low',
      };
    }

    if (priority > 0.8) {
      return {
        shouldAnnounce: true,
        message: `I need to head off to work on something important: "${title}". Be back later!`,
        reasoning:
          'High-priority task requires departure announcement to nearby players.',
        priority: 'high',
      };
    }

    if (priority > 0.5) {
      return {
        shouldAnnounce: true,
        message: `I'm going to work on "${title}". I'll be around if you need me.`,
        reasoning: 'Medium-priority task warrants a brief announcement.',
        priority: 'medium',
      };
    }

    return {
      shouldAnnounce: false,
      reasoning: "Low-priority task doesn't require departure announcement.",
      priority: 'low',
    };
  }

  /**
   * Update entity tracking
   */
  private updateEntityTracking(entity: NearbyEntity): void {
    entity.lastSeen = Date.now();
    this.entityTracking.set(entity.id, entity);

    // Clean up old entities
    const cutoff = Date.now() - 5 * 60 * 1000; // 5 minutes
    for (const [id, trackedEntity] of this.entityTracking) {
      if (trackedEntity.lastSeen && trackedEntity.lastSeen < cutoff) {
        this.entityTracking.delete(id);
      }
    }
  }

  /**
   * Get entity tracking statistics
   */
  getEntityStats(): {
    trackedEntities: number;
    recentConsiderations: number;
    entitiesByType: Record<string, number>;
  } {
    const entitiesByType: Record<string, number> = {};
    for (const entity of this.entityTracking.values()) {
      entitiesByType[entity.type] = (entitiesByType[entity.type] || 0) + 1;
    }

    return {
      trackedEntities: this.entityTracking.size,
      recentConsiderations: this.considerationHistory.size,
      entitiesByType,
    };
  }

  /**
   * Create a chat response goal when we decide to respond to a message
   */
  private async createChatResponseGoal(
    message: ChatMessage,
    result: ChatConsiderationResult
  ): Promise<void> {
    try {
      // Create a chat response goal
      const response = await fetch('http://localhost:3002/api/goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Respond to ${message.sender}`,
          description: `Send chat response: "${result.responseContent}" to ${message.sender}`,
          priority: this.calculateChatPriority(result.priority),
          urgency: this.calculateChatUrgency(result.priority),
          tasks: [
            {
              type: 'communication',
              description: `Send chat message: "${result.responseContent}"`,
              parameters: {
                action: 'chat',
                message: result.responseContent,
              },
              priority: result.priority,
            },
          ],
        }),
      });

      if (response.ok) {
        const goalData = (await response.json()) as { id: string };
        console.log(`🎯 Created chat response goal: ${goalData.id}`);
      } else {
        console.error(
          '❌ Failed to create chat response goal:',
          await response.text()
        );
      }
    } catch (error) {
      console.error('❌ Error creating chat response goal:', error);
    }
  }

  /**
   * Calculate goal priority from chat priority
   */
  private calculateChatPriority(
    chatPriority: ChatConsiderationResult['priority']
  ): number {
    if (chatPriority === 'high') return 0.7;
    if (chatPriority === 'medium') return 0.5;
    return 0.3; // low
  }

  /**
   * Calculate goal urgency from chat priority
   */
  private calculateChatUrgency(
    chatPriority: ChatConsiderationResult['priority']
  ): number {
    if (chatPriority === 'high') return 0.6;
    if (chatPriority === 'medium') return 0.4;
    return 0.2; // low
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<SocialAwarenessConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): SocialAwarenessConfig {
    return { ...this.config };
  }

  /**
   * Record a social encounter in the memory system
   */
  private async recordSocialEncounter(encounter: {
    entityId: string;
    type: 'chat' | 'interaction' | 'observation' | 'conflict' | 'assistance';
    timestamp: number;
    description: string;
    outcome?: 'positive' | 'neutral' | 'negative';
    newFacts: any[];
    location?: { x: number; y: number; z: number };
    emotionalImpact?: number;
    memoryBoost: number;
  }): Promise<void> {
    if (!this.config.socialMemoryManager) return;

    try {
      await this.config.socialMemoryManager.recordEncounter(encounter);
    } catch (error) {
      console.error(
        `❌ Failed to record social encounter for ${encounter.entityId}:`,
        error
      );
    }
  }

  /**
   * Record a social fact about an entity
   */
  async recordSocialFact(
    entityId: string,
    factContent: string,
    category:
      | 'personal'
      | 'location'
      | 'behavior'
      | 'relationship'
      | 'appearance'
      | 'personality'
      | 'preference'
      | 'history',
    confidence: number = 0.7
  ): Promise<void> {
    if (!this.config.socialMemoryManager) return;

    try {
      const entity = this.entityTracking.get(entityId);
      if (!entity) return;

      // Create a fact object
      const fact = {
        id: `fact-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        content: factContent,
        category,
        confidence,
        discoveredAt: Date.now(),
        lastReinforced: Date.now(),
        strength: 0.8,
        source: 'observation' as const,
        isRedacted: false,
        redactionLevel: 0,
        originalContent: factContent,
      };

      await this.config.socialMemoryManager.addFactsToEntity(entityId, [fact]);
    } catch (error) {
      console.error(`❌ Failed to record social fact for ${entityId}:`, error);
    }
  }

  /**
   * Get remembered entities from social memory
   */
  async getRememberedEntities(minStrength: number = 0.1): Promise<any[]> {
    if (!this.config.socialMemoryManager) return [];

    try {
      return await this.config.socialMemoryManager.getRememberedEntities(
        minStrength
      );
    } catch (error) {
      console.error('❌ Failed to get remembered entities:', error);
      return [];
    }
  }

  /**
   * Search entities by fact content
   */
  async searchEntitiesByFact(query: string): Promise<any[]> {
    if (!this.config.socialMemoryManager) return [];

    try {
      return await this.config.socialMemoryManager.searchByFact(query);
    } catch (error) {
      console.error('❌ Failed to search entities by fact:', error);
      return [];
    }
  }
}
