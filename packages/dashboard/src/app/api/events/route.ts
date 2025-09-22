/**
 * Events API
 * Provides event data from various systems
 *
 * @author @darianrosebrook
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(_request: NextRequest) {
  try {
    const events = [];

    // Get service URLs from environment
    const memoryUrl = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';
    const planningUrl =
      process.env.PLANNING_SERVICE_URL || 'http://localhost:3002';
    const minecraftUrl =
      process.env.MINECRAFT_SERVICE_URL || 'http://localhost:3005';

    // Fetch events from memory system
    try {
      const memoryRes = await fetch(`${memoryUrl}/telemetry`);
      if (memoryRes.ok) {
        const memoryData = await memoryRes.json();
        if (memoryData.events) {
          for (const event of memoryData.events) {
            let content = event.data?.description || event.type;

            // Provide meaningful content for generic events
            if (event.type === 'memory_state') {
              content = `Memory system updated with ${event.data?.memoryCount || 0} memories`;
            } else if (event.type === 'episodic_memory') {
              content = `Stored new episodic memory: ${event.data?.description || 'Experience recorded'}`;
            } else if (event.type === 'semantic_memory') {
              content = `Updated semantic knowledge: ${event.data?.description || 'Knowledge graph updated'}`;
            } else if (event.type === 'working_memory') {
              content = `Working memory updated: ${event.data?.description || 'Current context refreshed'}`;
            }

            events.push({
              id: event.id,
              type: event.type,
              title: event.type
                .replace(/_/g, ' ')
                .replace(/\b\w/g, (l: string) => l.toUpperCase()),
              content: content,
              timestamp: event.timestamp,
              source: 'memory-system',
              severity: 'info',
            });
          }
        }
      }
    } catch (error) {
      console.log('Memory system events unavailable');
    }

    // Fetch events from planning system
    try {
      // Fetch from telemetry endpoint
      const planningRes = await fetch(`${planningUrl}/telemetry`);
      if (planningRes.ok) {
        const planningData = await planningRes.json();
        if (planningData.events) {
          for (const event of planningData.events) {
            let content = event.data?.description || event.type;

            // Provide meaningful content for generic events
            if (event.type === 'planning_state') {
              content = `Planning system updated with ${event.data?.taskCount || 0} active tasks`;
            } else if (event.type === 'goal_created') {
              content = `New goal created: ${event.data?.goalName || 'Objective set'}`;
            } else if (event.type === 'task_completed') {
              content = `Task completed: ${event.data?.taskDescription || 'Objective achieved'}`;
            } else if (event.type === 'plan_generated') {
              content = `New plan generated: ${event.data?.planDescription || 'Strategy formulated'}`;
            }

            events.push({
              id: event.id,
              type: event.type,
              title: event.type
                .replace(/_/g, ' ')
                .replace(/\b\w/g, (l: string) => l.toUpperCase()),
              content: content,
              timestamp: event.timestamp,
              source: 'planning-system',
              severity: 'info',
            });
          }
        }
      }

      // Fetch from events endpoint
      const eventsRes = await fetch(`${planningUrl}/events`);
      if (eventsRes.ok) {
        const eventsData = await eventsRes.json();
        if (eventsData.events) {
          for (const event of eventsData.events) {
            events.push({
              id: event.id,
              type: event.type,
              title: event.title,
              content: event.description,
              timestamp: event.timestamp,
              source: event.source,
              severity: 'info',
            });
          }
        }
      }
    } catch (error) {
      console.log('Planning system events unavailable');
    }

    // Fetch events from minecraft bot
    try {
      const minecraftRes = await fetch(`${minecraftUrl}/telemetry`);
      if (minecraftRes.ok) {
        const minecraftData = await minecraftRes.json();
        if (minecraftData.events) {
          for (const event of minecraftData.events) {
            let content = event.data?.description || event.type;

            // Provide meaningful content for generic events
            if (event.type === 'bot_state') {
              content = `Bot state updated: ${event.data?.health ? `Health: ${event.data.health}/20` : 'Status refreshed'}`;
            } else if (event.type === 'action_executed') {
              content = `Action executed: ${event.data?.actionType || 'Command completed'}`;
            } else if (event.type === 'position_changed') {
              content = `Moved to position (${event.data?.x || 0}, ${event.data?.y || 0}, ${event.data?.z || 0})`;
            } else if (event.type === 'inventory_updated') {
              content = `Inventory updated: ${event.data?.itemCount || 0} items`;
            } else if (event.type === 'block_interaction') {
              content = `Interacted with ${event.data?.blockType || 'block'}`;
            }

            events.push({
              id: event.id,
              type: event.type,
              title: event.type
                .replace(/_/g, ' ')
                .replace(/\b\w/g, (l: string) => l.toUpperCase()),
              content: content,
              timestamp: event.timestamp,
              source: 'minecraft-bot',
              severity: 'info',
            });
          }
        }
      }
    } catch (error) {
      console.log('Minecraft bot events unavailable');
    }

    // Return empty array if no events found - no demo data

    // Sort events by timestamp (newest first)
    events.sort((a, b) => b.timestamp - a.timestamp);

    return NextResponse.json({
      events: events.slice(0, 20), // Limit to 20 most recent events
      totalEvents: events.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json({
      events: [],
      totalEvents: 0,
      timestamp: new Date().toISOString(),
      error: 'Failed to fetch events',
    });
  }
}
