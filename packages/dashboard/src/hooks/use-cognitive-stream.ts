/**
 * Cognitive Stream Hook
 *
 * Manages Server-Sent Events (SSE) connection for cognitive thoughts and
 * provides utilities for sending intrusive thoughts. Separates cognitive
 * stream logic from the main dashboard component.
 *
 * @author @darianrosebrook
 */

import { useEffect, useCallback, useRef } from 'react';
import { debugLog } from '@/lib/utils';
import { useDashboardContext } from '@/contexts/dashboard-context';
import { useApi } from '@/hooks/use-api';
import { useDashboardStore } from '@/stores/dashboard-store';
import type { ThoughtType } from '@/types';

// =============================================================================
// Types
// =============================================================================
interface CognitiveThought {
  id: string;
  timestamp: number | string;
  content: string;
  /** Tag-stripped display text (payloadVersion >= 2). Falls back to content. */
  displayContent?: string;
  type: string;
  attribution?: string;
  metadata?: {
    thoughtType?: string;
    provenance?: 'chain-of-thought' | 'intrusion';
  };
}

interface CognitiveStreamMessage {
  type: string;
  data: {
    thoughts?: CognitiveThought[];
  };
}

interface IntrusiveThoughtRequest {
  text: string;
  tags?: string[];
  strength?: number;
}

// =============================================================================
// Utility Functions
// =============================================================================

/** Strip [GOAL:] routing tags — these are for the planner, not for display. */
const GOAL_TAG_RE = /\s*\[GOAL:[^\]]*\](?:\s*\d+\w*)?/gi;

/**
 * Unwrap wrapper sentences that embed the real content in quotes, and strip GOAL tags.
 * Examples:
 *   'Processing intrusive thought: "gather wood [GOAL: collect oak_log 8]"' → 'gather wood'
 *   'From thought "mine iron" — bucket Short, cap 240000ms.' → 'mine iron'
 *   'Social interaction: Chat from Player: "hello"' → 'hello'
 */
const WRAPPER_PATTERNS: { re: RegExp; group: number }[] = [
  { re: /^(?:Processing intrusive thought|Thought processing started):\s*"(.+)"\.?$/i, group: 1 },
  { re: /^From thought\s+"(.+?)"\s*[—–-]\s*.+$/i, group: 1 },
  { re: /^Social interaction:\s*Chat from\s+\S+:\s*"(.+)"$/i, group: 1 },
];

function cleanDisplayText(text: string): string {
  if (!text) return text;

  // Strip GOAL tags everywhere (including inside quoted substrings)
  let display = text.replace(GOAL_TAG_RE, '').trim();

  // Try to unwrap known wrapper patterns
  for (const { re, group } of WRAPPER_PATTERNS) {
    const m = display.match(re);
    if (m?.[group]) {
      display = m[group].trim();
      break;
    }
  }

  // Collapse whitespace
  display = display.replace(/\s+/g, ' ').trim();

  // Remove leading/trailing quotes wrapping the entire string
  if (display.length >= 2 && display.startsWith('"') && display.endsWith('"')) {
    display = display.slice(1, -1).trim();
  }

  return display || text;
}

function mapThoughtType(type: string): ThoughtType {
  switch (type) {
    case 'self':
    case 'reflection':
    case 'intrusion':
    case 'intrusive':
      return type as ThoughtType;
    case 'external_chat_in':
    case 'external_chat_out':
      // Keep chat messages as reflection but preserve the original type in thoughtType
      return 'reflection';
    default:
      return 'reflection';
  }
}

function mapAttribution(
  attribution?: string
): 'self' | 'external' | 'intrusive' {
  switch (attribution) {
    case 'self':
    case 'external':
    case 'intrusive':
      return attribution;
    default:
      return 'self';
  }
}

