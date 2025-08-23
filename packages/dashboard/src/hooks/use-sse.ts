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

/**
 * Server-Sent Events hook for real-time data communication
 * Handles connection, reconnection, and message processing
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
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const isReconnectingRef = useRef(false);

  const connect = useCallback(() => {
    // Prevent multiple simultaneous connection attempts
    if (isReconnectingRef.current) {
      return;
    }

    try {
      // Clean up any existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      isReconnectingRef.current = true;
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
        isReconnectingRef.current = false;
        onOpen?.();
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessage?.(data);
        } catch (err) {
          // Silently handle parsing errors
        }
      };

      eventSource.onerror = (event) => {
        setIsConnected(false);
        isReconnectingRef.current = false;

        // Only set error if we haven't exceeded max attempts
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          setError(
            `SSE connection error (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`
          );
        } else {
          setError('SSE connection failed - max attempts reached');
        }

        onError?.(event);

        // Attempt to reconnect with exponential backoff
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          const backoffDelay = Math.min(
            reconnectInterval * Math.pow(2, reconnectAttemptsRef.current - 1),
            30000 // Cap at 30 seconds
          );

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, backoffDelay);
        }
      };

      // Handle connection close
      const handleClose = () => {
        setIsConnected(false);
        isReconnectingRef.current = false;
        onClose?.();
      };

      eventSource.addEventListener('close', handleClose);
    } catch (err) {
      setError('Failed to create SSE connection');
      isReconnectingRef.current = false;
    }
  }, [
    url,
    onMessage,
    onOpen,
    onClose,
    onError,
    reconnectInterval,
    maxReconnectAttempts,
  ]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    isReconnectingRef.current = false;
    setIsConnected(false);
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttemptsRef.current = 0;
    setError(null);
    connect();
  }, [disconnect, connect]);

  useEffect(() => {
    connect();
    return () => {
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
