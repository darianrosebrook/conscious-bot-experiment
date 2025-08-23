/**
 * Conversation flow management system.
 *
 * Manages conversation state, topic tracking, and communication style
 * adaptation for natural and coherent social interactions.
 *
 * @author @darianrosebrook
 */

import { LLMInterface } from './llm-interface';
import { Message } from '../types';

/**
 * Configuration for conversation management
 */
export interface ConversationManagerConfig {
  maxHistoryLength: number;
  topicMemoryWindow: number; // milliseconds
  styleAdaptationEnabled: boolean;
  topicTrackingEnabled: boolean;
  relationshipLearningEnabled: boolean;
  maxTopicsPerConversation: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ConversationManagerConfig = {
  maxHistoryLength: 50,
  topicMemoryWindow: 300000, // 5 minutes
  styleAdaptationEnabled: true,
  topicTrackingEnabled: true,
  relationshipLearningEnabled: true,
  maxTopicsPerConversation: 10,
};

/**
 * Conversation state tracking
 */
export interface ConversationState {
  conversationId: string;
  participants: string[];
  currentTopic?: string;
  topicHistory: TopicModel[];
  relationshipStatus: Map<string, Relationship>;
  communicationStyle: CommunicationStyle;
  emotionalTone: string;
  formalityLevel: number; // 0-1
  engagementLevel: number; // 0-1
  lastActivity: number;
  messageCount: number;
}

/**
 * Topic model for conversation tracking
 */
export interface TopicModel {
  id: string;
  name: string;
  description: string;
  startTime: number;
  endTime?: number;
  messageCount: number;
  participants: string[];
  keywords: string[];
  sentiment: number; // -1 to 1
  importance: number; // 0-1
}

/**
 * Relationship tracking
 */
export interface Relationship {
  participantId: string;
  relationshipType: string;
  familiarity: number; // 0-1
  trustLevel: number; // 0-1
  communicationHistory: number;
  lastInteraction: number;
  preferences: string[];
  communicationStyle: CommunicationStyle;
}

/**
 * Communication style configuration
 */
export interface CommunicationStyle {
  formality: number; // 0-1
  verbosity: number; // 0-1
  emotionalExpressiveness: number; // 0-1
  technicalLevel: number; // 0-1
  humorLevel: number; // 0-1
  directness: number; // 0-1
}

/**
 * Conversation flow manager
 */
export class ConversationManager {
  private llm: LLMInterface;
  private config: ConversationManagerConfig;
  private conversations: Map<string, ConversationState> = new Map();
  private topicKeywords: Map<string, string[]> = new Map();

  constructor(
    llm: LLMInterface,
    config: Partial<ConversationManagerConfig> = {}
  ) {
    this.llm = llm;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeTopicKeywords();
  }

  /**
   * Process incoming message and update conversation state
   */
  async processMessage(
    conversationId: string,
    message: Message,
    participants: string[]
  ): Promise<ConversationState> {
    let state = this.conversations.get(conversationId);

    if (!state) {
      state = this.initializeConversation(conversationId, participants);
    }

    // Update conversation state
    state.messageCount++;
    state.lastActivity = Date.now();
    state.participants = [...new Set([...state.participants, ...participants])];

    // Track topic changes
    if (this.config.topicTrackingEnabled) {
      await this.updateTopicTracking(state, message);
    }

    // Update relationship information
    if (this.config.relationshipLearningEnabled) {
      this.updateRelationshipStatus(state, message);
    }

    // Adapt communication style
    if (this.config.styleAdaptationEnabled) {
      await this.adaptCommunicationStyle(state, message);
    }

    // Update engagement level
    this.updateEngagementLevel(state, message);

    this.conversations.set(conversationId, state);
    return state;
  }

  /**
   * Initialize a new conversation
   */
  private initializeConversation(
    conversationId: string,
    participants: string[]
  ): ConversationState {
    const relationships = new Map<string, Relationship>();

    participants.forEach((participantId) => {
      relationships.set(participantId, {
        participantId,
        relationshipType: 'unknown',
        familiarity: 0.3,
        trustLevel: 0.5,
        communicationHistory: 0,
        lastInteraction: Date.now(),
        preferences: [],
        communicationStyle: {
          formality: 0.5,
          verbosity: 0.5,
          emotionalExpressiveness: 0.5,
          technicalLevel: 0.5,
          humorLevel: 0.3,
          directness: 0.7,
        },
      });
    });

    return {
      conversationId,
      participants,
      topicHistory: [],
      relationshipStatus: relationships,
      communicationStyle: {
        formality: 0.5,
        verbosity: 0.5,
        emotionalExpressiveness: 0.5,
        technicalLevel: 0.5,
        humorLevel: 0.3,
        directness: 0.7,
      },
      emotionalTone: 'neutral',
      formalityLevel: 0.5,
      engagementLevel: 0.5,
      lastActivity: Date.now(),
      messageCount: 0,
    };
  }

