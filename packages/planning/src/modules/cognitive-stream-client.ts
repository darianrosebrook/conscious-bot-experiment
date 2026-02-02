/**
 * Cognitive Stream Client
 *
 * Fetches thoughts from the cognition service's cognitive stream API
 * for thought-to-task conversion. Decouples HTTP details from task integration.
 *
 * @author @darianrosebrook
 */

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
    /** Structured goal extracted by the sanitizer boundary */
    extractedGoal?: { version?: number; action: string; target: string; amount: number | null; raw?: string };
    /** Sanitization flags from the LLM output sanitizer */
    sanitizationFlags?: Record<string, any>;
    /** Extracted intent label from INTENT: line */
    extractedIntent?: string | null;
    /** How the INTENT was parsed: 'final_line', 'inline_noncompliant', or null */
    intentParse?: string | null;
    /** Source of the extracted goal ('llm' or 'drive-tick') */
    extractedGoalSource?: string;
    /** Canonical goal key for exact-match idempotency (action:target) */
    goalKey?: string;
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

/** Action words used to filter actionable thoughts */
const ACTIONABLE_WORDS = [
  'gather',
  'collect',
  'wood',
  'log',
  'craft',
  'build',
  'make',
  'create',
  'mine',
  'iron',
  'stone',
  'ore',
  'dig',
  'explore',
  'search',
  'scout',
  'farm',
  'plant',
  'harvest',
  'move',
  'go to',
  'walk',
  'place',
  'put',
  'set',
  'find',
  'look for',
  'get',
  'obtain',
  'acquire',
  'need to',
  'should',
  'going to',
  'plan to',
  'want to',
  'will',
  'can',
  'help',
  'assist',
  'work on',
  'start',
  'begin',
  'continue',
  'finish',
];

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

  async getActionableThoughts(): Promise<CognitiveStreamThought[]> {
    const recentThoughts = await this.getRecentThoughts();
    const now = Date.now();
    const fiveMinutesMs = 5 * 60 * 1000;

    return recentThoughts.filter((thought) => {
      if (thought.processed) return false;
      if (thought.metadata?.fallback === true) return false;

      const lower = thought.content.trim().toLowerCase();
      if (
        lower.startsWith('health:') ||
        lower.startsWith('hunger:') ||
        /observing\s+environment\s+and\s+deciding/.test(lower) ||
        /^\d+%\.?\s*(health|hunger|observing)/.test(lower)
      ) {
        return false;
      }

      if (now - thought.timestamp > fiveMinutesMs) return false;

      const content = thought.content.toLowerCase();
      return ACTIONABLE_WORDS.some((word) => content.includes(word));
    });
  }
}
