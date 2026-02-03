/**
 * Cognitive Stream Logger
 *
 * Centralized logging system that sends cognition system logs to the cognitive stream
 * for dashboard visibility and emergent behavior observation.
 *
 * @author @darianrosebrook
 */

import { resilientFetch } from '@conscious-bot/core';

export class CognitiveStreamLogger {
  private static instance: CognitiveStreamLogger;
  private cognitiveStreamUrl: string;

  private constructor() {
    this.cognitiveStreamUrl = process.env.DASHBOARD_ENDPOINT
      ? `${process.env.DASHBOARD_ENDPOINT}/api/ws/cognitive-stream`
      : 'http://localhost:3000/api/ws/cognitive-stream';
  }

  public static getInstance(): CognitiveStreamLogger {
    if (!CognitiveStreamLogger.instance) {
      CognitiveStreamLogger.instance = new CognitiveStreamLogger();
    }
    return CognitiveStreamLogger.instance;
  }

  /**
   * Send a log entry to the cognitive stream
   */
  async logToCognitiveStream(
    type: string,
    content: string,
    context: {
      emotionalState?: string;
      confidence?: number;
      cognitiveSystem?: string;
      category?: string;
      tags?: string[];
    } = {}
  ): Promise<void> {
    try {
      const response = await resilientFetch(this.cognitiveStreamUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        label: 'dashboard/cognitive-stream',
        body: JSON.stringify({
          type: type || 'system_log',
          content: content,
          attribution: 'self',
          context: {
            emotionalState: context.emotionalState || 'neutral',
            confidence: context.confidence || 0.5,
            cognitiveSystem: context.cognitiveSystem || 'cognition-system',
            ...context,
          },
          metadata: {
            thoughtType: type || 'system_log',
            category: context.category || 'system',
            tags: context.tags || ['system', 'log'],
            source: 'cognition-system',
            timestamp: Date.now(),
          },
        }),
      });

      if (!response?.ok) {
        console.warn(
          '❌ Failed to send log to cognitive stream:',
          response?.status ?? 'unavailable'
        );
      }
    } catch (error: unknown) {
      console.warn('❌ Error sending log to cognitive stream:', error);
    }
  }

  /**
   * Log a cognition system event
   */
  async logEvent(
    eventType: string,
    content: string,
    context: any = {}
  ): Promise<void> {
    await this.logToCognitiveStream('system_event', content, {
      emotionalState: 'neutral',
      confidence: 0.7,
      cognitiveSystem: 'cognition-system',
      category: 'system',
      tags: ['event', eventType],
      ...context,
    });
  }

  /**
   * Log a thought processing event
   */
  async logThoughtProcessing(
    thought: string,
    status: 'started' | 'completed' | 'error',
    context: any = {}
  ): Promise<void> {
    const content = `Thought processing ${status}: "${thought}"`;
    await this.logToCognitiveStream('thought_processing', content, {
      emotionalState: status === 'error' ? 'concerned' : 'focused',
      confidence: status === 'error' ? 0.3 : 0.6,
      cognitiveSystem: 'intrusive-processor',
      category: 'processing',
      tags: ['thought', 'processing', status],
      ...context,
    });
  }

  /**
   * Log a task creation event
   */
  async logTaskCreation(
    taskTitle: string,
    source: string,
    context: any = {}
  ): Promise<void> {
    const content = `Task created: "${taskTitle}" (from ${source})`;
    await this.logToCognitiveStream('task_creation', content, {
      emotionalState: 'focused',
      confidence: 0.8,
      cognitiveSystem: 'planning-integration',
      category: 'task',
      tags: ['task', 'created', source],
      ...context,
    });
  }

  /**
   * Log a social consideration
   */
  async logSocialConsideration(
    entity: string,
    reasoning: string,
    context: any = {}
  ): Promise<void> {
    const content = `Social consideration: ${entity} - ${reasoning}`;
    await this.logToCognitiveStream('social_consideration', content, {
      emotionalState: 'thoughtful',
      confidence: 0.7,
      cognitiveSystem: 'social-awareness',
      category: 'social',
      tags: ['social', 'consideration', entity],
      ...context,
    });
  }

  /**
   * Log a system status update
   */
  async logStatus(
    status: string,
    details: string,
    context: any = {}
  ): Promise<void> {
    const content = `System status: ${status} - ${details}`;
    await this.logToCognitiveStream('system_status', content, {
      emotionalState: 'neutral',
      confidence: 0.5,
      cognitiveSystem: 'cognition-system',
      category: 'status',
      tags: ['status', status.toLowerCase()],
      ...context,
    });
  }

  /**
   * Log a performance metric
   */
  async logMetric(
    metric: string,
    value: number | string,
    context: any = {}
  ): Promise<void> {
    const content = `Metric: ${metric} = ${value}`;
    await this.logToCognitiveStream('system_metric', content, {
      emotionalState: 'neutral',
      confidence: 0.5,
      cognitiveSystem: 'cognition-system',
      category: 'metric',
      tags: ['metric', metric.toLowerCase()],
      ...context,
    });
  }
}