  /**
   * Update topic tracking for the conversation
   */
  private async updateTopicTracking(
    state: ConversationState,
    message: Message
  ): Promise<void> {
    const currentTime = Date.now();
    const topicKeywords = this.extractTopicKeywords(message.content);

    // Check if this message continues the current topic
    if (
      state.currentTopic &&
      this.isTopicContinuation(state.currentTopic, topicKeywords)
    ) {
      // Update current topic
      const currentTopic = state.topicHistory.find(
        (t) => t.name === state.currentTopic
      );
      if (currentTopic) {
        currentTopic.messageCount++;
        currentTopic.keywords = [
          ...new Set([...currentTopic.keywords, ...topicKeywords]),
        ];
        currentTopic.sentiment = this.calculateSentiment(message.content);
      }
    } else {
      // Start new topic
      const newTopic = await this.identifyNewTopic(
        message.content,
        topicKeywords
      );
      if (newTopic) {
        // End current topic if exists
        if (state.currentTopic) {
          const currentTopic = state.topicHistory.find(
            (t) => t.name === state.currentTopic
          );
          if (currentTopic) {
            currentTopic.endTime = currentTime;
          }
        }

        // Add new topic
        state.topicHistory.push(newTopic);
        state.currentTopic = newTopic.name;

        // Limit topic history
        if (state.topicHistory.length > this.config.maxTopicsPerConversation) {
          state.topicHistory = state.topicHistory.slice(
            -this.config.maxTopicsPerConversation
          );
        }
      }
    }
  }

  /**
   * Extract keywords from message content
   */
  private extractTopicKeywords(content: string): string[] {
    const words = content
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((word) => word.length > 3);

    const keywords: string[] = [];

    // Simple keyword extraction - in a real implementation, this would use NLP
    for (const [topic, topicWords] of this.topicKeywords.entries()) {
      const matches = topicWords.filter((word) => words.includes(word));
      if (matches.length > 0) {
        keywords.push(...matches);
      }
    }

    return [...new Set(keywords)];
  }

  /**
   * Check if message continues current topic
   */
  private isTopicContinuation(
    currentTopic: string,
    keywords: string[]
  ): boolean {
    const topicWords = this.topicKeywords.get(currentTopic) || [];
    return keywords.some((keyword) => topicWords.includes(keyword));
  }

  /**
   * Identify new topic from message content
   */
  private async identifyNewTopic(
    content: string,
    keywords: string[]
  ): Promise<TopicModel | null> {
    const prompt = `Message: "${content}"
Keywords: ${keywords.join(', ')}

Identify the main topic of this message. Choose from these categories:
- Technical Discussion
- Personal/Social
- Problem Solving
- Planning/Coordination
- Entertainment/Humor
- Information Sharing
- Decision Making
- Other

Provide:
1. Topic name
2. Brief description
3. Importance level (0-1)
4. Sentiment (-1 to 1)`;

    try {
      const response = await this.llm.generateResponse(
        prompt,
        {
          systemPrompt:
            'You are analyzing conversation topics. Be concise and accurate.',
        },
        {
          temperature: 0.3,
          maxTokens: 128,
        }
      );

      return this.parseTopicResponse(response.text, keywords);
    } catch (error) {
      console.error('Error identifying topic:', error);
      return null;
    }
  }

