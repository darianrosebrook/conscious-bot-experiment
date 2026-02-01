/**
 * Enhanced Memory Integration System
 *
 * Provides real memory retrieval, event logging, and reflective note generation
 * to replace mock data with actual cognitive insights and memory data.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { resilientFetch } from '@conscious-bot/core';

interface MemoryEvent {
  id: string;
  timestamp: number;
  type: string;
  title: string;
  description: string;
  source: string;
  data: Record<string, any>;
  priority: number;
}

interface ReflectiveNote {
  id: string;
  timestamp: number;
  type: 'reflection' | 'strategy' | 'learning' | 'insight';
  title: string;
  content: string;
  insights: string[];
  priority: number;
  source: string;
  confidence: number;
}

interface MemoryIntegrationConfig {
  enableRealTimeUpdates: boolean;
  enableReflectiveNotes: boolean;
  enableEventLogging: boolean;
  enableMemoryDiscovery: boolean;
  dashboardEndpoint: string;
  memorySystemEndpoint: string;
  maxEvents: number;
  maxNotes: number;
  memorySystemTimeout: number;
  retryAttempts: number;
}

const DEFAULT_CONFIG: MemoryIntegrationConfig = {
  enableRealTimeUpdates: true,
  enableReflectiveNotes: true,
  enableEventLogging: true,
  enableMemoryDiscovery: true,
  dashboardEndpoint: 'http://localhost:3000',
  memorySystemEndpoint: 'http://localhost:3001',
  maxEvents: 100,
  maxNotes: 50,
  memorySystemTimeout: 5000,
  retryAttempts: 3,
};

export class MemoryIntegration extends EventEmitter {
  private config: MemoryIntegrationConfig;
  private events: MemoryEvent[] = [];
  private notes: ReflectiveNote[] = [];
  private eventCounter = 0;
  private noteCounter = 0;
  // Simple per-instance circuit breaker for memory system
  private memFailureCount = 0;
  private memCircuitOpenUntil = 0; // epoch ms until which circuit is open
  private discoveredEndpoints: string[] = [];
  private lastDiscovery: number = 0;
  private readonly DISCOVERY_INTERVAL = 30000; // 30 seconds

  constructor(config: Partial<MemoryIntegrationConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Start memory system discovery if enabled
    if (this.config.enableMemoryDiscovery) {
      this.discoverMemorySystemEndpoints();
      // Set up periodic discovery
      setInterval(() => {
        this.discoverMemorySystemEndpoints();
      }, this.DISCOVERY_INTERVAL);
    }
  }

  private isMemCircuitOpen(): boolean {
    return Date.now() < this.memCircuitOpenUntil;
  }

  /**
   * Discover available memory system endpoints
   */
  private async discoverMemorySystemEndpoints(): Promise<void> {
    if (Date.now() - this.lastDiscovery < this.DISCOVERY_INTERVAL) {
      return; // Don't discover too frequently
    }

    // Detect if running in container environment
    const isContainerEnv =
      process.env.DOCKER_HOST ||
      process.env.KUBERNETES_SERVICE_HOST ||
      process.env.CONTAINER_ENV === 'true';

    // Build endpoint list based on environment
    // In local dev, skip Docker/K8s hostnames to avoid log spam
    const potentialEndpoints: string[] = [
      process.env.MEMORY_ENDPOINT || 'http://localhost:3001',
      'http://localhost:3001',
      'http://127.0.0.1:3001',
    ];

    // Only add container-specific hostnames when running in containers
    if (isContainerEnv) {
      potentialEndpoints.push('http://memory:3001');
      potentialEndpoints.push('http://conscious-bot-memory:3001');
    }

    const discovered: string[] = [];

    // Use single-attempt checks for discovery (no retries)
    // Full retry logic is used when actually communicating with the discovered endpoint
    for (const endpoint of potentialEndpoints) {
      const response = await resilientFetch(
        `${endpoint.replace(/\/$/, '')}/health`,
        {
          method: 'GET',
          timeoutMs: 2000,
          maxRetries: 0, // Single attempt for discovery - reduces log spam
          label: `memory-discovery/${endpoint}`,
        }
      );

      if (response?.ok) {
        discovered.push(endpoint);
        // Found a working endpoint, stop checking others
        break;
      }
    }

    if (discovered.length > 0) {
      this.discoveredEndpoints = discovered;
      const chosen = discovered[0];
      if (
        !this.config.memorySystemEndpoint ||
        !discovered.includes(this.config.memorySystemEndpoint)
      ) {
        this.config.memorySystemEndpoint = chosen;
        if (process.env.NODE_ENV === 'development') {
          console.log(`[Planning] Memory discovery: using ${chosen}`);
        }
        this.emit('memorySystemDiscovered', this.config.memorySystemEndpoint);
      }
    } else if (process.env.NODE_ENV === 'development') {
      console.log(
        `[Planning] Memory discovery: no endpoint available (tried ${potentialEndpoints.length} URLs)`
      );
    }

    this.lastDiscovery = Date.now();
  }

  private recordMemFailure(): void {
    this.memFailureCount += 1;
    if (this.memFailureCount >= 3) {
      this.memCircuitOpenUntil = Date.now() + 30_000; // 30s cooldown
    }
  }

  private recordMemSuccess(): void {
    this.memFailureCount = 0;
    this.memCircuitOpenUntil = 0;
  }

  private async memFetch(
    path: string,
    init: RequestInit & { timeoutMs?: number } = {}
  ): Promise<Response> {
    if (this.isMemCircuitOpen()) {
      throw new Error('Memory endpoint circuit open');
    }

    // Get all available endpoints (discovered + configured)
    const endpoints = [
      ...this.discoveredEndpoints,
      this.config.memorySystemEndpoint,
    ];
    const uniqueEndpoints = [...new Set(endpoints)].filter(Boolean);

    if (uniqueEndpoints.length === 0) {
      throw new Error('No memory system endpoints available');
    }

    const retries = this.config.retryAttempts;
    const baseDelay = 300;
    let lastErr: any;

    // Try each endpoint in order
    for (const base of uniqueEndpoints) {
      const url = `${base.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;

      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(
            () => controller.abort(),
            init.timeoutMs ?? this.config.memorySystemTimeout
          );
          const res = await fetch(url, { ...init, signal: controller.signal });
          clearTimeout(timeout);

          if (res.ok) {
            this.recordMemSuccess();
            return res;
          }

          // If server error and we have retries, try again
          if (res.status >= 500 && res.status < 600 && attempt < retries) {
            const delay =
              baseDelay * Math.pow(2, attempt) + Math.random() * 100;
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }

          // If client error or no more retries, try next endpoint
          break;
        } catch (err) {
          lastErr = err;
          if (attempt < retries) {
            const delay =
              baseDelay * Math.pow(2, attempt) + Math.random() * 100;
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          // Try next endpoint
          break;
        }
      }
    }

    this.recordMemFailure();
    throw lastErr || new Error('All memory system endpoints failed');
  }

  /**
   * Add a new memory event
   */
  addEvent(
    type: string,
    title: string,
    description: string,
    source: string,
    data: Record<string, any> = {},
    priority: number = 0.5
  ): MemoryEvent {
    const event: MemoryEvent = {
      id: `event-${Date.now()}-${++this.eventCounter}`,
      timestamp: Date.now(),
      type,
      title,
      description,
      source,
      data,
      priority,
    };

    this.events.unshift(event); // Add to beginning for newest first

    // Keep only the most recent events
    if (this.events.length > this.config.maxEvents) {
      this.events = this.events.slice(0, this.config.maxEvents);
    }

    this.emit('eventAdded', event);

    if (this.config.enableRealTimeUpdates) {
      this.notifyDashboard('eventAdded', event);
    }

    return event;
  }

  /**
   * Add a reflective note
   */
  addReflectiveNote(
    type: ReflectiveNote['type'],
    title: string,
    content: string,
    insights: string[] = [],
    source: string = 'cognitive-system',
    confidence: number = 0.7
  ): ReflectiveNote {
    const note: ReflectiveNote = {
      id: `note-${Date.now()}-${++this.noteCounter}`,
      timestamp: Date.now(),
      type,
      title,
      content,
      insights,
      priority: confidence,
      source,
      confidence,
    };

    this.notes.unshift(note); // Add to beginning for newest first

    // Keep only the most recent notes
    if (this.notes.length > this.config.maxNotes) {
      this.notes = this.notes.slice(0, this.config.maxNotes);
    }

    this.emit('noteAdded', note);

    if (this.config.enableRealTimeUpdates) {
      this.notifyDashboard('noteAdded', note);
    }

    return note;
  }

  /**
   * Generate task-related events
   */
  generateTaskEvent(
    taskId: string,
    taskType: string,
    action: 'started' | 'completed' | 'failed' | 'updated',
    taskData: any
  ): MemoryEvent {
    const eventMap = {
      started: {
        title: `${taskType} Task Started`,
        description: `Began executing ${taskType} task`,
      },
      completed: {
        title: `${taskType} Task Completed`,
        description: `Successfully completed ${taskType} task`,
      },
      failed: {
        title: `${taskType} Task Failed`,
        description: `Failed to complete ${taskType} task`,
      },
      updated: {
        title: `${taskType} Task Updated`,
        description: `Updated progress on ${taskType} task`,
      },
    };

    const eventInfo = eventMap[action];

    return this.addEvent(
      `task_${action}`,
      eventInfo.title,
      eventInfo.description,
      'planning-system',
      {
        taskId,
        taskType,
        action,
        ...taskData,
      },
      action === 'completed' ? 0.9 : 0.7
    );
  }

  /**
   * Return completed/failed task events for a given day offset (0=today,1=yesterday)
   */
  getTaskLogByDay(daysBack: number = 0): MemoryEvent[] {
    const now = new Date();
    const d = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - daysBack,
      0,
      0,
      0,
      0
    ).getTime();
    const next = d + 24 * 60 * 60 * 1000;
    return this.events.filter(
      (e) =>
        (e.type === 'task_completed' || e.type === 'task_failed') &&
        e.timestamp >= d &&
        e.timestamp < next
    );
  }

  /**
   * Generate a daily summary note of completed actions
   */
  generateDailySummary(daysBack: number = 0): ReflectiveNote {
    const list = this.getTaskLogByDay(daysBack);
    const completed = list.filter((e) => e.type === 'task_completed');
    const failed = list.filter((e) => e.type === 'task_failed');
    const title =
      daysBack === 0 ? "Today's Action Summary" : "Yesterday's Action Summary";
    const lines = [
      `Completed: ${completed.length}`,
      `Failed: ${failed.length}`,
      '',
      ...completed
        .slice(0, 20)
        .map((e) => `✔ ${e.data?.taskType || 'task'}: ${e.data?.taskId}`),
    ];
    return this.addReflectiveNote(
      'reflection',
      title,
      lines.join('\n'),
      [],
      'planning-system',
      0.7
    );
  }

  /**
   * Generate environment-related events
   */
  generateEnvironmentEvent(
    eventType: string,
    description: string,
    environmentData: any
  ): MemoryEvent {
    return this.addEvent(
      'environment_change',
      eventType,
      description,
      'world-system',
      environmentData,
      0.6
    );
  }

  /**
   * Generate cognitive insights
   */
  generateCognitiveInsight(
    insight: string,
    context: string,
    confidence: number = 0.8
  ): ReflectiveNote {
    const insights = [insight];

    return this.addReflectiveNote(
      'insight',
      'Cognitive Insight',
      `${insight}\n\nContext: ${context}`,
      insights,
      'cognitive-system',
      confidence
    );
  }

  /**
   * Generate learning notes from task completion
   */
  generateLearningNote(
    taskType: string,
    outcome: 'success' | 'failure',
    lessons: string[]
  ): ReflectiveNote {
    const title = `${taskType} Task Learning`;
    const content = `Task ${outcome === 'success' ? 'completed successfully' : 'failed'}. Key lessons: ${lessons.join(', ')}`;

    return this.addReflectiveNote(
      'learning',
      title,
      content,
      lessons,
      'planning-system',
      0.8
    );
  }

  /**
   * Generate strategy notes
   */
  generateStrategyNote(
    strategy: string,
    reasoning: string,
    expectedOutcome: string
  ): ReflectiveNote {
    const title = 'Strategic Decision';
    const content = `Strategy: ${strategy}\n\nReasoning: ${reasoning}\n\nExpected Outcome: ${expectedOutcome}`;

    return this.addReflectiveNote(
      'strategy',
      title,
      content,
      [strategy, reasoning],
      'cognitive-system',
      0.9
    );
  }

  /**
   * Get all events with optional filtering
   */
  getEvents(filters?: {
    type?: string;
    source?: string;
    limit?: number;
  }): MemoryEvent[] {
    let events = [...this.events];

    if (filters?.type) {
      events = events.filter((event) => event.type === filters.type);
    }

    if (filters?.source) {
      events = events.filter((event) => event.source === filters.source);
    }

    if (filters?.limit) {
      events = events.slice(0, filters.limit);
    }

    return events;
  }

  /**
   * Get all notes with optional filtering
   */
  getNotes(filters?: {
    type?: ReflectiveNote['type'];
    source?: string;
    limit?: number;
  }): ReflectiveNote[] {
    let notes = [...this.notes];

    if (filters?.type) {
      notes = notes.filter((note) => note.type === filters.type);
    }

    if (filters?.source) {
      notes = notes.filter((note) => note.source === filters.source);
    }

    if (filters?.limit) {
      notes = notes.slice(0, filters.limit);
    }

    return notes;
  }

  /**
   * Get events from memory system
   */
  async getMemorySystemEvents(): Promise<MemoryEvent[]> {
    try {
      if (this.isMemCircuitOpen()) return [];
      const response = await this.memFetch('/telemetry', {
        method: 'GET',
        timeoutMs: 5_000,
      });
      if (!response.ok) {
        return [];
      }

      const data = (await response.json()) as any;
      const memoryEvents: MemoryEvent[] = [];

      if (data.events && Array.isArray(data.events)) {
        for (const event of data.events) {
          memoryEvents.push({
            id: event.id || `memory-${Date.now()}`,
            timestamp: event.timestamp || Date.now(),
            type: event.type,
            title: event.type
              .replace(/_/g, ' ')
              .replace(/\b\w/g, (l: string) => l.toUpperCase()),
            description: event.data?.description || event.type,
            source: 'memory-system',
            data: event.data || {},
            priority: 0.6,
          });
        }
      }

      return memoryEvents;
    } catch (error) {
      console.error('Failed to fetch memory system events:', error);
      return [];
    }
  }

  /**
   * Get memories from memory system
   */
  async getMemorySystemMemories(): Promise<ReflectiveNote[]> {
    try {
      if (this.isMemCircuitOpen()) return [];
      const response = await this.memFetch('/state', {
        method: 'GET',
        timeoutMs: 5_000,
      });
      if (!response.ok) {
        return [];
      }

      const data = (await response.json()) as any;
      const memories: ReflectiveNote[] = [];

      // Convert episodic memories
      if (data.episodic?.recentMemories) {
        for (const memory of data.episodic.recentMemories) {
          memories.push({
            id: memory.id || `memory-${Date.now()}`,
            timestamp: memory.timestamp || Date.now(),
            type: 'reflection',
            title: memory.description || 'Memory',
            content: memory.description || 'No description available',
            insights: [memory.description || 'Memory recorded'],
            priority: memory.salience || 0.5,
            source: 'memory-system',
            confidence: memory.salience || 0.5,
          });
        }
      }

      // Convert semantic memories
      if (data.semantic?.totalEntities > 0) {
        memories.push({
          id: `semantic-summary-${Date.now()}`,
          timestamp: Date.now(),
          type: 'insight',
          title: 'Knowledge Base',
          content: `Contains ${data.semantic.totalEntities} entities and ${data.semantic.totalRelationships} relationships`,
          insights: ['Knowledge base updated'],
          priority: 0.7,
          source: 'memory-system',
          confidence: 0.8,
        });
      }

      return memories;
    } catch (error) {
      console.error('Failed to fetch memory system memories:', error);
      return [];
    }
  }

  /**
   * Get memory context for planning decisions
   */
  async getMemoryContext(
    context: {
      query?: string;
      taskType?: string;
      entities?: string[];
      location?: any;
      recentEvents?: any[];
      maxMemories?: number;
    } = {}
  ): Promise<{
    memories: ReflectiveNote[];
    insights: string[];
    recommendations: string[];
    confidence: number;
  }> {
    try {
      if (this.isMemCircuitOpen()) {
        return {
          memories: [],
          insights: [],
          recommendations: [],
          confidence: 0.0,
        };
      }

      // Build search query from context
      const searchQuery =
        context.query ||
        (context.entities && context.entities.length > 0
          ? `Context about ${context.entities.join(', ')}`
          : 'Relevant memories for current context');

      // Try to use hybrid search if available
      const searchResponse = await this.memFetch('/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          limit: context.maxMemories || 10,
          types: context.taskType ? [context.taskType] : undefined,
          entities: context.entities,
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        }),
        timeoutMs: 3000,
      });

      if (!searchResponse.ok) {
        // Fallback to basic memory retrieval
        const memories = await this.getMemorySystemMemories();
        return {
          memories: memories.slice(0, context.maxMemories || 5),
          insights: [
            'Basic memory retrieval used due to search service unavailability',
          ],
          recommendations: ['Consider enabling hybrid search service'],
          confidence: 0.5,
        };
      }

      const searchData = (await searchResponse.json()) as any;
      const memories: ReflectiveNote[] = [];

      // Convert search results to reflective notes
      if (searchData.results && Array.isArray(searchData.results)) {
        for (const result of searchData.results) {
          memories.push({
            id: result.id || `search-${Date.now()}`,
            timestamp: result.metadata?.timestamp || Date.now(),
            type: 'reflection',
            title: result.content?.substring(0, 50) + '...' || 'Memory',
            content: result.content || 'No content available',
            insights: [result.content || 'Memory retrieved'],
            priority: result.score || 0.5,
            source: 'memory-search',
            confidence: result.score || 0.5,
          });
        }
      }

      // Extract insights from search results
      const insights = memories.map((m) => m.content).slice(0, 3);

      // Generate recommendations based on memory patterns
      const recommendations = this.generateMemoryBasedRecommendations(
        memories,
        context
      );

      return {
        memories,
        insights,
        recommendations,
        confidence: searchData.confidence || 0.8,
      };
    } catch (error) {
      console.error('Failed to get memory context:', error);
      return {
        memories: [],
        insights: ['Memory system unavailable for context enhancement'],
        recommendations: ['Consider retrying with memory system available'],
        confidence: 0.0,
      };
    }
  }

  /**
   * Generate recommendations based on memory patterns
   */
  private generateMemoryBasedRecommendations(
    memories: ReflectiveNote[],
    context: any
  ): string[] {
    const recommendations: string[] = [];

    // Analyze memory patterns for recommendations
    if (memories.length === 0) {
      recommendations.push(
        'No relevant memories found - consider exploring new approaches'
      );
      return recommendations;
    }

    const successfulMemories = memories.filter((m) => m.priority > 0.7);
    const failedMemories = memories.filter((m) => m.priority < 0.3);

    if (successfulMemories.length > failedMemories.length) {
      recommendations.push(
        'Historical data suggests high success rate for similar tasks'
      );
    } else if (failedMemories.length > 0) {
      recommendations.push(
        'Previous attempts at similar tasks have had mixed results - consider alternative approaches'
      );
    }

    if (context.taskType === 'crafting') {
      recommendations.push(
        'Consider checking available resources before starting crafting tasks'
      );
    }

    if (context.location?.biome === 'cave') {
      recommendations.push(
        'Cave environments may require additional lighting and safety precautions'
      );
    }

    return recommendations;
  }

  /**
   * Notify dashboard of updates
   */
  private async notifyDashboard(event: string, data: any): Promise<void> {
    const url = `${this.config.dashboardEndpoint.replace(/\/$/, '')}/api/memory-updates`;
    const res = await resilientFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, data }),
      timeoutMs: 5000,
      maxRetries: 3,
      label: 'dashboard/memory-updates',
    });
    if (!res?.ok) {
      console.warn('Failed to notify dashboard of memory update');
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<MemoryIntegrationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): MemoryIntegrationConfig {
    return { ...this.config };
  }

  /**
   * Clear all events and notes
   */
  clear(): void {
    this.events = [];
    this.notes = [];
    this.eventCounter = 0;
    this.noteCounter = 0;
  }
}
