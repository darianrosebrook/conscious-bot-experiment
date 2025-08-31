/**
 * Viewer Management Hook
 *
 * Handles viewer status checking, starting/stopping viewer, and viewer state management.
 * Separates viewer-specific logic from the main dashboard component.
 * Optimized to prevent unnecessary rerenders and state updates.
 *
 * @author @darianrosebrook
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useDashboardContext } from '@/contexts/dashboard-context';
import { useApi } from '@/hooks/use-api';

// =============================================================================
// Types
// =============================================================================
interface ViewerStatus {
  canStart: boolean;
  viewerActive?: boolean;
  reason?: string;
  details?: unknown;
}

interface ViewerState {
  status: ViewerStatus | null;
  key: number;
  isLoading: boolean;
  error: string | null;
}

// =============================================================================
// Hook
// =============================================================================
export function useViewer() {
  const { config } = useDashboardContext();
  const api = useApi();

  const [state, setState] = useState<ViewerState>({
    status: null,
    key: 0,
    isLoading: false,
    error: null,
  });

  const isMounted = useRef(true);
  const lastStatusRef = useRef<ViewerStatus | null>(null);
  const statusCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (statusCheckTimeoutRef.current) {
        clearTimeout(statusCheckTimeoutRef.current);
      }
    };
  }, []);

  // Memoized status check to prevent unnecessary API calls
  const checkStatus = useCallback(async (): Promise<ViewerStatus | null> => {
    try {
      const result = await api.get(config.routes.viewerStatus());
      const newStatus = result.data || {
        canStart: false,
        reason: 'No data available',
      };

      // Only update state if status actually changed
      if (isMounted.current && JSON.stringify(newStatus) !== JSON.stringify(lastStatusRef.current)) {
        lastStatusRef.current = newStatus;
        setState((prev) => ({
          ...prev,
          status: newStatus,
          error: null,
        }));
      }

      return newStatus;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to check viewer status';

      if (isMounted.current) {
        setState((prev) => ({
          ...prev,
          status: {
            canStart: false,
            reason: errorMessage,
          },
          error: errorMessage,
        }));
      }

      return null;
    }
  }, [api, config.routes]);

  // Debounced status check to prevent rapid successive calls
  const debouncedCheckStatus = useCallback(() => {
    if (statusCheckTimeoutRef.current) {
      clearTimeout(statusCheckTimeoutRef.current);
    }
    
    statusCheckTimeoutRef.current = setTimeout(() => {
      checkStatus();
    }, 1000); // 1 second debounce
  }, [checkStatus]);

  // Start viewer
  const startViewer = useCallback(async (): Promise<boolean> => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // First check if we can start
      const status = await checkStatus();
      if (!status?.canStart) {
        throw new Error(status?.reason || 'Viewer cannot be started');
      }

      // Start the viewer
      const result = await api.post(config.routes.startViewer());

      if (result?.data?.success || result?.status === 200) {
        // Verify it started
        await checkStatus();

        if (isMounted.current) {
          setState((prev) => ({
            ...prev,
            key: prev.key + 1,
            isLoading: false,
          }));
        }

        return true;
      }

      throw new Error('Failed to start viewer');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to start viewer';

      if (isMounted.current) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
      }

      return false;
    }
  }, [api, config.routes, checkStatus]);

  // Stop viewer
  const stopViewer = useCallback(async (): Promise<boolean> => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const result = await api.post(config.routes.stopViewer());

      if (result?.data?.success || result?.status === 200) {
        await checkStatus();

        if (isMounted.current) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
          }));
        }

        return true;
      }

      throw new Error('Failed to stop viewer');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to stop viewer';

      if (isMounted.current) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
      }

      return false;
    }
  }, [api, config.routes, checkStatus]);

  // Refresh viewer (reload iframe)
  const refreshViewer = useCallback(() => {
    setState((prev) => ({
      ...prev,
      key: prev.key + 1,
    }));
  }, []);

  // Periodic status checking - reduced frequency to prevent spam
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;

    const loop = async () => {
      await checkStatus();
      timer = setTimeout(loop, 30000); // Changed from 10s to 30s
    };

    loop();

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [checkStatus]);

  return {
    // State
    status: state.status,
    isViewerActive: !!state.status?.viewerActive,
    canStart: !!state.status?.canStart,
    isLoading: state.isLoading,
    error: state.error,
    viewerKey: state.key,

    // Actions
    checkStatus,
    startViewer,
    stopViewer,
    refreshViewer,
  };
}
