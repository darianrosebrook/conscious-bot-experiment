/**
 * Initial Data Fetch Hook
 *
 * Runs once on mount to hydrate the dashboard with tasks, planner data,
 * world environment, inventory, and bot state from various services.
 *
 * @author @darianrosebrook
 */

import { useEffect, useCallback } from 'react';
import { useDashboardStore } from '@/stores/dashboard-store';
import { useDashboardContext } from '@/contexts/dashboard-context';
import { debugLog } from '@/lib/utils';
import type { BotState, BotConnection } from '@/hooks/use-ws-bot-state';

interface UseInitialDataFetchOptions {
  setBotState: React.Dispatch<React.SetStateAction<BotState | null>>;
  setBotConnections: React.Dispatch<React.SetStateAction<BotConnection[]>>;
  checkViewerStatus: () => Promise<void>;
}

export function useInitialDataFetch({
  setBotState,
  setBotConnections,
  checkViewerStatus,
}: UseInitialDataFetchOptions) {
  const { config } = useDashboardContext();
  const {
    setTasks,
    setTasksFallback,
    setEnvironment,
    setInventory,
    setHud,
    setPlannerData,
    loadThoughtsFromServer,
  } = useDashboardStore();

  const fetchInitialData = useCallback(async () => {
    try {
      // Load persisted thoughts from server first
      await loadThoughtsFromServer();

      const timeout = config.api.timeout;

      // Fetch tasks
      const tasksRes = await fetch(config.routes.tasks(), {
        signal: AbortSignal.timeout(timeout),
      });
      if (tasksRes.ok) {
        const tasksData = await tasksRes.json();
        setTasks(tasksData.tasks || []);
        setTasksFallback(!!tasksData.fallback);
      }

      // Fetch planner data
      const plannerRes = await fetch(config.routes.planner(), {
        signal: AbortSignal.timeout(timeout),
      });
      if (plannerRes.ok) {
        const plannerData = await plannerRes.json();
        setPlannerData(plannerData);
      }

      // Fetch environment
      const worldRes = await fetch(config.routes.world(), {
        signal: AbortSignal.timeout(timeout),
      });
      if (worldRes.ok) {
        const worldData = await worldRes.json();
        setEnvironment(worldData.environment);
      }

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

      // Fetch initial HUD data from bot-state API
      const botStateRes = await fetch(config.routes.botStateHTTP(), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeout),
      });
      if (botStateRes.ok) {
        const botStateData = await botStateRes.json();
        if (botStateData.data) {
          if (
            botStateData.data.vitals ||
            botStateData.data.intero ||
            botStateData.data.mood
          ) {
            setHud({
              ts: new Date().toISOString(),
              vitals: botStateData.data.vitals || {
                health: 20,
                hunger: 20,
                stamina: 100,
                sleep: 100,
              },
              intero: botStateData.data.intero || {
                stress: 20,
                focus: 80,
                curiosity: 75,
              },
              mood: botStateData.data.mood || 'neutral',
            });
          }

          if (botStateData.data.inventory) {
            setInventory(botStateData.data.inventory);
          }

          setBotState({
            position: botStateData.data.position
              ? {
                  x: botStateData.data.position[0],
                  y: botStateData.data.position[1],
                  z: botStateData.data.position[2],
                }
              : undefined,
            health: botStateData.data.vitals?.health,
            food: botStateData.data.vitals?.hunger,
            inventory: botStateData.data.inventory || [],
            time: undefined,
            weather: undefined,
          });

          setBotConnections([
            {
              name: 'minecraft-bot',
              connected: botStateData.data.connected,
              viewerActive: false,
              viewerUrl: 'http://localhost:3006',
            },
          ]);
        }
      }

      // Fetch bot state and health (includes viewer info)
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
      }
    } catch (error) {
      debugLog('Initial data fetch error:', error);
      setBotConnections([
        {
          name: 'minecraft-bot',
          connected: false,
          viewerActive: false,
          viewerUrl: 'http://localhost:3006',
        },
      ]);
    }
  }, [
    config,
    setTasks,
    setTasksFallback,
    setEnvironment,
    setInventory,
    setHud,
    setPlannerData,
    loadThoughtsFromServer,
    setBotState,
    setBotConnections,
    checkViewerStatus,
  ]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);
}
