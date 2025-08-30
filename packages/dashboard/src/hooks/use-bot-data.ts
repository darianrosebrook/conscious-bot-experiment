/**
 * Bot Data Management Hook
 *
 * Handles fetching and managing bot state, tasks, environment, and other data.
 * Separates data fetching logic from the main dashboard component.
 *
 * @author @darianrosebrook
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useDashboardContext } from '@/contexts/dashboard-context';
import { useApi } from '@/hooks/use-api';
import { useDashboardStore } from '@/stores/dashboard-store';

// =============================================================================
// Types
// =============================================================================
interface BotState {
  position?: { x: number; y: number; z: number };
  health?: number;
  food?: number;
  energy?: number;
  safety?: number;
  social?: number;
  achievement?: number;
  curiosity?: number;
  creativity?: number;
  inventory?: Array<{ name: string; count: number; displayName: string }>;
  selectedSlot?: number;
  time?: number;
  weather?: string;
}

// =============================================================================
// Hook
// =============================================================================
export function useBotData() {
  const { config } = useDashboardContext();
  const api = useApi();
  const { setHud, setTasks, setEnvironment, setInventory, setPlannerData } =
    useDashboardStore();

  const [botState, setBotState] = useState<BotState | null>(null);
  const isMounted = useRef(true);
  const lastRefreshRef = useRef(0);
  const isRefreshingRef = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Refresh all HTTP data with debouncing and reduced frequency
  const refreshHTTP = useCallback(async () => {
    // Prevent multiple simultaneous refreshes
    if (isRefreshingRef.current) {
      console.debug('HTTP refresh already in progress, skipping');
      return;
    }

    // Debounce rapid calls (minimum 30 seconds between refreshes)
    const now = Date.now();
    if (now - lastRefreshRef.current < 30000) {
      console.debug(
        'HTTP refresh debounced, last refresh was',
        Math.round((now - lastRefreshRef.current) / 1000),
        'seconds ago'
      );
      return;
    }

    isRefreshingRef.current = true;
    lastRefreshRef.current = now;

    try {
      console.debug('Starting HTTP refresh...');

      // Parallel fetches with well-scoped timeouts and reduced frequency
      const [tasksRes, plannerRes, worldRes, inventoryRes] =
        await Promise.allSettled([
          api.get(config.routes.tasks()),
          api.get(config.routes.planner()),
          api.get(config.routes.world()),
          api.get(config.routes.inventory()),
        ]);

      if (tasksRes.status === 'fulfilled') {
        setTasks(tasksRes.value?.data ?? []);
      }
      if (plannerRes.status === 'fulfilled') {
        setPlannerData(plannerRes.value?.data ?? {});
      }
      if (worldRes.status === 'fulfilled') {
        setEnvironment(worldRes.value?.data?.environment ?? null);
      }
      if (inventoryRes.status === 'fulfilled') {
        setInventory(inventoryRes.value?.data?.inventory ?? []);
      }

      // HUD + bot state - only fetch if we haven't gotten it recently
      const botStateData = await api.get(config.routes.botStateHTTP());
      if (botStateData?.data) {
        const d = botStateData.data;
        if (d.vitals || d.intero || d.mood) {
          setHud({
            ts: new Date().toISOString(),
            vitals: d.vitals ?? {
              health: 20,
              hunger: 20,
              stamina: 100,
              sleep: 100,
            },
            intero: d.intero ?? { stress: 20, focus: 80, curiosity: 75 },
            mood: d.mood ?? 'neutral',
          });
        }
        setBotState({
          position: Array.isArray(d.position)
            ? { x: d.position[0], y: d.position[1], z: d.position[2] }
            : undefined,
          health: d.vitals?.health,
          food: d.vitals?.hunger,
          inventory: d.inventory ?? [],
        });
      }

      // Bot interface info for time/weather - only fetch if needed
      const [botRes, healthRes] = await Promise.allSettled([
        api.get(config.routes.botState()),
        api.get(config.routes.botHealth()),
      ]);

      if (botRes.status === 'fulfilled') {
        const world = botRes.value.data?.worldState ?? botRes.value.data ?? {};
        setBotState((s) => ({
          ...(s ?? {}),
          position: Array.isArray(world.playerPosition)
            ? {
                x: world.playerPosition[0],
                y: world.playerPosition[1],
                z: world.playerPosition[2],
              }
            : s?.position,
          health: world.health ?? s?.health,
          food: world.hunger ?? s?.food,
          inventory: Array.isArray(world.inventory?.items)
            ? world.inventory.items.map((it: any) => ({
                name: it.type,
                count: it.count,
                displayName: it.type,
              }))
            : s?.inventory,
          time: world.timeOfDay ?? s?.time,
          weather: world.weather ?? s?.weather,
        }));
      }

      if (healthRes.status === 'fulfilled') {
        // Health check completed successfully
        console.debug('Bot health check completed');
      }

      console.debug('HTTP refresh completed successfully');
    } catch (error) {
      // Soft fail - keep UI responsive
      console.debug('HTTP refresh failed:', error);
    } finally {
      isRefreshingRef.current = false;
    }
  }, [
    api,
    config.routes,
    setTasks,
    setPlannerData,
    setEnvironment,
    setInventory,
    setHud,
  ]);

  // Initial load
  useEffect(() => {
    refreshHTTP();
  }, [refreshHTTP]);

  // Periodic refresh - significantly reduced frequency to prevent spam
  useEffect(() => {
    const interval = setInterval(refreshHTTP, 300000); // Changed from 60s to 5 minutes (300s)
    return () => clearInterval(interval);
  }, [refreshHTTP]);

  return {
    botState,
    refreshHTTP,
  };
}
