/**
 * Valuation Updates API
 * Receives valuation decision events from the planning system
 * and broadcasts them to connected dashboard clients via SSE.
 *
 * Single-node dev dashboard transport. Not durable across instances.
 *
 * @author @darianrosebrook
 */

import { createSSEBroadcastRoute } from '@/lib/sse-broadcast';

export const { GET, POST } = createSSEBroadcastRoute({
  channelName: 'valuation',
  ringBufferSize: 200,
});
