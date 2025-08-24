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
const connectionManager = new Map<
  string,
  {
    eventSource: EventSource;
    subscribers: Set<(data: unknown) => void>;
    onOpen: Set<() => void>;
    onClose: Set<() => void>;
    onError: Set<(error: Event) => void>;
    isConnecting: boolean;
  }
>();

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
  // reconnectInterval = 5000,
  // maxReconnectAttempts = 10,
}: UseSSEOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reconnectAttemptsRef = useRef(0);
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
    if (!isMountedRef.current) return;

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
        };

        connectionManager.set(url, connection);

        eventSource.onopen = () => {
          if (connection) {
            connection.isConnecting = false;
            setIsConnected(true);
            setError(null);
            reconnectAttemptsRef.current = 0;
            connection.onOpen.forEach((callback) => callback());
          }
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (connection) {
              connection.subscribers.forEach((callback) => callback(data));
            }
          } catch (err) {
            // Silently handle parsing errors
          }
        };

        eventSource.onerror = (event) => {
          if (connection) {
            connection.isConnecting = false;
            setIsConnected(false);
            setError('SSE connection error');
            connection.onError.forEach((callback) => callback(event));
          }
        };

        // Handle connection close
        eventSource.addEventListener('close', () => {
          if (connection) {
            connection.isConnecting = false;
            setIsConnected(false);
            connection.onClose.forEach((callback) => callback());
          }
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
  }, [url]);

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
        connection.eventSource.close();
        connectionManager.delete(url);
        console.log(
          `SSE connection closed. Total connections: ${connectionManager.size}`
        );
      }
    }
    setIsConnected(false);
  }, [url]);

  // Connect on mount
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
    connect,
    disconnect,
  };
}
