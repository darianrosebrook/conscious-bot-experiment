import { NextRequest } from 'next/server';

/**
 * WebSocket route handler for Chain of Thought updates
 * Streams real-time thoughts from the bot systems
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

    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      start(controller) {
        let lastThoughtId = '';
        
        const sendThoughts = async () => {
          try {
            // Fetch thoughts from bot systems
            const [planningRes, cognitionRes, memoryRes] = await Promise.allSettled([
              fetch('http://localhost:3002/state'),
              fetch('http://localhost:3003/state'),
              fetch('http://localhost:3001/state'),
            ]);

            const thoughts = [];

            // Get planning thoughts
            if (planningRes.status === 'fulfilled' && planningRes.value.ok) {
              const planningData = await planningRes.value.json();
              if (planningData.goalFormulation?.currentGoals?.length > 0) {
                thoughts.push({
                  id: `planning-${Date.now()}`,
                  ts: new Date().toISOString(),
                  text: `Evaluating ${planningData.goalFormulation.goalCount} active goals`,
                  type: 'reflection' as const,
                });
              }
              if (planningData.reactiveExecutor?.currentAction) {
                thoughts.push({
                  id: `action-${Date.now()}`,
                  ts: new Date().toISOString(),
                  text: `Executing: ${planningData.reactiveExecutor.currentAction}`,
                  type: 'self' as const,
                });
              }
            }

            // Get cognition thoughts
            if (cognitionRes.status === 'fulfilled' && cognitionRes.value.ok) {
              const cognitionData = await cognitionRes.value.json();
              if (cognitionData.cognitiveCore?.creativeSolver?.active) {
                thoughts.push({
                  id: `cognition-${Date.now()}`,
                  ts: new Date().toISOString(),
                  text: `Creative problem solving active - ${cognitionData.cognitiveCore.creativeSolver.solutionsGenerated} solutions generated`,
                  type: 'reflection' as const,
                });
              }
              if (cognitionData.cognitiveCore?.contextOptimizer?.active) {
                thoughts.push({
                  id: `context-${Date.now()}`,
                  ts: new Date().toISOString(),
                  text: 'Optimizing context and attention',
                  type: 'self' as const,
                });
              }
            }

            // Get memory thoughts
            if (memoryRes.status === 'fulfilled' && memoryRes.value.ok) {
              const memoryData = await memoryRes.value.json();
              if (memoryData.episodic?.totalMemories > 0) {
                thoughts.push({
                  id: `memory-${Date.now()}`,
                  ts: new Date().toISOString(),
                  text: `Processing ${memoryData.episodic.totalMemories} episodic memories`,
                  type: 'reflection' as const,
                });
              }
              if (memoryData.working?.currentContext) {
                thoughts.push({
                  id: `working-${Date.now()}`,
                  ts: new Date().toISOString(),
                  text: `Working memory active - attention level: ${memoryData.working.attentionLevel}`,
                  type: 'self' as const,
                });
              }
            }

            // Send new thoughts
            for (const thought of thoughts) {
              if (thought.id !== lastThoughtId) {
                const data = `data: ${JSON.stringify(thought)}\n\n`;
                controller.enqueue(encoder.encode(data));
                lastThoughtId = thought.id;
              }
            }

          } catch (error) {
            console.error('Error fetching thoughts:', error);
          }
        };

        // Send initial thoughts
        sendThoughts();

        // Send updates every 3 seconds
        const interval = setInterval(sendThoughts, 3000);

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
    console.error('WebSocket COT route error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
};
