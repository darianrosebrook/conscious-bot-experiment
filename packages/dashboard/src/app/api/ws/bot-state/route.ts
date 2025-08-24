import { NextRequest } from 'next/server';

/**
 * Centralized Bot State Stream
 * 
 * Provides a single SSE stream for all bot state data including:
 * - Inventory updates
 * - HUD/vitals data
 * - Cognitive state
 * - Position and environment
 * - Real-time events
 * 
 * @author @darianrosebrook
 */
export const GET = async (req: NextRequest) => {
  try {
    // Check if the request is for SSE
    const accept = req.headers.get('accept');
    const isSSE = accept?.includes('text/event-stream');

    if (!isSSE) {
      return new Response('Expected SSE request', { status: 400 });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        let lastInventoryHash = '';
        let lastPositionHash = '';
        let lastVitalsHash = '';

        const sendBotState = async () => {
          try {
            // Fetch data from all bot systems
            const [minecraftRes, cognitionRes] = await Promise.allSettled([
              fetch('http://localhost:3005/state'),
              fetch('http://localhost:3003/state'),
            ]);

            const botState = {
              ts: new Date().toISOString(),
              type: 'bot_state_update',
              data: {
                // Connection status
                connected: false,
                
                // Inventory data
                inventory: {
                  hotbar: [],
                  main: [],
                  totalItems: 0,
                  lastUpdated: null,
                },
                
                // HUD/Vitals data
                vitals: {
                  health: 20,
                  hunger: 20,
                  stamina: 100,
                  sleep: 100,
                },
                
                // Cognitive state
                cognition: {
                  focus: 50,
                  stress: 25,
                  curiosity: 75,
                  mood: 'neutral',
                  activeConversations: 0,
                  solutionsGenerated: 0,
                },
                
                // Position and environment
                position: {
                  x: 0,
                  y: 0,
                  z: 0,
                  yaw: 0,
                  pitch: 0,
                },
                
                // Environment
                environment: {
                  time: 0,
                  weather: 'clear',
                  biome: 'unknown',
                },
                
                // Recent events
                events: [],
              },
            };

            // Process Minecraft bot data
            if (minecraftRes.status === 'fulfilled' && minecraftRes.value.ok) {
              const minecraftData = await minecraftRes.value.json();
              if (minecraftData.success && minecraftData.data) {
                const data = minecraftData.data;
                
                botState.data.connected = true;
                
                // Update inventory
                if (data.inventory) {
                  const hotbar = data.inventory.filter((item: any) => item.slot >= 0 && item.slot <= 8);
                  const main = data.inventory.filter((item: any) => item.slot >= 9);
                  
                  botState.data.inventory = {
                    hotbar,
                    main,
                    totalItems: data.inventory.length,
                    lastUpdated: new Date().toISOString(),
                  };
                }
                
                // Update position
                if (data.position) {
                  botState.data.position = {
                    x: data.position.x || 0,
                    y: data.position.y || 0,
                    z: data.position.z || 0,
                    yaw: data.yaw || 0,
                    pitch: data.pitch || 0,
                  };
                }
                
                // Update vitals
                if (data.health !== undefined) {
                  botState.data.vitals.health = data.health;
                }
                if (data.food !== undefined) {
                  botState.data.vitals.hunger = data.food;
                }
                
                // Update environment
                if (data.time !== undefined) {
                  botState.data.environment.time = data.time;
                }
                if (data.weather) {
                  botState.data.environment.weather = data.weather;
                }
              }
            }

            // Process cognition data
            if (cognitionRes.status === 'fulfilled' && cognitionRes.value.ok) {
              const cognitionData = await cognitionRes.value.json();
              if (cognitionData.cognitiveCore) {
                const convos = cognitionData.cognitiveCore.conversationManager?.activeConversations || 0;
                const solutions = cognitionData.cognitiveCore.creativeSolver?.solutionsGenerated || 0;
                
                botState.data.cognition = {
                  focus: Math.min(100, 50 + solutions * 10),
                  stress: Math.max(0, 25 - solutions * 2),
                  curiosity: Math.min(100, 30 + convos * 15),
                  mood: solutions > 5 ? 'accomplished' : convos > 2 ? 'engaged' : 'neutral',
                  activeConversations: convos,
                  solutionsGenerated: solutions,
                };
              }
            }

            // Check for significant changes to reduce noise
            const inventoryHash = JSON.stringify(botState.data.inventory);
            const positionHash = JSON.stringify(botState.data.position);
            const vitalsHash = JSON.stringify(botState.data.vitals);

            const hasChanges = 
              inventoryHash !== lastInventoryHash ||
              positionHash !== lastPositionHash ||
              vitalsHash !== lastVitalsHash;

            if (hasChanges) {
              // Update hashes
              lastInventoryHash = inventoryHash;
              lastPositionHash = positionHash;
              lastVitalsHash = vitalsHash;

              // Add change event
              botState.data.events.push({
                type: 'state_change',
                timestamp: new Date().toISOString(),
                changes: {
                  inventory: inventoryHash !== lastInventoryHash,
                  position: positionHash !== lastPositionHash,
                  vitals: vitalsHash !== lastVitalsHash,
                },
              });

              // Keep only last 10 events
              if (botState.data.events.length > 10) {
                botState.data.events = botState.data.events.slice(-10);
              }

              const data = `data: ${JSON.stringify(botState)}\n\n`;
              controller.enqueue(encoder.encode(data));
            }
          } catch (error) {
            console.error('Error in bot state stream:', error);
          }
        };

        // Send initial data
        sendBotState();

        // Send updates every 2 seconds (more frequent for real-time feel)
        const interval = setInterval(sendBotState, 2000);

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
