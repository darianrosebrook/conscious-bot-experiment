import type { 
  IntrusiveThoughtRequest, 
  IntrusiveThoughtResponse,
  Environment,
  Screenshot 
} from '@/types';

/**
 * API service for dashboard communication with backend services
 */

/**
 * Submit an intrusive thought to the cognition system
 * @param request - The intrusive thought request
 * @returns Promise with the response
 */
export async function submitIntrusiveThought(
  request: IntrusiveThoughtRequest
): Promise<IntrusiveThoughtResponse> {
  const response = await fetch('/api/intrusive', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Failed to submit intrusive thought: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get current world snapshot from the world system
 * @returns Promise with environment data
 */
export async function getWorldSnapshot(): Promise<Environment> {
  const response = await fetch('/api/world');
  
  if (!response.ok) {
    throw new Error(`Failed to get world snapshot: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get screenshots from the minecraft bot
 * @param sessionId - Optional session ID to filter by
 * @param limit - Maximum number of screenshots to return
 * @returns Promise with screenshot data
 */
export async function getScreenshots(
  sessionId?: string,
  limit = 10
): Promise<Screenshot[]> {
  const params = new URLSearchParams();
  if (sessionId) params.append('sessionId', sessionId);
  params.append('limit', limit.toString());

  const response = await fetch(`/api/screenshots?${params}`);
  
  if (!response.ok) {
    throw new Error(`Failed to get screenshots: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get nearest screenshot for a given timestamp
 * @param sessionId - Session ID
 * @param timestamp - ISO timestamp
 * @returns Promise with screenshot data
 */
export async function getNearestScreenshot(
  sessionId: string,
  timestamp: string
): Promise<Screenshot | null> {
  const params = new URLSearchParams({
    sessionId,
    at: timestamp,
  });

  const response = await fetch(`/api/screenshots/nearest?${params}`);
  
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error(`Failed to get nearest screenshot: ${response.statusText}`);
  }

  return response.json();
}
