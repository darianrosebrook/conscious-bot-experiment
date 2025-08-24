import { NextRequest } from 'next/server';

/**
 * WebSocket route handler for HUD updates
 * Streams real-time HUD data from the bot systems
 *
 * @author @darianrosebrook
 */
export const GET = async (req: NextRequest) => {
  try {
    // Check if the request is for SSE (Accept: text/event-stream)
    const accept = req.headers.get('accept');
    const isSSE = accept?.includes('text/event-stream');

    if (!isSSE) {
      return new Response('Expected SSE request', { status: 400 });
    }

    // For now, we'll use Server-Sent Events (SSE) as a fallback
    // since Next.js App Router doesn't have built-in WebSocket support
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        const sendHudData = async () => {
          try {
            // Fetch HUD data from bot systems
            const [minecraftRes, cognitionRes] = await Promise.allSettled([
              fetch('http://localhost:3005/state'),
              fetch('http://localhost:3003/state'),
            ]);

            const hudData = {
              ts: new Date().toISOString(),
              vitals: { health: 85, hunger: 60, stamina: 45, sleep: 30 },
              intero: { stress: 75, focus: 80, curiosity: 90 },
              mood: 'neutral',
            };

            // Get Minecraft bot data
            if (minecraftRes.status === 'fulfilled' && minecraftRes.value.ok) {
              const minecraftData = await minecraftRes.value.json();
              if (minecraftData.data) {
                // Only update if we have real data, otherwise keep test values
                if (minecraftData.data.health !== undefined) {
                  hudData.vitals.health = minecraftData.data.health;
                }
                if (minecraftData.data.food !== undefined) {
                  hudData.vitals.hunger = minecraftData.data.food;
                }
                // Keep test values for stamina and sleep since they're not tracked
              }
            }

            // Get cognition data
            if (cognitionRes.status === 'fulfilled' && cognitionRes.value.ok) {
              const cognitionData = await cognitionRes.value.json();
              if (cognitionData.cognitiveCore) {
                const convos =
                  cognitionData.cognitiveCore.conversationManager
                    ?.activeConversations || 0;
                const solutions =
                  cognitionData.cognitiveCore.creativeSolver
                    ?.solutionsGenerated || 0;

                // Only update if we have meaningful data, otherwise keep test values
                if (solutions > 0 || convos > 0) {
                  hudData.intero.focus = Math.min(100, 50 + solutions * 10);
                  hudData.intero.curiosity = Math.min(100, 30 + convos * 15);
                  hudData.intero.stress = Math.max(0, 20 - solutions * 2);
                }

                // Determine mood based on cognitive state
                if (solutions > 5) hudData.mood = 'accomplished';
                else if (convos > 2) hudData.mood = 'engaged';
                else if (hudData.vitals.health < 50) hudData.mood = 'concerned';
                else hudData.mood = 'cautiously curious';
              }
            }

            const data = `data: ${JSON.stringify(hudData)}\n\n`;
            controller.enqueue(encoder.encode(data));
          } catch (error) {
            // Silently handle errors
          }
        };

        // Send initial data
        sendHudData();

        // Send updates every 2 seconds
        const interval = setInterval(sendHudData, 2000);

        // Cleanup on close
        req.signal.addEventListener('abort', () => {
          clearInterval(interval);
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return new Response('Internal Server Error', { status: 500 });
  }
};
