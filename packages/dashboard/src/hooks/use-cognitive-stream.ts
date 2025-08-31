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
import { useDashboardContext } from '@/contexts/dashboard-context';
import { useApi } from '@/hooks/use-api';
import { useDashboardStore } from '@/stores/dashboard-store';
import type { ThoughtType } from '@/types';

// =============================================================================
// Types
// =============================================================================
interface CognitiveThought {
  id: string;
  timestamp: string;
  content: string;
  type: string;
  attribution?: string;
  metadata?: {
    thoughtType?: string;
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
function mapThoughtType(type: string): ThoughtType {
  switch (type) {
    case 'self':
    case 'reflection':
    case 'intrusion':
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

  // Initialize SSE connection with better error handling and reconnection
  useEffect(() => {
    const connectEventSource = () => {
      const url = config.routes.cognitiveStreamSSE();
      console.log('Connecting to cognitive stream SSE:', url);

      try {
        const es = new EventSource(url);
        eventSourceRef.current = es;
        console.log('EventSource created successfully');
      } catch (error) {
        console.error('Failed to create EventSource:', error);
        return null;
      }

      const es = eventSourceRef.current;
      if (!es) return null;

      es.onopen = () => {
        console.log(
          'Cognitive stream SSE connection opened, readyState:',
          es.readyState
        );
        console.log('SSE URL:', es.url);
      };

      es.onmessage = (event) => {
        if (!isMounted.current) return;

        try {
          const payload: CognitiveStreamMessage = JSON.parse(event.data);

          if (
            payload?.type === 'cognitive_thoughts' &&
            Array.isArray(payload.data?.thoughts)
          ) {
            const thoughts = payload.data.thoughts as CognitiveThought[];

            for (const thought of thoughts) {
              addThought({
                id: thought.id,
                ts: new Date(thought.timestamp).toISOString(),
                text: thought.content,
                type: mapThoughtType(thought.type),
                attribution: mapAttribution(thought.attribution),
                thoughtType: thought.metadata?.thoughtType || thought.type,
              });
            }
          }
        } catch (error) {
          console.error('Failed to parse cognitive stream message:', error);
        }
      };

      es.onerror = (error) => {
        console.log(
          'Cognitive stream SSE error event, readyState:',
          es.readyState
        );

        // Log more details about the error
        if (es.readyState === EventSource.CONNECTING) {
          console.log('SSE connection is connecting...');
        } else if (es.readyState === EventSource.OPEN) {
          console.log('SSE connection is open');
        } else if (es.readyState === EventSource.CLOSED) {
          console.log('SSE connection is closed');
        }

        // Only log the error if it's not a connection close
        if (es.readyState !== EventSource.CLOSED) {
          console.error('Cognitive stream SSE error:', error);
          console.error('Error details:', {
            readyState: es.readyState,
            url: es.url,
            withCredentials: es.withCredentials,
          });
        }

        // Close the connection to trigger reconnection
        es.close();
        eventSourceRef.current = null;

        // Attempt to reconnect after a delay
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMounted.current) {
            console.log('Attempting to reconnect to cognitive stream...');
            connectEventSource();
          }
        }, 5000);
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
  }, [config.routes, addThought]);

  // Send intrusive thought
  const sendIntrusiveThought = useCallback(
    async (
      text: string,
      options: Partial<IntrusiveThoughtRequest> = {}
    ): Promise<boolean> => {
      const trimmedText = text.trim();
      if (!trimmedText) return false;

      try {
        // Send to cognitive stream
        await api.post(config.routes.cognitiveStreamPOST(), {
          type: 'intrusive',
          content: trimmedText,
          attribution: 'intrusive',
          context: { emotionalState: 'curious', confidence: 0.8 },
          metadata: { messageType: 'intrusion', intent: 'external_suggestion' },
        });

        // Also send to intrusive API (fire-and-forget)
        api
          .post(config.routes.intrusive(), {
            text: trimmedText,
            tags: ['external', 'intrusion'],
            strength: 0.8,
            ...options,
          })
          .catch(() => {
            // Non-fatal error
          });

        return true;
      } catch (error) {
        console.error('Failed to send intrusive thought:', error);
        return false;
      }
    },
    [api, config.routes]
  );

  return {
    sendIntrusiveThought,
  };
}