// =============================================================================
// Hook
// =============================================================================
export function useCognitiveStream() {
  const { config } = useDashboardContext();
  const api = useApi();
  const { addThought } = useDashboardStore();

  const eventSourceRef = useRef<EventSource | null>(null);
  const isMounted = useRef(true);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 10;
  const baseReconnectDelay = 2000; // 2 seconds

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      // Clear any pending reconnection attempts
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, []);

  // Calculate exponential backoff delay
  const getReconnectDelay = useCallback(() => {
    const delay =
      baseReconnectDelay * Math.pow(2, Math.min(reconnectAttempts.current, 5));
    return Math.min(delay, 30000); // Cap at 30 seconds
  }, []);

  // Initialize SSE connection with better error handling and reconnection.
  // Use absolute URL so the SSE connection targets the same origin as the page
  // (avoids GET/POST ending up on different hosts, e.g. localhost vs 127.0.0.1).
  useEffect(() => {
    const connectEventSource = () => {
      const path = '/api/ws/cognitive-stream';
      const url =
        typeof window !== 'undefined'
          ? `${window.location.origin}${path}`
          : config.routes.cognitiveStreamSSE();
      debugLog('Connecting to cognitive stream SSE:', url);

      try {
        const es = new EventSource(url);
        eventSourceRef.current = es;
        debugLog('EventSource created successfully');
      } catch (error) {
        debugLog('Failed to create EventSource:', error);
        return null;
      }

      const es = eventSourceRef.current;
      if (!es) return null;

      es.onopen = () => {
        debugLog(
          'Cognitive stream SSE connection opened, readyState:',
          es.readyState
        );
        debugLog('SSE URL:', es.url);
      };

      es.onmessage = (event) => {
        if (!isMounted.current) return;

        try {
          const payload: CognitiveStreamMessage = JSON.parse(event.data);

          if (
            (payload?.type === 'cognitive_thoughts' ||
              payload?.type === 'cognitive_stream_init') &&
            Array.isArray(payload.data?.thoughts)
          ) {
            let thoughts = payload.data.thoughts as CognitiveThought[];

            // For initial load, deduplicate the batch: collapse repeated identical
            // messages and keep only the most recent occurrence of each.
            if (payload.type === 'cognitive_stream_init') {
              const seen = new Map<string, CognitiveThought>();
              for (const t of thoughts) {
                const key = `${t.type}::${(t.content || '').trim()}`;
                seen.set(key, t); // later occurrence overwrites earlier
              }
              thoughts = [...seen.values()].sort(
                (a, b) =>
                  (typeof a.timestamp === 'number' ? a.timestamp : 0) -
                  (typeof b.timestamp === 'number' ? b.timestamp : 0)
              );
            }

            for (const thought of thoughts) {
              // Skip malformed or empty thoughts
              if (!thought?.id || !thought.content) continue;

              const parsed = new Date(thought.timestamp);
              const ts = isNaN(parsed.getTime())
                ? new Date().toISOString()
                : parsed.toISOString();
              addThought({
                id: thought.id,
                ts,
                text: cleanDisplayText(thought.displayContent || thought.content),
                type: mapThoughtType(thought.type),
                attribution: mapAttribution(thought.attribution),
                thoughtType: thought.metadata?.thoughtType || thought.type,
                provenance: thought.metadata?.provenance,
              });
            }
          }
        } catch (error) {
          debugLog('Failed to parse cognitive stream message:', error);
        }
      };

      es.onerror = (error) => {
        debugLog(
          'Cognitive stream SSE error event, readyState:',
          es.readyState
        );

        if (es.readyState === EventSource.CONNECTING) {
          debugLog('SSE connection is connecting...');
        } else if (es.readyState === EventSource.OPEN) {
          debugLog('SSE connection is open');
        } else if (es.readyState === EventSource.CLOSED) {
          debugLog('SSE connection is closed');
        }

        if (es.readyState !== EventSource.CLOSED) {
          debugLog('Cognitive stream SSE error:', error, {
            readyState: es.readyState,
            url: es.url,
          });
        }

        // Close the connection to trigger reconnection
        es.close();
        eventSourceRef.current = null;

        // Implement exponential backoff for reconnection
        reconnectAttempts.current++;

        if (reconnectAttempts.current <= maxReconnectAttempts) {
          const delay = getReconnectDelay();
          debugLog(
            `Attempting to reconnect to cognitive stream in ${delay}ms (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})...`
          );

          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMounted.current) {
              connectEventSource();
            }
          }, delay);
        } else {
          debugLog(
            'Max reconnection attempts reached. Giving up on cognitive stream connection.'
          );
        }
      };

      return es || null;
    };

    const es = connectEventSource();

    return () => {
      if (es && es.readyState !== EventSource.CLOSED) {
        es.close();
        eventSourceRef.current = null;
      }
      // Clear any pending reconnection attempts
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [config.routes, addThought, getReconnectDelay]);

  // Send intrusive thought with optimistic UI update
  const sendIntrusiveThought = useCallback(
    async (
      text: string,
      options: Partial<IntrusiveThoughtRequest> = {}
    ): Promise<boolean> => {
      const trimmedText = text.trim();
      if (!trimmedText) return false;

      // Clean display text (strip GOAL tags, unwrap wrappers)
      const displayText = cleanDisplayText(trimmedText);

      // Optimistic UI update - immediately add the thought to the UI
      const optimisticThought = {
        id: `optimistic-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ts: new Date().toISOString(),
        text: displayText,
        type: 'intrusive' as const,
        attribution: 'intrusive' as const,
        thoughtType: 'intrusive',
        optimistic: true, // Mark as optimistic for UI feedback
      };

      // Add the optimistic thought immediately
      addThought(optimisticThought);

      try {
        // Send to cognitive stream
        await api.post(config.routes.cognitiveStreamPOST(), {
          type: 'intrusive',
          content: trimmedText,
          attribution: 'intrusive',
          context: { emotionalState: 'curious', confidence: 0.8 },
          metadata: { messageType: 'intrusion', intent: 'external_suggestion' },
        });

        // Also send to intrusive API (fire-and-forget; thought already in stream)
        api
          .post(config.routes.intrusive(), {
            text: trimmedText,
            tags: ['external', 'intrusion'],
            strength: 0.8,
            ...options,
          })
          .catch((err) => {
            debugLog(
              '[Dashboard] Intrusive API (cognition/planning) failed:',
              err?.message ?? err
            );
          });

        return true;
      } catch (error) {
        console.error('Failed to send intrusive thought:', error);

        // On error, remove the optimistic thought and show error state
        // This would require additional state management to track optimistic updates
        // For now, we'll just log the error

        return false;
      }
    },
    [api, config.routes, addThought]
  );

  return {
    sendIntrusiveThought,
  };
}
