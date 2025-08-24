import { NextRequest } from 'next/server';
import { parseCurrentAction } from '@/lib/message-parser';

/**
 * WebSocket route handler for Chain of Thought updates
 * Streams real-time thoughts from the bot systems
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

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        let lastThoughtId = '';
        let processedChatMessages = new Set<string>();

        const sendThoughts = async () => {
          try {
            // Fetch thoughts from bot systems
            const [planningRes, cognitionRes, memoryRes, minecraftRes] =
              await Promise.allSettled([
                fetch('http://localhost:3002/state'),
                fetch('http://localhost:3003/state'),
                fetch('http://localhost:3001/state'),
                fetch('http://localhost:3005/chat'),
              ]);

            const thoughts = [];

            // Get planning thoughts
            if (planningRes.status === 'fulfilled' && planningRes.value.ok) {
              const planningData = await planningRes.value.json();
              if (planningData.goalFormulation?.currentGoals?.length > 0) {
                thoughts.push({
                  id: `planning-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  ts: new Date().toISOString(),
                  text: `Evaluating ${planningData.goalFormulation.goalCount} active goals`,
                  type: 'reflection' as const,
                });
              }
              if (planningData.reactiveExecutor?.currentAction) {
                const actionDescription = parseCurrentAction(
                  planningData.reactiveExecutor.currentAction
                );
                thoughts.push({
                  id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  ts: new Date().toISOString(),
                  text: `Executing: ${actionDescription}`,
                  type: 'self' as const,
                });
              }
            }

            // Get cognition thoughts
            if (cognitionRes.status === 'fulfilled' && cognitionRes.value.ok) {
              const cognitionData = await cognitionRes.value.json();
              if (cognitionData.cognitiveCore?.creativeSolver?.active) {
                thoughts.push({
                  id: `cognition-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  ts: new Date().toISOString(),
                  text: `Creative problem solving active - ${cognitionData.cognitiveCore.creativeSolver.solutionsGenerated} solutions generated`,
                  type: 'reflection' as const,
                });
              }
              if (cognitionData.cognitiveCore?.contextOptimizer?.active) {
                thoughts.push({
                  id: `context-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
                  id: `memory-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  ts: new Date().toISOString(),
                  text: `Processing ${memoryData.episodic.totalMemories} episodic memories`,
                  type: 'reflection' as const,
                });
              }
              if (memoryData.working?.currentContext) {
                thoughts.push({
                  id: `working-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  ts: new Date().toISOString(),
                  text: `Working memory active - attention level: ${memoryData.working.attentionLevel}`,
                  type: 'self' as const,
                });
              }
            }

            // Get minecraft chat messages
            if (minecraftRes.status === 'fulfilled' && minecraftRes.value.ok) {
              const minecraftData = await minecraftRes.value.json();
              if (minecraftData.data && Array.isArray(minecraftData.data)) {
                // Get the most recent chat messages
                const recentMessages = minecraftData.data.slice(-5); // Last 5 messages
                for (const chatMsg of recentMessages) {
                  const messageKey = `${chatMsg.sender}-${chatMsg.message}-${chatMsg.timestamp}`;

                  // Only process new messages
                  if (!processedChatMessages.has(messageKey)) {
                    processedChatMessages.add(messageKey);

                    thoughts.push({
                      id: `chat-${chatMsg.timestamp}-${Math.random().toString(36).substr(2, 9)}`,
                      ts: new Date(chatMsg.timestamp).toISOString(),
                      text: `${chatMsg.sender}: ${chatMsg.message}`,
                      type:
                        chatMsg.sender === 'ConsciousBot'
                          ? 'self'
                          : ('intrusion' as const),
                    });
                  }
                }

                // Keep only last 50 processed messages to prevent memory leaks
                if (processedChatMessages.size > 50) {
                  const messageKeys = Array.from(processedChatMessages);
                  processedChatMessages = new Set(messageKeys.slice(-50));
                }
              }
            }

            // Get planning system cognitive feedback
            if (planningRes.status === 'fulfilled' && planningRes.value.ok) {
              const planningData = await planningRes.value.json();

              // Check for recent task completions with cognitive feedback
              const currentTasks =
                planningData.goalFormulation?.currentTasks || [];
              const completedTasks =
                planningData.goalFormulation?.completedTasks || [];

              // Look for tasks with cognitive feedback
              const tasksWithFeedback = [...currentTasks, ...completedTasks]
                .filter((task: any) => task.cognitiveFeedback)
                .sort(
                  (a: any, b: any) =>
                    (b.cognitiveFeedback?.timestamp || 0) -
                    (a.cognitiveFeedback?.timestamp || 0)
                )
                .slice(0, 3); // Get the 3 most recent

              for (const task of tasksWithFeedback) {
                const feedback = task.cognitiveFeedback;
                const feedbackKey = `feedback-${feedback.timestamp}`;

                if (!processedChatMessages.has(feedbackKey)) {
                  processedChatMessages.add(feedbackKey);

                  thoughts.push({
                    id: `feedback-${feedback.timestamp}-${Math.random().toString(36).substr(2, 9)}`,
                    ts: new Date(feedback.timestamp).toISOString(),
                    text: `🧠 ${feedback.reasoning}`,
                    type: 'reflection' as const,
                  });

                  // Add alternative suggestions if available
                  if (
                    feedback.alternativeSuggestions &&
                    feedback.alternativeSuggestions.length > 0
                  ) {
                    thoughts.push({
                      id: `suggestions-${feedback.timestamp}-${Math.random().toString(36).substr(2, 9)}`,
                      ts: new Date(feedback.timestamp).toISOString(),
                      text: `💡 Alternatives: ${feedback.alternativeSuggestions.slice(0, 2).join(', ')}`,
                      type: 'reflection' as const,
                    });
                  }
                }
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
            
            // Log thoughts update (reduced frequency)
            if (thoughts.length > 0) {
              console.log(`🧠 Thoughts update sent at ${new Date().toISOString()} (${thoughts.length} thoughts)`);
            }
          } catch (error) {
            // Silently handle errors
          }
        };

        // Send initial thoughts
        sendThoughts();

        // Send updates every 15 seconds (reduced from 3 seconds to reduce API spam)
        const interval = setInterval(sendThoughts, 15000);

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
