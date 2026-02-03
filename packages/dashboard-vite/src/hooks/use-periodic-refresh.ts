/**
 * Periodic Refresh Hook
 *
 * Handles slow-poll refresh of inventory, memories, events, notes,
 * thoughts, and bot state/health. Also subscribes to memory-updates SSE.
 * Extracted from page.tsx to reduce component complexity.
 *
 * @author @darianrosebrook
 */

import { useEffect, useCallback } from 'react';
import { useDashboardStore } from '@/stores/dashboard-store';
import { useDashboardContext } from '@/contexts/dashboard-context';
import { useSSE } from '@/hooks/use-sse';
import { debugLog } from '@/lib/utils';
import type { BotState, BotConnection } from '@/hooks/use-ws-bot-state';

interface UsePeriodicRefreshOptions {
  setBotState: React.Dispatch<React.SetStateAction<BotState | null>>;
  setBotConnections: React.Dispatch<React.SetStateAction<BotConnection[]>>;
  checkViewerStatus: () => Promise<void>;
}

const THOUGHTS_POLL_MS = 20_000;
const REFRESH_INTERVAL_MS = 60_000;

export function usePeriodicRefresh({
  setBotState,
  setBotConnections,
  checkViewerStatus,
}: UsePeriodicRefreshOptions) {
  const { config } = useDashboardContext();
  const {
    thoughts,
    setInventory,
    addThought,
    setEvents,
    addEvent,
    setMemories,
    setNotes,
    setHud,
  } = useDashboardStore();

  // Subscribe to memory-updates SSE so events/notes update via push
  const handleMemorySSE = useCallback(
    (data: unknown) => {
      const msg = data as { event?: string; data?: unknown };
      if (msg.event === 'eventAdded' && msg.data) {
        const ev = msg.data as {
          id?: string;
          timestamp?: string;
          type?: string;
          content?: string;
          payload?: Record<string, unknown>;
        };
        addEvent({
          id: ev.id ?? '',
          ts: ev.timestamp ?? new Date().toISOString(),
          kind: ev.type ?? 'unknown',
          payload: ev.payload ?? { content: ev.content },
        });
      }
      if (msg.event === 'noteAdded' && msg.data) {
        const n = msg.data as {
          id?: string;
          timestamp?: string;
          type?: string;
          title?: string;
          content?: string;
          source?: string;
          confidence?: number;
        };
        const store = useDashboardStore.getState();
        const existing = store.notes ?? [];
        if (n.id && !existing.some((note) => note.id === n.id)) {
          setNotes([
            ...existing,
            {
              id: n.id,
              ts: n.timestamp ?? new Date().toISOString(),
              type:
                (n.type as 'reflection' | 'episodic' | 'semantic') ??
                'reflection',
              title: n.title ?? '',
              content: n.content ?? '',
              source: n.source ?? 'unknown',
              confidence: n.confidence ?? 0,
            },
          ]);
        }
      }
    },
    [addEvent, setNotes],
  );

  useSSE({ url: '/api/memory-updates', onMessage: handleMemorySSE });

  // Poll thought history so thoughts update when SSE drops
  useEffect(() => {
    const mergeNewThoughts = async () => {
      try {
        const currentIds = new Set(
          useDashboardStore.getState().thoughts.map((t) => t.id),
        );
        const res = await fetch('/api/ws/cognitive-stream/history?limit=100', {
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.thoughts || !Array.isArray(data.thoughts)) return;
        for (const t of data.thoughts) {
          if (!t?.id || !t.content || currentIds.has(t.id)) continue;
          currentIds.add(t.id);
          const type = (
            t.type === 'self' ||
            t.type === 'reflection' ||
            t.type === 'intrusion' ||
            t.type === 'intrusive'
              ? t.type
              : 'reflection'
          ) as 'self' | 'reflection' | 'intrusion' | 'intrusive';
          const attribution =
            t.attribution === 'external'
              ? 'external'
              : t.attribution === 'intrusive'
                ? 'intrusive'
                : 'self';
          addThought({
            id: t.id,
            ts: new Date(t.timestamp).toISOString(),
            text: t.displayContent || t.content,
            content: t.content,
            type,
            attribution,
            thoughtType: t.metadata?.thoughtType || t.type,
            provenance: t.metadata?.provenance,
          });
        }
      } catch {
        // Non-fatal; next poll will retry
      }
    };
    const interval = setInterval(mergeNewThoughts, THOUGHTS_POLL_MS);
    return () => clearInterval(interval);
  }, [addThought]);

  // Periodic refresh of bot state, inventory, memories, events, notes
  useEffect(() => {
    const refreshBotState = async () => {
      const timeout = config.api.timeout;
      try {
        // Fetch inventory
        const inventoryRes = await fetch(config.routes.inventory(), {
          signal: AbortSignal.timeout(timeout),
        });
        if (inventoryRes.ok) {
          const inventoryData = await inventoryRes.json();
          if (inventoryData.success) {
            setInventory(inventoryData.inventory);
          }
        }

        // Fetch memories, events, and notes periodically
        const [memoriesRes, eventsRes, notesRes] = await Promise.allSettled([
          fetch(config.routes.memories(), { signal: AbortSignal.timeout(timeout) }),
          fetch(config.routes.events(), { signal: AbortSignal.timeout(timeout) }),
          fetch(config.routes.notes(), { signal: AbortSignal.timeout(timeout) }),
        ]);

        // Process memories
        if (memoriesRes.status === 'fulfilled' && memoriesRes.value.ok) {
          const memoriesData = await memoriesRes.value.json();
          if (memoriesData.memories && Array.isArray(memoriesData.memories)) {
            const existingThoughtIds = new Set(thoughts.map((t) => t.id));
            memoriesData.memories.forEach((memory: any) => {
              const isSystemMemory =
                memory.content?.includes('Memory system updated') ||
                memory.content?.includes('Bot state updated') ||
                memory.content?.includes('Status refreshed') ||
                memory.type === 'system' ||
                memory.type === 'telemetry';

              if (!existingThoughtIds.has(memory.id) && !isSystemMemory) {
                addThought({
                  id: memory.id,
                  ts: memory.timestamp,
                  text: memory.content,
                  type: 'reflection',
                });
              }
            });

            const mapped = memoriesData.memories.map((m: any) => ({
              id: m.id,
              ts: m.timestamp || new Date().toISOString(),
              type: m.type || 'episodic',
              text: m.content || '',
              tags: m.tags,
              score: m.score ?? m.salience,
            }));
            setMemories(mapped);
          }
        }

        // Process events
        if (eventsRes.status === 'fulfilled' && eventsRes.value.ok) {
          const eventsData = await eventsRes.value.json();
          if (eventsData.events && Array.isArray(eventsData.events)) {
            const existingThoughtIds = new Set(thoughts.map((t) => t.id));
            eventsData.events.forEach((event: any) => {
              const isSystemEvent =
                event.type === 'memory_state' ||
                event.type === 'bot_state' ||
                event.content?.includes('Memory system updated') ||
                event.content?.includes('Bot state updated') ||
                event.content?.includes('Status refreshed');

              if (!existingThoughtIds.has(event.id) && !isSystemEvent) {
                addThought({
                  id: event.id,
                  ts: event.timestamp,
                  text: event.content,
                  type: 'reflection',
                });
              }
            });

            const mapped = eventsData.events.map((e: any) => ({
              id: e.id,
              ts: e.timestamp || new Date().toISOString(),
              kind: e.type || e.kind || 'unknown',
              payload: { content: e.content, ...(e.payload || {}) },
            }));
            setEvents(mapped);
          }
        }

        // Process notes
        if (notesRes.status === 'fulfilled' && notesRes.value.ok) {
          const notesData = await notesRes.value.json();
          if (notesData.notes && Array.isArray(notesData.notes)) {
            const existingThoughtIds = new Set(thoughts.map((t) => t.id));
            notesData.notes.forEach((note: any) => {
              const isSystemNote =
                note.content?.includes('Memory system updated') ||
                note.content?.includes('Bot state updated') ||
                note.content?.includes('Status refreshed') ||
                note.type === 'system' ||
                note.type === 'telemetry';

              if (!existingThoughtIds.has(note.id) && !isSystemNote) {
                addThought({
                  id: note.id,
                  ts: note.timestamp,
                  text: note.content,
                  type: 'reflection',
                });
              }
            });

            const mapped = notesData.notes.map((n: any) => ({
              id: n.id,
              ts: n.timestamp || new Date().toISOString(),
              type: n.type || 'reflection',
              title: n.title || '',
              content: n.content || '',
              source: n.source || 'unknown',
              confidence: n.confidence ?? 0,
            }));
            setNotes(mapped);
          }
        }

        const [botRes, healthRes] = await Promise.allSettled([
          fetch(config.routes.botState(), {
            signal: AbortSignal.timeout(timeout),
          }),
          fetch(config.routes.botHealth(), {
            signal: AbortSignal.timeout(timeout),
          }),
        ]);

        if (botRes.status === 'fulfilled' && botRes.value.ok) {
          const botData = await botRes.value.json();
          const worldState = botData.data?.worldState || botData.data;

          setBotState({
            position: worldState.playerPosition
              ? {
                  x: worldState.playerPosition[0],
                  y: worldState.playerPosition[1],
                  z: worldState.playerPosition[2],
                }
              : undefined,
            health: worldState.health,
            food: worldState.hunger,
            inventory:
              worldState.inventory?.items?.map((item: any) => ({
                name: item.type,
                count: item.count,
                displayName: item.type,
              })) || [],
            time: worldState.timeOfDay,
            weather: worldState.weather,
          });
        }

        if (healthRes.status === 'fulfilled' && healthRes.value.ok) {
          const healthData = await healthRes.value.json();
          setBotConnections([
            {
              name: 'minecraft-bot',
              connected: healthData.status === 'connected',
              viewerActive: healthData.viewer?.active || false,
              viewerUrl: healthData.viewer?.url || 'http://localhost:3006',
            },
          ]);

          if (healthData.status === 'connected') {
            await checkViewerStatus();
          }
        } else {
          setBotConnections([
            {
              name: 'minecraft-bot',
              connected: false,
              viewerActive: false,
              viewerUrl: 'http://localhost:3006',
            },
          ]);
        }
      } catch (error) {
        debugLog('Periodic refresh error:', error);
        setBotConnections([
          {
            name: 'minecraft-bot',
            connected: false,
            viewerActive: false,
            viewerUrl: 'http://localhost:3006',
          },
        ]);
      }
    };

    const interval = setInterval(refreshBotState, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [
    config,
    setInventory,
    thoughts,
    addThought,
    setEvents,
    setMemories,
    setNotes,
    setBotState,
    setBotConnections,
    setHud,
    checkViewerStatus,
  ]);
}
