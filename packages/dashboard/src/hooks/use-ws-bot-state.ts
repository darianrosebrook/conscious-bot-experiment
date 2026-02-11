/**
 * WebSocket + SSE Bot State Hook
 *
 * Manages the WebSocket connection to the Minecraft interface and
 * SSE fallback for bot state (HUD, inventory, connections, dwell counts).
 * Extracted from page.tsx to reduce component complexity.
 *
 * @author @darianrosebrook
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useDashboardStore } from '@/stores/dashboard-store';
import { useDashboardContext } from '@/contexts/dashboard-context';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useBotStateSSE } from '@/hooks/use-bot-state-sse';
import { getHexKey } from '@/components/stress-hex-heatmap';
import { debugLog } from '@/lib/utils';
import type { InventoryItem } from '@/types';

export interface BotState {
  position?: { x: number; y: number; z: number };
  health?: number;
  food?: number;
  energy?: number;
  safety?: number;
  social?: number;
  achievement?: number;
  curiosity?: number;
  creativity?: number;
  inventory?: InventoryItem[];
  selectedSlot?: number;
  time?: number;
  weather?: string;
}

export interface BotConnection {
  name: string;
  connected: boolean;
  viewerActive?: boolean;
  viewerUrl?: string;
}

export function useWsBotState() {
  const { config } = useDashboardContext();
  const { hud, setHud, addThought, setInventory } = useDashboardStore();

  const [botState, setBotState] = useState<BotState | null>(null);
  const [botConnections, setBotConnections] = useState<BotConnection[]>([
    {
      name: 'minecraft-bot',
      connected: false,
      viewerActive: false,
      viewerUrl: 'http://localhost:3006',
    },
  ]);
  const [dwellCounts, setDwellCounts] = useState<Record<string, number>>({});

  // Seed dwell counts from persisted intero history on mount
  const dwellSeeded = useRef(false);
  useEffect(() => {
    if (dwellSeeded.current) return;
    dwellSeeded.current = true;
    fetch('/api/intero/history?limit=1800')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { snapshots?: Array<{ stress?: number; focus?: number; curiosity?: number; stressAxes?: { time: number; situational: number; healthHunger: number; resource: number; protection: number; locationDistance: number } }> }) => {
        if (!data.snapshots?.length) return;
        const counts: Record<string, number> = {};
        for (const snap of data.snapshots) {
          const key = getHexKey(snap);
          counts[key] = (counts[key] ?? 0) + 1;
        }
        setDwellCounts((prev) => {
          const merged = { ...counts };
          for (const [k, v] of Object.entries(prev)) {
            merged[k] = (merged[k] ?? 0) + v;
          }
          return merged;
        });
      })
      .catch(() => {}); // Silent fail preserves current behavior
  }, []);

  // Use a ref for hud so the callback identity stays stable across renders.
  // Without this, every health_changed event updates hud → recreates the callback →
  // triggers WebSocket reconnection → causes the connect/disconnect spam.
  const hudRef = useRef(hud);
  hudRef.current = hud;

  // Memoized WebSocket callbacks
  const handleWebSocketMessage = useCallback(
    (message: any) => {
      debugLog('WebSocket message received:', message);

      switch (message.type) {
        case 'initial_state': {
          const initialState = message.data;
          setBotConnections((prev) => {
            const existing = prev.find((c) => c.name === 'minecraft-bot');
            return [
              {
                name: 'minecraft-bot',
                connected: initialState.connected,
                viewerActive: existing?.viewerActive ?? false,
                viewerUrl: existing?.viewerUrl ?? 'http://localhost:3006',
              },
            ];
          });
          break;
        }

        case 'health_changed': {
          const healthData = message.data;
          const currentHud = hudRef.current;
          const healthIntero = {
            stress: 20,
            focus: 80,
            curiosity: 75,
            ...(currentHud?.intero?.stressAxes
              ? { stressAxes: currentHud.intero.stressAxes }
              : {}),
          };
          setHud({
            ts: new Date().toISOString(),
            vitals: {
              health: healthData.health,
              hunger: healthData.food,
              stamina: 100,
              sleep: 100,
            },
            intero: healthIntero,
            mood: 'neutral',
          });
          setDwellCounts((prev) => {
            const key = getHexKey(healthIntero);
            return { ...prev, [key]: (prev[key] ?? 0) + 1 };
          });
          setBotState((prevState) => ({
            ...prevState,
            health: healthData.health,
            food: healthData.food,
          }));
          break;
        }

        case 'hud_update': {
          const hudData = message.data;
          const derivedIntero = {
            stress: (1 - (hudData.safety || 0.9)) * 100,
            focus: (hudData.curiosity || 0.6) * 100,
            curiosity: (hudData.curiosity || 0.6) * 100,
          };
          const hudIntero = hudData.intero
            ? {
                stress: hudData.intero.stress ?? derivedIntero.stress,
                focus: hudData.intero.focus ?? derivedIntero.focus,
                curiosity: hudData.intero.curiosity ?? derivedIntero.curiosity,
                ...(hudData.intero.stressAxes
                  ? { stressAxes: hudData.intero.stressAxes }
                  : {}),
              }
            : derivedIntero;
          setHud({
            ts: new Date().toISOString(),
            vitals: {
              health: hudData.health || 20,
              hunger: hudData.food || 20,
              stamina: (hudData.energy || 1) * 100,
              sleep: 100,
            },
            intero: hudIntero,
            mood:
              (hudData.safety || 0.9) > 0.8
                ? 'content'
                : (hudData.safety || 0.9) > 0.5
                  ? 'neutral'
                  : 'concerned',
          });
          setDwellCounts((prev) => {
            const key = getHexKey(hudIntero);
            return { ...prev, [key]: (prev[key] ?? 0) + 1 };
          });
          setBotState((prevState) => ({
            ...prevState,
            health: hudData.health,
            food: hudData.food,
          }));
          break;
        }

        case 'inventory_changed': {
          const inventoryData = message.data;
          const formattedInventory = inventoryData.items.map((item: any) => ({
            name: item.name,
            count: item.count,
            displayName: item.name,
          }));
          setInventory(formattedInventory);
          setBotState((prevState) => ({
            ...prevState,
            inventory: formattedInventory,
          }));
          break;
        }

        case 'position_changed': {
          const positionData = message.data;
          setBotState((prevState) => ({
            ...prevState,
            position: {
              x: positionData.position.x,
              y: positionData.position.y,
              z: positionData.position.z,
            },
          }));
          break;
        }

        case 'connected':
        case 'disconnected':
        case 'spawned':
          setBotConnections((prev) => {
            const existing = prev.find((c) => c.name === 'minecraft-bot');
            return [
              {
                name: 'minecraft-bot',
                connected:
                  message.type === 'connected' || message.type === 'spawned',
                viewerActive: existing?.viewerActive ?? false,
                viewerUrl: existing?.viewerUrl ?? 'http://localhost:3006',
              },
            ];
          });
          break;

        case 'warning': {
          addThought({
            id: `warning-${message.timestamp}-${Math.random().toString(36).substring(2, 9)}`,
            ts: new Date(message.timestamp).toISOString(),
            text: `Warning: ${message.data.message}`,
            type: 'reflection',
          });
          break;
        }

        case 'error': {
          const errorData = message.data;
          if (errorData.error === 'Bot died') {
            const deadIntero = {
              stress: 100,
              focus: 0,
              curiosity: 0,
              stressAxes: {
                time: 100,
                situational: 100,
                healthHunger: 100,
                resource: 50,
                protection: 100,
                locationDistance: 50,
              },
            };
            setHud({
              ts: new Date().toISOString(),
              vitals: {
                health: 0,
                hunger: errorData.food || 0,
                stamina: 0,
                sleep: 100,
              },
              intero: deadIntero,
              mood: 'dead',
            });
            setDwellCounts((prev) => {
              const key = getHexKey(deadIntero);
              return { ...prev, [key]: (prev[key] ?? 0) + 1 };
            });
            setBotState((prevState) => ({
              ...prevState,
              health: 0,
              food: errorData.food || 0,
            }));
          }
          addThought({
            id: `error-${message.timestamp}-${Math.random().toString(36).substring(2, 9)}`,
            ts: new Date(message.timestamp).toISOString(),
            text: `Error: ${errorData.error}`,
            type: 'reflection',
          });
          break;
        }

        case 'respawned': {
          const respawnData = message.data;
          const respawnIntero = {
            stress: 20,
            focus: 80,
            curiosity: 75,
            stressAxes: {
              time: 5,
              situational: 5,
              healthHunger: 5,
              resource: 20,
              protection: 15,
              locationDistance: 5,
            },
          };
          setHud({
            ts: new Date().toISOString(),
            vitals: {
              health: respawnData.health || 20,
              hunger: respawnData.food || 20,
              stamina: 100,
              sleep: 100,
            },
            intero: respawnIntero,
            mood: 'neutral',
          });
          setDwellCounts((prev) => {
            const key = getHexKey(respawnIntero);
            return { ...prev, [key]: (prev[key] ?? 0) + 1 };
          });
          setBotState((prevState) => ({
            ...prevState,
            health: respawnData.health || 20,
            food: respawnData.food || 20,
          }));
          addThought({
            id: `respawned-${message.timestamp}-${Math.random().toString(36).substring(2, 9)}`,
            ts: new Date(message.timestamp).toISOString(),
            text: `Respawned with ${respawnData.health || 20} health`,
            type: 'self',
          });
          break;
        }

        case 'block_broken':
        case 'block_placed': {
          const blockData = message.data;
          addThought({
            id: `block-${message.timestamp}-${Math.random().toString(36).substring(2, 9)}`,
            ts: new Date(message.timestamp).toISOString(),
            text: `${message.type === 'block_broken' ? 'Broke' : 'Placed'} ${blockData.blockType} at (${blockData.position.x.toFixed(1)}, ${blockData.position.y.toFixed(1)}, ${blockData.position.z.toFixed(1)})`,
            type: 'self',
          });
          break;
        }

        default:
          debugLog('Unhandled WebSocket message type:', message.type);
      }
    },
    // hud is accessed via hudRef to avoid callback identity churn.
    // setHud, setInventory, addThought are stable (from zustand store).
    [setHud, setInventory, addThought]
  );

  const handleWebSocketError = useCallback((error: Event) => {
    debugLog('Bot state WebSocket connection error:', error);
  }, []);

  const handleWebSocketOpen = useCallback(() => {
    debugLog('Bot state WebSocket connection opened');
  }, []);

  const handleWebSocketClose = useCallback(() => {
    debugLog('Bot state WebSocket connection closed');
  }, []);

  // WebSocket connection for real-time bot state updates (Minecraft interface)
  const botStateWebSocket = useWebSocket({
    url: config.websocket.url,
    onMessage: handleWebSocketMessage,
    onError: handleWebSocketError,
    onOpen: handleWebSocketOpen,
    onClose: handleWebSocketClose,
  });

  // When WebSocket is disconnected, stream bot state over SSE from dashboard API
  const handleBotStateSSE = useCallback(
    (msg: {
      data?: {
        connected?: boolean;
        inventory?: unknown[];
        position?: [number, number, number] | null;
        vitals?: {
          health?: number;
          hunger?: number;
          food?: number;
          stamina?: number;
          sleep?: number;
        } | null;
        intero?: {
          stress?: number;
          focus?: number;
          curiosity?: number;
          stressAxes?: {
            time: number;
            situational: number;
            healthHunger: number;
            resource: number;
            protection: number;
            locationDistance: number;
          };
        };
        mood?: string;
      };
    }) => {
      const d = msg?.data;
      if (!d) return;
      if (d.vitals || d.intero || d.mood) {
        const defaultVitals = {
          health: 20,
          hunger: 20,
          stamina: 100,
          sleep: 100,
        };
        const v = d.vitals;
        const vitals = {
          health: v?.health ?? defaultVitals.health,
          hunger: v?.hunger ?? v?.food ?? defaultVitals.hunger,
          stamina: v?.stamina ?? defaultVitals.stamina,
          sleep: v?.sleep ?? defaultVitals.sleep,
        };
        const defaultIntero = { stress: 20, focus: 80, curiosity: 75 };
        const i = d.intero;
        const intero = {
          stress: i?.stress ?? defaultIntero.stress,
          focus: i?.focus ?? defaultIntero.focus,
          curiosity: i?.curiosity ?? defaultIntero.curiosity,
          ...(i?.stressAxes ? { stressAxes: i.stressAxes } : {}),
        };
        setHud({
          ts: new Date().toISOString(),
          vitals,
          intero,
          mood: d.mood ?? 'neutral',
        });
        setDwellCounts((prev) => {
          const key = getHexKey(intero);
          return { ...prev, [key]: (prev[key] ?? 0) + 1 };
        });
      }
      const normalizedInventory: InventoryItem[] = d.inventory
        ? (
            d.inventory as Array<{
              name?: string;
              type?: string;
              count?: number;
              slot?: number;
              displayName?: string;
            }>
          ).map((item, idx) => ({
            type: item.type ?? item.name ?? null,
            count: item.count ?? 0,
            slot: item.slot ?? idx,
            displayName: item.displayName,
          }))
        : [];
      if (d.inventory) setInventory(normalizedInventory);
      setBotState({
        position: d.position
          ? { x: d.position[0], y: d.position[1], z: d.position[2] }
          : undefined,
        health: d.vitals?.health ?? d.vitals?.hunger ?? d.vitals?.food,
        food: d.vitals?.hunger ?? d.vitals?.food,
        inventory: normalizedInventory,
      });
      setBotConnections((prev) => {
        const existing = prev.find((c) => c.name === 'minecraft-bot');
        return [
          {
            name: 'minecraft-bot',
            connected: d.connected ?? false,
            viewerActive: existing?.viewerActive ?? false,
            viewerUrl: existing?.viewerUrl ?? 'http://localhost:3006',
          },
        ];
      });
    },
    [setHud, setInventory]
  );

  useBotStateSSE({
    enabled: !botStateWebSocket.isConnected,
    onMessage: handleBotStateSSE,
  });

  return {
    botState,
    setBotState,
    botConnections,
    setBotConnections,
    dwellCounts,
    botStateWebSocket,
  };
}
