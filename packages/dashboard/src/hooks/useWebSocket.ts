/**
 * WebSocket Hook for Real-time Bot State Updates
 *
 * Provides real-time connection to the Minecraft bot server for instant
 * state updates including health, inventory, position, and events.
 * Optimized to prevent constant reconnections and improve performance.
 *
 * @author @darianrosebrook
 */

import { useEffect, useRef, useState, useCallback } from 'react';

interface WebSocketMessage {
  type: string;
  timestamp: number;
  data: any;
}

interface UseWebSocketOptions {
  url: string;
  onMessage?: (_message: WebSocketMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (_error: Event) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  sendMessage: (_message: any) => void;
  reconnect: () => void;
}

export function useWebSocket({
  url,
  onMessage,
  onOpen,
  onClose,
  onError,
  reconnectInterval = 5000,
  maxReconnectAttempts = 5,
}: UseWebSocketOptions): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const shouldReconnectRef = useRef(true);
  const isMountedRef = useRef(true);
  const isConnectingRef = useRef(false);
  const lastConnectionTimeRef = useRef(0);
  const connectionStableRef = useRef(false);

  // Store callbacks in refs so that identity changes don't trigger reconnections.
  // The WebSocket is long-lived — we don't want to tear it down just because
  // a callback was recreated due to upstream state changes.
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const connect = useCallback(() => {
    if (!isMountedRef.current || wsRef.current?.readyState === WebSocket.OPEN) {
      // WebSocket: Skipping connection - already connected or unmounted
      return;
    }

    // Prevent multiple simultaneous connection attempts
    if (isConnectingRef.current) {
      // WebSocket: Skipping connection - already connecting
      return;
    }

    // Prevent rapid reconnection attempts (minimum 2 second gap)
    const now = Date.now();
    if (now - lastConnectionTimeRef.current < 2000) {
      // WebSocket: Skipping connection - too soon after last attempt
      return;
    }

    // WebSocket: Attempting connection to ${url}
    isConnectingRef.current = true;
    setIsConnecting(true);
    setError(null);
    lastConnectionTimeRef.current = now;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMountedRef.current) return;

        // WebSocket: Connection opened successfully
        setIsConnected(true);
        setIsConnecting(false);
        isConnectingRef.current = false;
        reconnectAttemptsRef.current = 0;
        setError(null);
        connectionStableRef.current = true;
        onOpenRef.current?.();
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;

        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          onMessageRef.current?.(message);
        } catch (parseError) {
          // Failed to parse WebSocket message: ${parseError}
        }
      };

      ws.onclose = (event) => {
        if (!isMountedRef.current) return;

        // WebSocket: Connection closed - code: ${event.code}, reason: ${event.reason}

        setIsConnected(false);
        setIsConnecting(false);
        isConnectingRef.current = false;
        onCloseRef.current?.();

        // Only attempt to reconnect if not manually closed and component is still mounted
        if (
          shouldReconnectRef.current &&
          isMountedRef.current &&
          reconnectAttemptsRef.current < maxReconnectAttempts &&
          !event.wasClean
        ) {
          reconnectAttemptsRef.current++;
          // WebSocket: Attempting reconnect ${reconnectAttemptsRef.current}/${maxReconnectAttempts}

          // Clear any existing timeout
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }

          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              connect();
            }
          }, reconnectInterval);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          // WebSocket: Max reconnection attempts reached
          setError('Max reconnection attempts reached');
        } else {
          // WebSocket: Not reconnecting - conditions not met
        }
      };

      ws.onerror = (event) => {
        if (!isMountedRef.current) return;

        // Don't set error immediately on connection error, let onclose handle it
        // WebSocket: Connection error occurred
        onErrorRef.current?.(event);
      };
    } catch (err) {
      if (!isMountedRef.current) return;

      // WebSocket: Failed to create connection
      setIsConnecting(false);
      isConnectingRef.current = false;
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to create WebSocket connection'
      );
    }
  // Only reconnect when the URL or reconnection settings change.
  // Callback changes are handled via refs above — they should NOT
  // cause the WebSocket to disconnect and reconnect.
  }, [url, reconnectInterval, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      // WebSocket is not connected, cannot send message
    }
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    shouldReconnectRef.current = true;
    reconnectAttemptsRef.current = 0;
    connect();
  }, [disconnect, connect]);

  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    isConnecting,
    error,
    sendMessage,
    reconnect,
  };
}