  /**
   * Parse topic identification response
   */
  private parseTopicResponse(response: string, keywords: string[]): TopicModel {
    const lines = response.split('\n');
    const topicName =
      lines
        .find((line) => line.includes('Topic:'))
        ?.replace('Topic:', '')
        .trim() || 'General Discussion';
    const description =
      lines
        .find((line) => line.includes('description'))
        ?.replace(/.*description:?\s*/i, '')
        .trim() || 'General conversation';

    const importanceMatch = response.match(/importance.*?(\d+\.?\d*)/i);
    const importance = importanceMatch ? parseFloat(importanceMatch[1]) : 0.5;

    const sentimentMatch = response.match(/sentiment.*?(-?\d+\.?\d*)/i);
    const sentiment = sentimentMatch ? parseFloat(sentimentMatch[1]) : 0;

    return {
      id: `topic-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: topicName,
      description,
      startTime: Date.now(),
      messageCount: 1,
      participants: [],
      keywords,
      sentiment,
      importance,
    };
  }

  /**
   * Calculate sentiment of message content
   */
  private calculateSentiment(content: string): number {
    const positiveWords = [
      'good',
      'great',
      'excellent',
      'amazing',
      'wonderful',
      'love',
      'like',
      'happy',
      'excited',
    ];
    const negativeWords = [
      'bad',
      'terrible',
      'awful',
      'hate',
      'dislike',
      'sad',
      'angry',
      'frustrated',
      'disappointed',
    ];

    const words = content.toLowerCase().split(/\s+/);
    const positiveCount = words.filter((word) =>
      positiveWords.includes(word)
    ).length;
    const negativeCount = words.filter((word) =>
      negativeWords.includes(word)
    ).length;

    if (positiveCount === 0 && negativeCount === 0) return 0;
    return (positiveCount - negativeCount) / (positiveCount + negativeCount);
  }

  /**
   * Update relationship status based on message
   */
  private updateRelationshipStatus(
    state: ConversationState,
    message: Message
  ): void {
    const relationship = state.relationshipStatus.get(message.sender);
    if (relationship) {
      relationship.communicationHistory++;
      relationship.lastInteraction = Date.now();

      // Update familiarity based on communication frequency
      relationship.familiarity = Math.min(1, relationship.familiarity + 0.01);

      // Update trust level based on message content (simplified)
      if (
        message.content.includes('thank') ||
        message.content.includes('help')
      ) {
        relationship.trustLevel = Math.min(1, relationship.trustLevel + 0.02);
      }
    }
  }

  /**
   * Adapt communication style based on conversation context
   */
  private async adaptCommunicationStyle(
    state: ConversationState,
    message: Message
  ): Promise<void> {
    const relationship = state.relationshipStatus.get(message.sender);
    if (!relationship) return;

    const prompt = `Conversation Context:
- Current topic: ${state.currentTopic || 'General'}
- Relationship type: ${relationship.relationshipType}
- Familiarity: ${relationship.familiarity}
- Trust level: ${relationship.trustLevel}
- Message count: ${state.messageCount}
- Emotional tone: ${state.emotionalTone}

Recent message: "${message.content}"

Adapt the communication style for future responses. Consider:
- Formality level (0-1)
- Verbosity (0-1)
- Emotional expressiveness (0-1)
- Technical level (0-1)
- Humor level (0-1)
- Directness (0-1)

Provide style recommendations.`;

    try {
      const response = await this.llm.generateResponse(
        prompt,
        {
          systemPrompt:
            'You are adapting communication style based on conversation context.',
        },
        {
          temperature: 0.4,
          maxTokens: 256,
        }
      );

      const adaptedStyle = this.parseStyleAdaptation(response.text);
      state.communicationStyle = {
        ...state.communicationStyle,
        ...adaptedStyle,
      };
    } catch (error) {
      console.error('Error adapting communication style:', error);
    }
  }

  /**
   * Parse style adaptation response
   */
  private parseStyleAdaptation(response: string): Partial<CommunicationStyle> {
    const style: Partial<CommunicationStyle> = {};

    const formalityMatch = response.match(/formality.*?(\d+\.?\d*)/i);
    if (formalityMatch) style.formality = parseFloat(formalityMatch[1]);

    const verbosityMatch = response.match(/verbosity.*?(\d+\.?\d*)/i);
    if (verbosityMatch) style.verbosity = parseFloat(verbosityMatch[1]);

    const emotionalMatch = response.match(/emotional.*?(\d+\.?\d*)/i);
    if (emotionalMatch)
      style.emotionalExpressiveness = parseFloat(emotionalMatch[1]);

    const technicalMatch = response.match(/technical.*?(\d+\.?\d*)/i);
    if (technicalMatch) style.technicalLevel = parseFloat(technicalMatch[1]);

    const humorMatch = response.match(/humor.*?(\d+\.?\d*)/i);
    if (humorMatch) style.humorLevel = parseFloat(humorMatch[1]);

    const directnessMatch = response.match(/directness.*?(\d+\.?\d*)/i);
    if (directnessMatch) style.directness = parseFloat(directnessMatch[1]);

    return style;
  }

  /**
   * Update engagement level based on message
   */
  private updateEngagementLevel(
    state: ConversationState,
    message: Message
  ): void {
    const content = message.content.toLowerCase();

    // Simple engagement indicators
    const engagementIndicators = [
      content.includes('?'), // Questions
      content.includes('!'), // Exclamations
      content.length > 50, // Longer messages
      content.includes('think') || content.includes('feel'), // Personal thoughts
      content.includes('you') || content.includes('your'), // Direct engagement
    ];

    const engagementScore =
      engagementIndicators.filter(Boolean).length / engagementIndicators.length;
    state.engagementLevel = Math.min(
      1,
      state.engagementLevel * 0.9 + engagementScore * 0.1
    );
  }

  /**
   * Get conversation state
   */
  getConversationState(conversationId: string): ConversationState | undefined {
    return this.conversations.get(conversationId);
  }

  /**
   * Get current topic for conversation
   */
  getCurrentTopic(conversationId: string): TopicModel | undefined {
    const state = this.conversations.get(conversationId);
    if (!state || !state.currentTopic) return undefined;

    return state.topicHistory.find(
      (topic) => topic.name === state.currentTopic
    );
  }

  /**
   * Get communication style for conversation
   */
  getCommunicationStyle(
    conversationId: string
  ): CommunicationStyle | undefined {
    const state = this.conversations.get(conversationId);
    return state?.communicationStyle;
  }

  /**
   * Get relationship information for participant
   */
  getRelationship(
    conversationId: string,
    participantId: string
  ): Relationship | undefined {
    const state = this.conversations.get(conversationId);
    return state?.relationshipStatus.get(participantId);
  }

  /**
   * Initialize topic keywords for tracking
   */
  private initializeTopicKeywords(): void {
    this.topicKeywords.set('Technical Discussion', [
      'code',
      'programming',
      'algorithm',
      'function',
      'bug',
      'error',
      'debug',
      'test',
      'deploy',
      'optimize',
    ]);

    this.topicKeywords.set('Personal/Social', [
      'family',
      'friend',
      'weekend',
      'vacation',
      'hobby',
      'interest',
      'feeling',
      'emotion',
      'experience',
    ]);

    this.topicKeywords.set('Problem Solving', [
      'problem',
      'issue',
      'challenge',
      'solve',
      'fix',
      'resolve',
      'troubleshoot',
      'debug',
      'workaround',
    ]);

    this.topicKeywords.set('Planning/Coordination', [
      'plan',
      'schedule',
      'meeting',
      'coordinate',
      'organize',
      'arrange',
      'timeline',
      'deadline',
      'milestone',
    ]);

    this.topicKeywords.set('Entertainment/Humor', [
      'joke',
      'funny',
      'humor',
      'entertainment',
      'movie',
      'music',
      'game',
      'laugh',
      'amusing',
      'hilarious',
    ]);

    this.topicKeywords.set('Information Sharing', [
      'information',
      'data',
      'fact',
      'knowledge',
      'share',
      'report',
      'update',
      'news',
      'announcement',
    ]);

    this.topicKeywords.set('Decision Making', [
      'decide',
      'choice',
      'option',
      'alternative',
      'prefer',
      'recommend',
      'suggest',
      'propose',
      'vote',
    ]);
  }

  /**
   * Get conversation statistics
   */
  getStats() {
    const conversations = Array.from(this.conversations.values());

    return {
      totalConversations: conversations.length,
      averageMessageCount:
        conversations.length > 0
          ? conversations.reduce((sum, c) => sum + c.messageCount, 0) /
            conversations.length
          : 0,
      averageEngagement:
        conversations.length > 0
          ? conversations.reduce((sum, c) => sum + c.engagementLevel, 0) /
            conversations.length
          : 0,
      totalTopics: conversations.reduce(
        (sum, c) => sum + c.topicHistory.length,
        0
      ),
      config: this.config,
    };
  }

  /**
   * Clean up old conversations
   */
  cleanupOldConversations(maxAgeMs: number = 3600000): void {
    // Default 1 hour
    const cutoff = Date.now() - maxAgeMs;

    for (const [conversationId, state] of this.conversations.entries()) {
      if (state.lastActivity < cutoff) {
        this.conversations.delete(conversationId);
      }
    }
  }
}
