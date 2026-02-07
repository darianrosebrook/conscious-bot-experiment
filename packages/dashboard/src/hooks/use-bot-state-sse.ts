/**
 * Bot State SSE Hook
 *
 * Thin wrapper around useSSE that filters for `bot_state_update` messages.
 * Streams bot state (HUD, inventory, connection) from the dashboard API over SSE.
 * Use as a fallback when the WebSocket to the Minecraft interface (ws://localhost:3005)
 * is disconnected, so the UI still receives live updates every few seconds.
 *
 * @author @darianrosebrook
 */

import { useCallback, useRef } from 'react';
import { useSSE } from '@/hooks/use-sse';

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
  onMessage: (_message: BotStateSSEMessage) => void;
  onError?: (_err: Event) => void;
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
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const handleMessage = useCallback((data: unknown) => {
    const msg = data as BotStateSSEMessage;
    if (msg?.type === 'bot_state_update' && msg.data) {
      onMessageRef.current(msg);
    }
  }, []);

  const url =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/ws/bot-state`
      : '';

  useSSE({
    url: url || '/api/ws/bot-state',
    onMessage: handleMessage,
    onError,
    enabled: enabled && !!url,
  });
}
