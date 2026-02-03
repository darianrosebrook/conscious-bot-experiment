/**
 * API Hook
 * Provides API functionality for the dashboard
 * @author @darianrosebrook
 */

import { useCallback } from 'react';
import { useDashboardContext } from '@/contexts/dashboard-context';

// =============================================================================
// Types
// =============================================================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  status?: number;
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  signal?: AbortSignal;
}

// =============================================================================
// Hook
// =============================================================================

export function useApi() {
  const { config } = useDashboardContext();

  const request = useCallback(
    async <T = any>(
      url: string,
      options: ApiRequestOptions = {}
    ): Promise<ApiResponse<T>> => {
      const { method = 'GET', headers = {}, body, signal } = options;

      try {
        const requestOptions: RequestInit = {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          signal: signal || AbortSignal.timeout(config.api.timeout),
        };

        if (body && method !== 'GET') {
          requestOptions.body = JSON.stringify(body);
        }

        const response = await fetch(url, requestOptions);
        const data = await response.json();

        return {
          success: response.ok,
          data: data.data || data,
          message: data.message,
          error: data.error,
          status: response.status,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
    [config.api.timeout]
  );

  const get = useCallback(
    <T = any>(url: string, options?: Omit<ApiRequestOptions, 'method'>) =>
      request<T>(url, { ...options, method: 'GET' }),
    [request]
  );

  const post = useCallback(
    <T = any>(
      url: string,
      body?: any,
      options?: Omit<ApiRequestOptions, 'method' | 'body'>
    ) => request<T>(url, { ...options, method: 'POST', body }),
    [request]
  );

  const put = useCallback(
    <T = any>(
      url: string,
      body?: any,
      options?: Omit<ApiRequestOptions, 'method' | 'body'>
    ) => request<T>(url, { ...options, method: 'PUT', body }),
    [request]
  );

  const del = useCallback(
    <T = any>(url: string, options?: Omit<ApiRequestOptions, 'method'>) =>
      request<T>(url, { ...options, method: 'DELETE' }),
    [request]
  );

  const patch = useCallback(
    <T = any>(
      url: string,
      body?: any,
      options?: Omit<ApiRequestOptions, 'method' | 'body'>
    ) => request<T>(url, { ...options, method: 'PATCH', body }),
    [request]
  );

  return {
    request,
    get,
    post,
    put,
    delete: del,
    patch,
  };
}
