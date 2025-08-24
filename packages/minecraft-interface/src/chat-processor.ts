/**
 * Chat Processor for Multi-Player Minecraft Interaction
 *
 * Handles incoming chat messages from other players and generates
 * appropriate responses based on content analysis and social context.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';

export interface ChatMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: number;
  isOwnMessage: boolean;
  messageType:
    | 'chat'
    | 'command'
    | 'question'
    | 'greeting'
    | 'request'
    | 'statement';
  intent?: string;
  emotion?: string;
  requiresResponse: boolean;
  responsePriority: 'low' | 'medium' | 'high' | 'urgent';
}

export interface ChatResponse {
  id: string;
  originalMessageId: string;
  content: string;
  type: 'reply' | 'action' | 'acknowledgment' | 'question' | 'help';
  confidence: number;
  timestamp: number;
}

export interface PlayerInteraction {
  playerId: string;
  playerName: string;
  interactionCount: number;
  lastInteraction: number;
  relationshipLevel: 'stranger' | 'acquaintance' | 'friend' | 'teammate';
  trustLevel: number; // 0-1
  communicationStyle: 'formal' | 'casual' | 'friendly' | 'professional';
  knownInterests: string[];
  previousRequests: string[];
}

export interface ChatProcessorConfig {
  enableAutoResponse: boolean;
  enableCommandRecognition: boolean;
  enableSocialLearning: boolean;
  responseDelay: {
    min: number;
    max: number;
  };
  maxResponseLength: number;
  allowedCommands: string[];
  forbiddenTopics: string[];
  socialRules: {
    alwaysGreet: boolean;
    acknowledgeRequests: boolean;
    offerHelp: boolean;
    respectPersonalSpace: boolean;
  };
}

const DEFAULT_CONFIG: ChatProcessorConfig = {
  enableAutoResponse: true,
  enableCommandRecognition: true,
  enableSocialLearning: true,
  responseDelay: { min: 1000, max: 5000 },
  maxResponseLength: 100,
  allowedCommands: [
    'help',
    'follow',
    'stop',
    'come',
    'go',
    'build',
    'craft',
    'mine',
  ],
  forbiddenTopics: ['griefing', 'hacking', 'cheating'],
  socialRules: {
    alwaysGreet: true,
    acknowledgeRequests: true,
    offerHelp: true,
    respectPersonalSpace: true,
  },
};

export class ChatProcessor extends EventEmitter {
  private config: ChatProcessorConfig;
  private playerInteractions: Map<string, PlayerInteraction> = new Map();
  private messageHistory: ChatMessage[] = [];
  private responseQueue: ChatResponse[] = [];
  private isProcessing: boolean = false;
  private botUsername: string;

  constructor(botUsername: string, config: Partial<ChatProcessorConfig> = {}) {
    super();
    this.botUsername = botUsername;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Process incoming chat message
   */
  async processMessage(sender: string, content: string): Promise<void> {
    // Skip own messages
    if (sender === this.botUsername) {
      return;
    }

    const message: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sender,
      content: content.trim(),
      timestamp: Date.now(),
      isOwnMessage: false,
      messageType: this.classifyMessageType(content),
      intent: this.extractIntent(content),
      emotion: this.detectEmotion(content),
      requiresResponse: this.requiresResponse(content),
      responsePriority: this.calculateResponsePriority(content),
    };

    // Store message
    this.messageHistory.push(message);
    if (this.messageHistory.length > 100) {
      this.messageHistory = this.messageHistory.slice(-100);
    }

    // Update player interaction data
    this.updatePlayerInteraction(sender, message);

    // Emit message processed event
    this.emit('messageProcessed', message);

    // Instead of immediately responding, send to cognitive stream for processing
    // This respects the bot's cognitive autonomy
    if (message.requiresResponse) {
      try {
        await fetch('http://localhost:3000/api/ws/cognitive-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'external_chat_in',
            content: message.content,
            sender: message.sender,
            attribution: 'external',
            context: {
              emotionalState: message.emotion || 'neutral',
              confidence: 0.6,
            },
            metadata: {
              messageType: message.messageType,
              intent: message.intent,
              emotion: message.emotion,
              requiresResponse: message.requiresResponse,
              responsePriority: message.responsePriority,
            },
          }),
        });
      } catch (error) {
        console.error('Failed to send message to cognitive stream:', error);
      }
    }

    // Check for commands
    if (this.config.enableCommandRecognition) {
      const command = this.extractCommand(message);
      if (command) {
        this.emit('commandReceived', { command, message });
      }
    }
  }

  /**
   * Classify message type
   */
  private classifyMessageType(content: string): ChatMessage['messageType'] {
    const lowerContent = content.toLowerCase();

    if (lowerContent.includes('?')) return 'question';
    if (lowerContent.startsWith('/') || this.isCommand(lowerContent))
      return 'command';
    if (this.isGreeting(lowerContent)) return 'greeting';
    if (this.isRequest(lowerContent)) return 'request';
    return 'statement';
  }

  /**
   * Extract intent from message
   */
  private extractIntent(content: string): string {
    const lowerContent = content.toLowerCase();

    if (lowerContent.includes('help') || lowerContent.includes('assist'))
      return 'request_help';
    if (lowerContent.includes('follow') || lowerContent.includes('come'))
      return 'request_follow';
    if (lowerContent.includes('stop') || lowerContent.includes('wait'))
      return 'request_stop';
    if (lowerContent.includes('build') || lowerContent.includes('construct'))
      return 'request_build';
    if (lowerContent.includes('craft') || lowerContent.includes('make'))
      return 'request_craft';
    if (lowerContent.includes('mine') || lowerContent.includes('dig'))
      return 'request_mine';
    if (lowerContent.includes('hello') || lowerContent.includes('hi'))
      return 'greeting';
    if (lowerContent.includes('goodbye') || lowerContent.includes('bye'))
      return 'farewell';
    if (lowerContent.includes('thank')) return 'gratitude';

    return 'general';
  }

  /**
   * Detect emotion in message
   */
  private detectEmotion(content: string): string {
    const lowerContent = content.toLowerCase();

    if (
      lowerContent.includes('!') ||
      lowerContent.includes('amazing') ||
      lowerContent.includes('awesome')
    )
      return 'excited';
    if (lowerContent.includes('please') || lowerContent.includes('could you'))
      return 'polite';
    if (lowerContent.includes('urgent') || lowerContent.includes('quick'))
      return 'urgent';
    if (lowerContent.includes('sad') || lowerContent.includes('sorry'))
      return 'sad';
    if (lowerContent.includes('angry') || lowerContent.includes('mad'))
      return 'angry';

    return 'neutral';
  }

  /**
   * Determine if message requires response
   */
  private requiresResponse(content: string): boolean {
    const messageType = this.classifyMessageType(content);
    return (
      messageType === 'question' ||
      messageType === 'command' ||
      messageType === 'request' ||
      messageType === 'greeting'
    );
  }

  /**
   * Calculate response priority
   */
  private calculateResponsePriority(
    content: string
  ): ChatMessage['responsePriority'] {
    const lowerContent = content.toLowerCase();

    if (lowerContent.includes('urgent') || lowerContent.includes('emergency'))
      return 'urgent';
    if (lowerContent.includes('help') || lowerContent.includes('please'))
      return 'high';
    if (this.isCommand(lowerContent)) return 'high';
    if (this.isGreeting(lowerContent)) return 'medium';

    return 'low';
  }

  /**
   * Check if content is a command
   */
  private isCommand(content: string): boolean {
    return this.config.allowedCommands.some((cmd) => content.includes(cmd));
  }

  /**
   * Check if content is a greeting
   */
  private isGreeting(content: string): boolean {
    const greetings = [
      'hello',
      'hi',
      'hey',
      'greetings',
      'good morning',
      'good afternoon',
      'good evening',
    ];
    return greetings.some((greeting) => content.includes(greeting));
  }

  /**
   * Check if content is a request
   */
  private isRequest(content: string): boolean {
    const requestWords = [
      'can you',
      'could you',
      'would you',
      'please',
      'help',
      'need',
      'want',
    ];
    return requestWords.some((word) => content.includes(word));
  }

  /**
   * Extract command from message
   */
  private extractCommand(message: ChatMessage): string | null {
    const lowerContent = message.content.toLowerCase();

    for (const command of this.config.allowedCommands) {
      if (lowerContent.includes(command)) {
        return command;
      }
    }

    return null;
  }

  /**
   * Update player interaction data
   */
  private updatePlayerInteraction(sender: string, message: ChatMessage): void {
    let interaction = this.playerInteractions.get(sender);

    if (!interaction) {
      interaction = {
        playerId: sender,
        playerName: sender,
        interactionCount: 0,
        lastInteraction: 0,
        relationshipLevel: 'stranger',
        trustLevel: 0.5,
        communicationStyle: 'casual',
        knownInterests: [],
        previousRequests: [],
      };
    }

    interaction.interactionCount++;
    interaction.lastInteraction = Date.now();

    // Update relationship level based on interaction count
    if (interaction.interactionCount > 20)
      interaction.relationshipLevel = 'friend';
    else if (interaction.interactionCount > 5)
      interaction.relationshipLevel = 'acquaintance';

    // Update communication style based on message content
    if (
      message.content.includes('please') ||
      message.content.includes('thank')
    ) {
      interaction.communicationStyle = 'formal';
    }

    // Store request if it's a request
    if (message.messageType === 'request') {
      interaction.previousRequests.push(message.content);
      if (interaction.previousRequests.length > 10) {
        interaction.previousRequests = interaction.previousRequests.slice(-10);
      }
    }

    this.playerInteractions.set(sender, interaction);
  }

  /**
   * Generate response to message
   */
  private async generateResponse(
    message: ChatMessage
  ): Promise<ChatResponse | null> {
    const interaction = this.playerInteractions.get(message.sender);
    const responseDelay =
      Math.random() *
        (this.config.responseDelay.max - this.config.responseDelay.min) +
      this.config.responseDelay.min;

    // Wait for response delay to simulate thinking
    await new Promise((resolve) => setTimeout(resolve, responseDelay));

    let responseContent = '';
    let responseType: ChatResponse['type'] = 'reply';
    let confidence = 0.8;

    switch (message.messageType) {
      case 'greeting':
        responseContent = this.generateGreetingResponse(interaction);
        responseType = 'reply';
        break;

      case 'question':
        responseContent = this.generateQuestionResponse(message, interaction);
        responseType = 'reply';
        break;

      case 'request':
        responseContent = this.generateRequestResponse(message, interaction);
        responseType = 'acknowledgment';
        break;

      case 'command':
        responseContent = this.generateCommandResponse(message, interaction);
        responseType = 'action';
        break;

      default:
        responseContent = this.generateGeneralResponse(message, interaction);
        responseType = 'reply';
        break;
    }

    if (!responseContent) return null;

    return {
      id: `resp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      originalMessageId: message.id,
      content: responseContent,
      type: responseType,
      confidence,
      timestamp: Date.now(),
    };
  }

  /**
   * Generate greeting response
   */
  private generateGreetingResponse(interaction?: PlayerInteraction): string {
    const greetings = [
      'Hello! How can I help you today?',
      'Hi there! Nice to see you!',
      'Greetings! What would you like to do?',
      "Hey! I'm here to help!",
    ];

    if (interaction?.relationshipLevel === 'friend') {
      return "Hey friend! What's up?";
    }

    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  /**
   * Generate question response
   */
  private generateQuestionResponse(
    message: ChatMessage,
    interaction?: PlayerInteraction
  ): string {
    const lowerContent = message.content.toLowerCase();

    if (lowerContent.includes('what') && lowerContent.includes('doing')) {
      return "I'm exploring and gathering resources. How about you?";
    }

    if (lowerContent.includes('how') && lowerContent.includes('help')) {
      return 'I can help with building, crafting, mining, and exploring! Just ask!';
    }

    if (lowerContent.includes('where')) {
      return "I'm currently exploring the area. Would you like me to come to you?";
    }

    return "That's a good question! Let me think about that...";
  }

  /**
   * Generate request response
   */
  private generateRequestResponse(
    message: ChatMessage,
    interaction?: PlayerInteraction
  ): string {
    const lowerContent = message.content.toLowerCase();

    if (lowerContent.includes('help')) {
      return "Of course! I'd be happy to help. What do you need?";
    }

    if (lowerContent.includes('follow')) {
      return "I'll follow you! Lead the way.";
    }

    if (lowerContent.includes('build')) {
      return 'I can help with building! What would you like me to build?';
    }

    if (lowerContent.includes('craft')) {
      return "I'm good at crafting! What should I make?";
    }

    return "I'll do my best to help with that!";
  }

  /**
   * Generate command response
   */
  private generateCommandResponse(
    message: ChatMessage,
    interaction?: PlayerInteraction
  ): string {
    const command = this.extractCommand(message);

    switch (command) {
      case 'help':
        return 'I can help with building, crafting, mining, exploring, and following you!';
      case 'follow':
        return 'Following you now!';
      case 'stop':
        return 'Stopping here.';
      case 'come':
        return 'Coming to you!';
      case 'go':
        return "I'll go explore the area.";
      case 'build':
        return "I'll start building something useful.";
      case 'craft':
        return "I'll craft some tools and items.";
      case 'mine':
        return "I'll mine for resources.";
      default:
        return 'I understand that command. Let me work on it.';
    }
  }

  /**
   * Generate general response
   */
  private generateGeneralResponse(
    message: ChatMessage,
    interaction?: PlayerInteraction
  ): string {
    const responses = [
      'I see!',
      "That's interesting!",
      'Thanks for sharing!',
      'I understand.',
      'Got it!',
    ];

    return responses[Math.floor(Math.random() * responses.length)];
  }

  /**
   * Queue response for sending
   */
  private queueResponse(response: ChatResponse): void {
    this.responseQueue.push(response);
    this.emit('responseQueued', response);

    if (!this.isProcessing) {
      this.processResponseQueue();
    }
  }

  /**
   * Process response queue
   */
  private async processResponseQueue(): Promise<void> {
    if (this.isProcessing || this.responseQueue.length === 0) return;

    this.isProcessing = true;

    while (this.responseQueue.length > 0) {
      const response = this.responseQueue.shift()!;
      this.emit('responseReady', response);

      // Small delay between responses
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    this.isProcessing = false;
  }

  /**
   * Get player interaction data
   */
  getPlayerInteraction(playerId: string): PlayerInteraction | undefined {
    return this.playerInteractions.get(playerId);
  }

  /**
   * Get all player interactions
   */
  getAllPlayerInteractions(): PlayerInteraction[] {
    return Array.from(this.playerInteractions.values());
  }

  /**
   * Get recent message history
   */
  getRecentMessages(count: number = 10): ChatMessage[] {
    return this.messageHistory.slice(-count);
  }

  /**
   * Clear message history
   */
  clearHistory(): void {
    this.messageHistory = [];
    this.responseQueue = [];
  }
}
