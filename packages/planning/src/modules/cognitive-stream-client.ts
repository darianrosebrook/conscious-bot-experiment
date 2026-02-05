/**
 * Cognitive Stream Client
 *
 * Fetches thoughts from the cognition service's cognitive stream API
 * for thought-to-task conversion. Decouples HTTP details from task integration.
 *
 * @author @darianrosebrook
 */

import type { ReductionProvenance } from '@conscious-bot/cognition';

/** Shape of thoughts returned by /api/cognitive-stream/recent */
export interface CognitiveStreamThought {
  type: string;
  content: string;
  attribution: string;
  context: {
    emotionalState: string;
    confidence: number;
    cognitiveSystem?: string;
  };
  metadata: {
    thoughtType: string;
    trigger?: string;
    context?: string;
    intensity?: number;
    llmConfidence?: number;
    model?: string;
    /** Observation fallback; do not convert to tasks */
    fallback?: boolean;
    /** Sterling reduction provenance (opaque semantic artifacts) */
    reduction?: ReductionProvenance;
    /** Sanitization flags from envelope construction (non-semantic) */
    sanitizationFlags?: Record<string, any>;
  };
  id: string;
  timestamp: number;
  processed: boolean;
  /** Only thoughts with convertEligible=true should be considered for task conversion */
  convertEligible?: boolean;
}

export interface CognitiveStreamClientConfig {
  baseUrl?: string;
  timeoutMs?: number;
}

const DEFAULT_BASE_URL =
  process.env.COGNITION_ENDPOINT || 'http://localhost:3003';
const DEFAULT_TIMEOUT_MS = 5000;

export class CognitiveStreamClient {
  private baseUrl: string;
  private timeoutMs: number;

  constructor(config: CognitiveStreamClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async getRecentThoughts(): Promise<CognitiveStreamThought[]> {
    try {
      const url = `${this.baseUrl}/api/cognitive-stream/recent`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          thoughts?: CognitiveStreamThought[];
        };
        const thoughts = data.thoughts ?? [];
        if (thoughts.length > 0) {
          console.log(
            `[CognitiveStream] Fetched ${thoughts.length} thoughts`,
            thoughts.map((t) => `"${t.content}"`)
          );
        }
        return thoughts;
      }
      console.warn(
        '[CognitiveStream] Failed to fetch recent thoughts:',
        response.statusText
      );
      return [];
    } catch (error) {
      console.warn('[CognitiveStream] Error fetching thoughts:', error);
      return [];
    }
  }

  /**
   * Get actionable thoughts from the dedicated /actionable endpoint.
   * This returns ONLY thoughts with convertEligible === true (opt-in model).
   *
   * Falls back to local filtering of /recent if the endpoint fails.
   */
  async getActionableThoughts(): Promise<CognitiveStreamThought[]> {
    try {
      // Use dedicated actionable endpoint to prevent starvation
      const url = `${this.baseUrl}/api/cognitive-stream/actionable?limit=10`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          thoughts?: CognitiveStreamThought[];
        };
        const thoughts = data.thoughts ?? [];
        if (thoughts.length > 0) {
          console.log(
            `[CognitiveStream] Fetched ${thoughts.length} actionable thoughts`,
            thoughts.map((t) => `"${t.content?.slice(0, 40)}..."`)
          );
        }
        return thoughts;
      }

      // Fallback: endpoint may not exist yet, use legacy filtering
      console.warn(
        '[CognitiveStream] /actionable endpoint failed, falling back to /recent filtering:',
        response.statusText
      );
    } catch (error) {
      console.warn('[CognitiveStream] Error fetching actionable thoughts, falling back:', error);
    }

    // Legacy fallback: filter /recent locally
    return this.getActionableThoughtsLegacy();
  }

  /**
   * Legacy fallback for getActionableThoughts.
   * Used when /actionable endpoint is unavailable.
   */
  private async getActionableThoughtsLegacy(): Promise<CognitiveStreamThought[]> {
    const recentThoughts = await this.getRecentThoughts();
    const now = Date.now();
    const fiveMinutesMs = 5 * 60 * 1000;

    return recentThoughts.filter((thought) => {
      if (thought.processed) return false;
      if (thought.metadata?.fallback === true) return false;
      if (thought.convertEligible !== true) return false;
      if (now - thought.timestamp > fiveMinutesMs) return false;
      return true;
    });
  }

  /**
   * Acknowledge thoughts as processed by planning.
   * Planning MUST call this for EVERY evaluated thought (converted OR skipped).
   */
  async ackThoughts(thoughtIds: string[]): Promise<void> {
    if (thoughtIds.length === 0) return;

    try {
      const url = `${this.baseUrl}/api/cognitive-stream/ack`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thoughtIds }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (response.ok) {
        const data = (await response.json()) as { ackedCount?: number };
        console.log(`[CognitiveStream] Acked ${data.ackedCount ?? 0}/${thoughtIds.length} thoughts`);
      } else {
        console.warn('[CognitiveStream] Failed to ack thoughts:', response.statusText);
      }
    } catch (error) {
      console.warn('[CognitiveStream] Error acking thoughts:', error);
    }
  }
}
