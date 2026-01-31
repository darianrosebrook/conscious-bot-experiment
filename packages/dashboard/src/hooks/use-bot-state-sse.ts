/**
 * Bot State SSE Hook
 *
 * Streams bot state (HUD, inventory, connection) from the dashboard API over SSE.
 * Use as a fallback when the WebSocket to the Minecraft interface (ws://localhost:3005)
 * is disconnected, so the UI still receives live updates every few seconds.
 *
 * @author @darianrosebrook
 */

import { useEffect, useRef, useCallback } from 'react';

export interface BotStateSSEMessage {
  type: string;
  timestamp: number;
  data: {
    connected?: boolean;
    inventory?: Array<{ name?: string; count?: number; displayName?: string }>;
    position?: [number, number, number] | null;
    vitals?: {
      health?: number;
      hunger?: number;
      food?: number;
      stamina?: number;
      sleep?: number;
    } | null;
    intero?: { stress?: number; focus?: number; curiosity?: number };
    mood?: string;
    environment?: unknown;
    cognition?: unknown;
  };
}

export interface UseBotStateSSEOptions {
  enabled: boolean;
  onMessage: (message: BotStateSSEMessage) => void;
  onError?: (err: Event) => void;
}

/**
 * Opens an SSE connection to /api/ws/bot-state when enabled and pushes
 * bot_state_update messages to onMessage. Uses the same origin as the page.
 */
export function useBotStateSSE({
  enabled,
  onMessage,
  onError,
}: UseBotStateSSEOptions): void {
  const esRef = useRef<EventSource | null>(null);
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);
  onMessageRef.current = onMessage;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!enabled) {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      return;
    }

    const path = '/api/ws/bot-state';
    const url =
      typeof window !== 'undefined'
        ? `${window.location.origin}${path}`
        : '';

    if (!url) return;

    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data) as BotStateSSEMessage;
        if (msg?.type === 'bot_state_update' && msg.data) {
          onMessageRef.current(msg);
        }
      } catch {
        // Ignore parse errors
      }
    };

    es.onerror = (e) => {
      onErrorRef.current?.(e);
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [enabled]);
}
