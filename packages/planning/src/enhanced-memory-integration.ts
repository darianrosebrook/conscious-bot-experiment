/**
 * Enhanced Memory Integration System
 *
 * Provides real memory retrieval, event logging, and reflective note generation
 * to replace mock data with actual cognitive insights and memory data.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';

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
  dashboardEndpoint: string;
  memorySystemEndpoint: string;
  maxEvents: number;
  maxNotes: number;
}

const DEFAULT_CONFIG: MemoryIntegrationConfig = {
  enableRealTimeUpdates: true,
  enableReflectiveNotes: true,
  enableEventLogging: true,
  dashboardEndpoint: 'http://localhost:3000',
  memorySystemEndpoint: 'http://localhost:3001',
  maxEvents: 100,
  maxNotes: 50,
};

export class EnhancedMemoryIntegration extends EventEmitter {
  private config: MemoryIntegrationConfig;
  private events: MemoryEvent[] = [];
  private notes: ReflectiveNote[] = [];
  private eventCounter = 0;
  private noteCounter = 0;

  constructor(config: Partial<MemoryIntegrationConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
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
      events = events.filter(event => event.type === filters.type);
    }

    if (filters?.source) {
      events = events.filter(event => event.source === filters.source);
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
      notes = notes.filter(note => note.type === filters.type);
    }

    if (filters?.source) {
      notes = notes.filter(note => note.source === filters.source);
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
      const response = await fetch(`${this.config.memorySystemEndpoint}/telemetry`);
      if (!response.ok) {
        return [];
      }

      const data = await response.json() as any;
      const memoryEvents: MemoryEvent[] = [];

      if (data.events && Array.isArray(data.events)) {
        for (const event of data.events) {
          memoryEvents.push({
            id: event.id || `memory-${Date.now()}`,
            timestamp: event.timestamp || Date.now(),
            type: event.type,
            title: event.type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
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
      const response = await fetch(`${this.config.memorySystemEndpoint}/state`);
      if (!response.ok) {
        return [];
      }

      const data = await response.json() as any;
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
   * Notify dashboard of updates
   */
  private async notifyDashboard(event: string, data: any): Promise<void> {
    try {
      await fetch(`${this.config.dashboardEndpoint}/api/memory-updates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ event, data }),
      });
    } catch (error) {
      console.error('Failed to notify dashboard:', error);
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
