import { useEffect, useRef, useState, useCallback } from 'react';

interface UseSSEOptions {
  url: string;
  onMessage?: (data: unknown) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

// Global connection manager to prevent multiple connections to the same URL
const connectionManager = new Map<string, {
  eventSource: EventSource;
  subscribers: Set<(data: unknown) => void>;
  onOpen: Set<() => void>;
  onClose: Set<() => void>;
  onError: Set<(error: Event) => void>;
}>();

/**
 * Server-Sent Events hook for real-time data communication
 * Uses a global connection manager to prevent multiple connections to the same URL
 * Fixed for Next.js 15 StrictMode and excessive reconnection issues
 *
 * @author @darianrosebrook
 */
export function useSSE({
  url,
  onMessage,
  onOpen,
  onClose,
  onError,
  reconnectInterval = 5000,
  maxReconnectAttempts = 10,
}: UseSSEOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isMountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!isMountedRef.current) return;

    // Check if we already have a connection for this URL
    let connection = connectionManager.get(url);

    if (!connection) {
      // Create new connection
      try {
        const eventSource = new EventSource(url);
        
        connection = {
          eventSource,
          subscribers: new Set(),
          onOpen: new Set(),
          onClose: new Set(),
          onError: new Set(),
        };

        eventSource.onopen = () => {
          setIsConnected(true);
          setError(null);
          reconnectAttemptsRef.current = 0;
          connection!.onOpen.forEach(callback => callback());
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            connection!.subscribers.forEach(callback => callback(data));
          } catch (err) {
            // Silently handle parsing errors
          }
        };

        eventSource.onerror = (event) => {
          setIsConnected(false);
          setError('SSE connection error');
          connection!.onError.forEach(callback => callback(event));

          // Attempt to reconnect if we haven't exceeded max attempts
          if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            reconnectAttemptsRef.current++;
            const backoffDelay = Math.min(
              reconnectInterval * Math.pow(2, reconnectAttemptsRef.current - 1),
              30000 // Cap at 30 seconds
            );

            setTimeout(() => {
              if (isMountedRef.current) {
                // Remove the failed connection
                connectionManager.delete(url);
                // Try to reconnect
                connect();
              }
            }, backoffDelay);
          }
        };

        connectionManager.set(url, connection);
      } catch (err) {
        setError('Failed to create SSE connection');
        return;
      }
    }

    // Subscribe to this connection
    if (onMessage) {
      connection.subscribers.add(onMessage);
    }
    if (onOpen) {
      connection.onOpen.add(onOpen);
    }
    if (onClose) {
      connection.onClose.add(onClose);
    }
    if (onError) {
      connection.onError.add(onError);
    }

    // Set connected state if the connection is already open
    if (connection.eventSource.readyState === EventSource.OPEN) {
      setIsConnected(true);
      setError(null);
    }
  }, [url, onMessage, onOpen, onClose, onError, reconnectInterval, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    const connection = connectionManager.get(url);
    if (connection) {
      // Unsubscribe from this connection
      if (onMessage) {
        connection.subscribers.delete(onMessage);
      }
      if (onOpen) {
        connection.onOpen.delete(onOpen);
      }
      if (onClose) {
        connection.onClose.delete(onClose);
      }
      if (onError) {
        connection.onError.delete(onError);
      }

      // If no more subscribers, close the connection
      if (connection.subscribers.size === 0) {
        connection.eventSource.close();
        connectionManager.delete(url);
      }
    }
    setIsConnected(false);
  }, [url, onMessage, onOpen, onClose, onError]);

  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttemptsRef.current = 0;
    setError(null);
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
    error,
    disconnect,
    connect,
    reconnect,
  };
}
