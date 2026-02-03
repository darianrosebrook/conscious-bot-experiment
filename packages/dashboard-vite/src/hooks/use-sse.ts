import { useEffect, useRef, useState, useCallback } from 'react';

export interface UseSSEOptions {
  url: string;
  onMessage?: (data: unknown) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  /** Base reconnect interval in ms (default 2000). Grows exponentially. */
  reconnectInterval?: number;
  /** Max reconnect attempts before giving up (default 10). */
  maxReconnectAttempts?: number;
  /** When false, the connection is closed and no reconnects are attempted. */
  enabled?: boolean;
}

// Global connection manager to prevent multiple connections to the same URL
const connectionManager = new Map<
  string,
  {
    eventSource: EventSource;
    subscribers: Set<(data: unknown) => void>;
    onOpen: Set<() => void>;
    onClose: Set<() => void>;
    onError: Set<(error: Event) => void>;
    isConnecting: boolean;
    reconnectTimer: ReturnType<typeof setTimeout> | null;
    reconnectAttempts: number;
  }
>();

/**
 * Server-Sent Events hook for real-time data communication.
 *
 * Uses a global connection manager to prevent multiple connections to the same URL.
 * Supports exponential-backoff reconnection and an `enabled` toggle.
 * Fixed for Next.js 15 StrictMode and excessive reconnection issues.
 *
 * @author @darianrosebrook
 */
export function useSSE({
  url,
  onMessage,
  onOpen,
  onClose,
  onError,
  reconnectInterval = 2000,
  maxReconnectAttempts = 10,
  enabled = true,
}: UseSSEOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  // Use refs to store callbacks to prevent unnecessary reconnections
  const onMessageRef = useRef(onMessage);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  const onErrorRef = useRef(onError);

  // Update refs when callbacks change
  useEffect(() => {
    onMessageRef.current = onMessage;
    onOpenRef.current = onOpen;
    onCloseRef.current = onClose;
    onErrorRef.current = onError;
  }, [onMessage, onOpen, onClose, onError]);

  const connect = useCallback(() => {
    if (!isMountedRef.current || !enabled) return;

    let connection = connectionManager.get(url);

    // If no connection exists, create one
    if (!connection) {
      try {
        const eventSource = new EventSource(url);

        connection = {
          eventSource,
          subscribers: new Set(),
          onOpen: new Set(),
          onClose: new Set(),
          onError: new Set(),
          isConnecting: true,
          reconnectTimer: null,
          reconnectAttempts: 0,
        };

        connectionManager.set(url, connection);

        const scheduleReconnect = () => {
          const conn = connectionManager.get(url);
          if (!conn || conn.reconnectAttempts >= maxReconnectAttempts) return;

          const delay = Math.min(
            reconnectInterval * Math.pow(2, Math.min(conn.reconnectAttempts, 5)),
            30000,
          );
          conn.reconnectAttempts++;
          conn.reconnectTimer = setTimeout(() => {
            const current = connectionManager.get(url);
            // Only reconnect if there are still subscribers
            if (
              current &&
              (current.subscribers.size > 0 || current.onOpen.size > 0)
            ) {
              // Remove old entry so connect() creates a fresh EventSource
              current.eventSource.close();
              connectionManager.delete(url);
              // Re-trigger connect for all remaining subscribers
              setIsConnected(false);
            }
          }, delay);
        };

        eventSource.onopen = () => {
          const conn = connectionManager.get(url);
          if (conn) {
            conn.isConnecting = false;
            conn.reconnectAttempts = 0;
            if (conn.reconnectTimer) {
              clearTimeout(conn.reconnectTimer);
              conn.reconnectTimer = null;
            }
            conn.onOpen.forEach((cb) => cb());
          }
          setIsConnected(true);
          setError(null);
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const conn = connectionManager.get(url);
            if (conn) {
              conn.subscribers.forEach((cb) => cb(data));
            }
          } catch {
            // Silently handle parsing errors
          }
        };

        eventSource.onerror = (event) => {
          const conn = connectionManager.get(url);
          if (conn) {
            conn.isConnecting = false;
            conn.onError.forEach((cb) => cb(event));
            scheduleReconnect();
          }
          setIsConnected(false);
          setError('SSE connection error');
        };

        eventSource.addEventListener('close', () => {
          const conn = connectionManager.get(url);
          if (conn) {
            conn.isConnecting = false;
            conn.onClose.forEach((cb) => cb());
          }
          setIsConnected(false);
        });
      } catch (err) {
        console.error('Failed to create EventSource:', err);
        setError('Failed to create connection');
        return;
      }
    }

    // Add this component's callbacks to the connection
    if (connection) {
      if (onMessageRef.current) {
        connection.subscribers.add(onMessageRef.current);
      }
      if (onOpenRef.current) {
        connection.onOpen.add(onOpenRef.current);
      }
      if (onCloseRef.current) {
        connection.onClose.add(onCloseRef.current);
      }
      if (onErrorRef.current) {
        connection.onError.add(onErrorRef.current);
      }

      // Update connection state
      setIsConnected(!connection.isConnecting);
      setError(null);
    }
  }, [url, enabled, reconnectInterval, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    const connection = connectionManager.get(url);
    if (connection) {
      // Remove this component's callbacks
      if (onMessageRef.current) {
        connection.subscribers.delete(onMessageRef.current);
      }
      if (onOpenRef.current) {
        connection.onOpen.delete(onOpenRef.current);
      }
      if (onCloseRef.current) {
        connection.onClose.delete(onCloseRef.current);
      }
      if (onErrorRef.current) {
        connection.onError.delete(onErrorRef.current);
      }

      // If no more subscribers, close the connection
      if (
        connection.subscribers.size === 0 &&
        connection.onOpen.size === 0 &&
        connection.onClose.size === 0 &&
        connection.onError.size === 0
      ) {
        if (connection.reconnectTimer) {
          clearTimeout(connection.reconnectTimer);
        }
        connection.eventSource.close();
        connectionManager.delete(url);
      }
    }
    setIsConnected(false);
  }, [url]);

  // Connect on mount / enabled change, disconnect on unmount / disabled
  useEffect(() => {
    isMountedRef.current = true;

    if (enabled) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      isMountedRef.current = false;
      disconnect();
    };
  }, [connect, disconnect, enabled]);

  return {
    isConnected,
    error,
    connect,
    disconnect,
  };
}
