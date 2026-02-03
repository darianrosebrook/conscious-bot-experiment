/**
 * Memory Updates API
 * Provides Server-Sent Events for real-time memory updates.
 *
 * @author @darianrosebrook
 */

import { createSSEBroadcastRoute } from '@/lib/sse-broadcast';

export const { GET, POST } = createSSEBroadcastRoute({
  channelName: 'memory',
});
