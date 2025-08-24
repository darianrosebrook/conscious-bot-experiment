import { NextRequest } from 'next/server';

/**
 * WebSocket route handler for Chain of Thought updates
 * Streams real-time thoughts from the bot systems
 * 
 * TEMPORARILY DISABLED - Use /api/ws/bot-state instead for centralized streaming
 *
 * @author @darianrosebrook
 */
export const GET = async (req: NextRequest) => {
  // Temporarily disabled to reduce noise - use /api/ws/bot-state instead
  return new Response('COT stream disabled - use /api/ws/bot-state for centralized streaming', { 
    status: 410, // Gone
    headers: {
      'Content-Type': 'text/plain',
    }
  });
};
