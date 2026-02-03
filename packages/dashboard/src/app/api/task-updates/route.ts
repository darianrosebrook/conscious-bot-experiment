/**
 * Task Updates API
 * Receives real-time task updates from the planning system
 * and broadcasts them to connected dashboard clients via SSE.
 *
 * @author @darianrosebrook
 */

import { createSSEBroadcastRoute } from '@/lib/sse-broadcast';

export const { GET, POST } = createSSEBroadcastRoute({
  channelName: 'task',
});
