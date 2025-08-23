import { NextRequest } from 'next/server';

/**
 * WebSocket route handler for HUD updates
 * Streams real-time HUD data from the bot systems
 * 
 * @author @darianrosebrook
 */
export const GET = async (req: NextRequest) => {
  try {
    // Check if the request is a WebSocket upgrade
    const upgrade = req.headers.get('upgrade');
    if (upgrade !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 400 });
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

            let hudData = {
              ts: new Date().toISOString(),
              vitals: { health: 100, hunger: 100, stamina: 100, sleep: 100 },
              intero: { stress: 0, focus: 100, curiosity: 50 },
              mood: "neutral",
            };

            // Get Minecraft bot data
            if (minecraftRes.status === 'fulfilled' && minecraftRes.value.ok) {
              const minecraftData = await minecraftRes.value.json();
              if (minecraftData.data) {
                hudData.vitals.health = minecraftData.data.health || 100;
                hudData.vitals.hunger = minecraftData.data.food || 100;
                hudData.vitals.stamina = 100; // Not tracked in current bot
                hudData.vitals.sleep = 100; // Not tracked in current bot
              }
            }

            // Get cognition data
            if (cognitionRes.status === 'fulfilled' && cognitionRes.value.ok) {
              const cognitionData = await cognitionRes.value.json();
              if (cognitionData.cognitiveCore) {
                const convos = cognitionData.cognitiveCore.conversationManager?.activeConversations || 0;
                const solutions = cognitionData.cognitiveCore.creativeSolver?.solutionsGenerated || 0;
                
                hudData.intero.focus = Math.min(100, 50 + (solutions * 10));
                hudData.intero.curiosity = Math.min(100, 30 + (convos * 15));
                hudData.intero.stress = Math.max(0, 20 - (solutions * 2));
                
                // Determine mood based on cognitive state
                if (solutions > 5) hudData.mood = "accomplished";
                else if (convos > 2) hudData.mood = "engaged";
                else if (hudData.vitals.health < 50) hudData.mood = "concerned";
                else hudData.mood = "cautiously curious";
              }
            }

            const data = `data: ${JSON.stringify(hudData)}\n\n`;
            controller.enqueue(encoder.encode(data));
          } catch (error) {
            console.error('Error fetching HUD data:', error);
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
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('WebSocket HUD route error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
};
