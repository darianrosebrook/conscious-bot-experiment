'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity,
  Brain,
  FileText,
  History,
  ListChecks,
  Map,
  MessageSquare,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Search,
  UploadCloud,
} from 'lucide-react';

import { useDashboardStore } from '@/stores/dashboard-store';
import type { InventoryItem, Task } from '@/types';
import { cn, debugLog, formatTime } from '@/lib/utils';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useCognitiveStream } from '@/hooks/use-cognitive-stream';
import { useBotStateSSE } from '@/hooks/use-bot-state-sse';
import { ViewerHudOverlay } from '@/components/viewer-hud-overlay';
import { StressHexHeatmap, getHexKey } from '@/components/stress-hex-heatmap';
import { Section } from '@/components/section';
import { Pill } from '@/components/pill';
import { EmptyState } from '@/components/empty-state';
import { InventoryDisplay } from '@/components/inventory-display';
import { EvaluationTab } from '@/components/evaluation-tab';
import { DatabasePanel } from '@/components/database-panel';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DashboardProvider } from '@/contexts/dashboard-context';
import styles from './page.module.scss';
import tc from '@/styles/thought-colors.module.scss';

interface BotState {
  position?: {
    x: number;
    y: number;
    z: number;
  };
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

interface BotConnection {
  name: string;
  connected: boolean;
  viewerActive?: boolean;
  viewerUrl?: string;
}

type ThoughtColorKey =
  | 'intrusive'
  | 'chatIn'
  | 'chatOut'
  | 'social'
  | 'internal'
  | 'systemEvent'
  | 'thoughtProcessing'
  | 'taskCreation'
  | 'status'
  | 'systemMetric'
  | 'systemLog'
  | 'environmental'
  | 'default';

const THOUGHT_COLORS: Record<
  ThoughtColorKey,
  { border: string; bg: string; text: string }
> = {
  intrusive: {
    border: tc.intrusiveBorder,
    bg: tc.intrusiveBg,
    text: tc.intrusiveText,
  },
  chatIn: { border: tc.chatInBorder, bg: tc.chatInBg, text: tc.chatInText },
  chatOut: { border: tc.chatOutBorder, bg: tc.chatOutBg, text: tc.chatOutText },
  social: { border: tc.socialBorder, bg: tc.socialBg, text: tc.socialText },
  internal: {
    border: tc.internalBorder,
    bg: tc.internalBg,
    text: tc.internalText,
  },
  systemEvent: {
    border: tc.systemEventBorder,
    bg: tc.systemEventBg,
    text: tc.systemEventText,
  },
  thoughtProcessing: {
    border: tc.thoughtProcessingBorder,
    bg: tc.thoughtProcessingBg,
    text: tc.thoughtProcessingText,
  },
  taskCreation: {
    border: tc.taskCreationBorder,
    bg: tc.taskCreationBg,
    text: tc.taskCreationText,
  },
  status: { border: tc.statusBorder, bg: tc.statusBg, text: tc.statusText },
  systemMetric: {
    border: tc.systemMetricBorder,
    bg: tc.systemMetricBg,
    text: tc.systemMetricText,
  },
  systemLog: {
    border: tc.systemLogBorder,
    bg: tc.systemLogBg,
    text: tc.systemLogText,
  },
  environmental: {
    border: tc.environmentalBorder,
    bg: tc.environmentalBg,
    text: tc.environmentalText,
  },
  default: { border: tc.defaultBorder, bg: tc.defaultBg, text: tc.defaultText },
};

/**
 * Conscious Minecraft Bot Dashboard
 * Real-time monitoring interface for the conscious bot
 * @author @darianrosebrook
 */
function ConsciousMinecraftDashboardContent() {
  const {
    isLive,
    hud,
    thoughts,
    tasks,
    tasksFallback,
    events,
    memories,
    notes,
    environment,
    inventory,
    plannerData,
    setIsLive,
    setHud,
    addThought,
    setTasks,
    setTasksFallback,
    updateTask,
    addTask,
    addEvent,
    setEvents,
    setMemories,
    setNotes,
    setEnvironment,
    setInventory,
    setPlannerData,
    loadThoughtsFromServer,
  } = useDashboardStore();

  const [activeTab, setActiveTab] = useState('live');
  const [intrusion, setIntrusion] = useState('');
  const [botState, setBotState] = useState<BotState | null>(null);
  const [botConnections, setBotConnections] = useState<BotConnection[]>([
    {
      name: 'minecraft-bot',
      connected: false,
      viewerActive: false,
      viewerUrl: 'http://localhost:3006',
    },
  ]);
  const [viewerKey, setViewerKey] = useState(0);
  const [dwellCounts, setDwellCounts] = useState<Record<string, number>>({});
  const [viewerStatus, setViewerStatus] = useState<{
    canStart: boolean;
    viewerActive?: boolean;
    reason?: string;
    details?: any;
  } | null>(null);
  const thoughtsEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Function to check viewer status
  const checkViewerStatus = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:3005/viewer-status');
      const result = await response.json();
      setViewerStatus(result);
    } catch (error) {
      debugLog('Error checking viewer status:', error);
      setViewerStatus({
        canStart: false,
        reason: 'Failed to check viewer status',
      });
    }
  }, []);

  // Memoized WebSocket callbacks to prevent infinite reconnections
  const handleWebSocketMessage = useCallback(
    (message: any) => {
      debugLog('WebSocket message received:', message);

      // Handle different types of real-time updates
      switch (message.type) {
        case 'initial_state': {
          // Handle initial state when connection is established
          const initialState = message.data;
          setBotConnections([
            {
              name: 'minecraft-bot',
              connected: initialState.connected,
              viewerActive: false,
              viewerUrl: 'http://localhost:3006',
            },
          ]);
          break;
        }

        case 'health_changed': {
          // Update HUD with new health data
          const healthData = message.data;
          const healthIntero = {
            stress: 20,
            focus: 80,
            curiosity: 75,
            ...(hud?.intero?.stressAxes
              ? { stressAxes: hud.intero.stressAxes }
              : {}),
          };
          setHud({
            ts: new Date().toISOString(),
            vitals: {
              health: healthData.health,
              hunger: healthData.food,
              stamina: 100, // Default value
              sleep: 100, // Default value
            },
            intero: healthIntero,
            mood: 'neutral', // Default value
          });
          setDwellCounts((prev) => {
            const key = getHexKey(healthIntero);
            return { ...prev, [key]: (prev[key] ?? 0) + 1 };
          });

          // Update bot state
          setBotState((prevState) => ({
            ...prevState,
            health: healthData.health,
            food: healthData.food,
          }));
          break;
        }

        case 'hud_update': {
          // Update HUD with comprehensive data from periodic updates.
          // Prefer cognition intero when present; otherwise derive from safety/curiosity.
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
              stamina: (hudData.energy || 1) * 100, // Convert from 0-1 to 0-100
              sleep: 100, // Default value
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

          // Update bot state
          setBotState((prevState) => ({
            ...prevState,
            health: hudData.health,
            food: hudData.food,
          }));
          break;
        }

        case 'inventory_changed': {
          // Update inventory with new items
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
          // Update position
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
          // Update connection status
          setBotConnections([
            {
              name: 'minecraft-bot',
              connected:
                message.type === 'connected' || message.type === 'spawned',
              viewerActive: false,
              viewerUrl: 'http://localhost:3006',
            },
          ]);
          break;

        case 'warning': {
          // Add warning as a thought
          addThought({
            id: `warning-${message.timestamp}-${Math.random().toString(36).substring(2, 9)}`,
            ts: new Date(message.timestamp).toISOString(),
            text: `Warning: ${message.data.message}`,
            type: 'reflection',
          });
          break;
        }

        case 'error': {
          // Handle bot errors, especially death
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

            // Update bot state
            setBotState((prevState) => ({
              ...prevState,
              health: 0,
              food: errorData.food || 0,
            }));
          }

          // Add error as a thought
          addThought({
            id: `error-${message.timestamp}-${Math.random().toString(36).substring(2, 9)}`,
            ts: new Date(message.timestamp).toISOString(),
            text: `Error: ${errorData.error}`,
            type: 'reflection',
          });
          break;
        }

        case 'respawned': {
          // Handle bot respawn
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

          // Update HUD with respawned health
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

          // Update bot state
          setBotState((prevState) => ({
            ...prevState,
            health: respawnData.health || 20,
            food: respawnData.food || 20,
          }));

          // Add respawn as a thought
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
          // Add block interaction as a thought
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
    [
      setHud,
      setInventory,
      setBotState,
      setBotConnections,
      addThought,
      setDwellCounts,
    ]
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
    url: 'ws://localhost:3005',
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
      setBotConnections([
        {
          name: 'minecraft-bot',
          connected: d.connected ?? false,
          viewerActive: false,
          viewerUrl: 'http://localhost:3006',
        },
      ]);
    },
    [setHud, setInventory, setBotState, setBotConnections]
  );

  useBotStateSSE({
    enabled: !botStateWebSocket.isConnected,
    onMessage: handleBotStateSSE,
  });

  // Use the cognitive stream hook for proper SSE connection management
  const { sendIntrusiveThought } = useCognitiveStream();

  // Polling fallback when WebSocket fails
  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    // Only start polling if WebSocket is not connected and we have an error
    if (!botStateWebSocket.isConnected && botStateWebSocket.error) {
      debugLog('Starting polling fallback for bot state');

      const pollBotState = async () => {
        try {
          // Use the dashboard's bot state API which includes proper HUD data
          const response = await fetch('/api/ws/bot-state', {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(10000), // 10 second timeout
          });

          if (response.ok) {
            const data = await response.json();
            if (data.data) {
              const botStateData = data.data;

              // Update HUD with complete data from bot state API
              if (
                botStateData.vitals ||
                botStateData.intero ||
                botStateData.mood
              ) {
                setHud({
                  ts: new Date().toISOString(),
                  vitals: botStateData.vitals || {
                    health: 20,
                    hunger: 20,
                    stamina: 100,
                    sleep: 100,
                  },
                  intero: botStateData.intero || {
                    stress: 20,
                    focus: 80,
                    curiosity: 75,
                  },
                  mood: botStateData.mood || 'neutral',
                });
              }

              // Update inventory
              if (botStateData.inventory) {
                setInventory(botStateData.inventory);
              }

              // Update bot state
              setBotState({
                position: botStateData.position
                  ? {
                      x: botStateData.position[0],
                      y: botStateData.position[1],
                      z: botStateData.position[2],
                    }
                  : undefined,
                health: botStateData.vitals?.health,
                food: botStateData.vitals?.hunger,
                inventory: botStateData.inventory || [],
                time: undefined, // Not available in bot state API
                weather: undefined, // Not available in bot state API
              });

              setBotConnections([
                {
                  name: 'minecraft-bot',
                  connected: botStateData.connected,
                  viewerActive: false,
                  viewerUrl: 'http://localhost:3006',
                },
              ]);
            }
          }
        } catch (error) {
          debugLog('Polling fallback error:', error);
        }
      };

      // Initial poll
      pollBotState();

      // Poll every 10 seconds as fallback
      pollInterval = setInterval(pollBotState, 10000);
    }

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [
    botStateWebSocket.isConnected,
    botStateWebSocket.error,
    setHud,
    setInventory,
  ]);

  // Auto-scroll to bottom of thoughts
  useEffect(() => {
    // Use a small delay to ensure the DOM has updated
    const timeoutId = setTimeout(() => {
      if (scrollAreaRef.current) {
        // Scroll to the bottom of the scroll area
        const scrollElement = scrollAreaRef.current.querySelector(
          '[data-radix-scroll-area-viewport]'
        );
        if (scrollElement) {
          scrollElement.scrollTop = scrollElement.scrollHeight;
        }
      } else {
        // Fallback to scrollIntoView
        thoughtsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [thoughts]);

  // Periodic viewer status check only (auto-start handled by minecraft interface)
  useEffect(() => {
    // Check every 60 seconds (reduced frequency to prevent conflicts)
    const interval = setInterval(checkViewerStatus, 60000);

    // Initial check
    checkViewerStatus();

    return () => clearInterval(interval);
  }, [checkViewerStatus]);

  // Fetch initial data from bot systems
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // Load persisted thoughts from server first
        await loadThoughtsFromServer();

        // Fetch tasks
        const tasksRes = await fetch('/api/tasks');
        if (tasksRes.ok) {
          const tasksData = await tasksRes.json();
          setTasks(tasksData.tasks || []);
          setTasksFallback(!!tasksData.fallback);
        }

        // Fetch planner data
        const plannerRes = await fetch('http://localhost:3002/planner');
        if (plannerRes.ok) {
          const plannerData = await plannerRes.json();
          setPlannerData(plannerData);
        }

        // Fetch environment
        const worldRes = await fetch('/api/world');
        if (worldRes.ok) {
          const worldData = await worldRes.json();
          setEnvironment(worldData.environment);
        }

        // Fetch inventory
        const inventoryRes = await fetch('/api/inventory');
        if (inventoryRes.ok) {
          const inventoryData = await inventoryRes.json();
          if (inventoryData.success) {
            setInventory(inventoryData.inventory);
          }
        }

        // Fetch initial HUD data from bot-state API
        const botStateRes = await fetch('/api/ws/bot-state', {
          headers: { Accept: 'application/json' },
        });
        if (botStateRes.ok) {
          const botStateData = await botStateRes.json();
          if (botStateData.data) {
            // Update HUD with complete data from bot state API
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

            // Update inventory
            if (botStateData.data.inventory) {
              setInventory(botStateData.data.inventory);
            }

            // Update bot state
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
          fetch('http://localhost:3005/state', {
            signal: AbortSignal.timeout(10000),
          }),
          fetch('http://localhost:3005/health', {
            signal: AbortSignal.timeout(10000),
          }),
        ]);

        if (botRes.status === 'fulfilled' && botRes.value.ok) {
          const botData = await botRes.value.json();
          const worldState = botData.data?.worldState || botData.data;

          // Map minecraft interface data to dashboard BotState structure
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

          // Check viewer status if bot is connected
          if (healthData.status === 'connected') {
            await checkViewerStatus();
          }
        }
      } catch (error) {
        debugLog('Initial data fetch error:', error);
        // Silently handle errors to prevent component crashes
        // Set default states to prevent UI issues
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

    fetchInitialData();
  }, [
    setTasks,
    setEnvironment,
    setInventory,
    addThought,
    setPlannerData,
    checkViewerStatus,
    setBotState,
    setBotConnections,
    setHud,
    loadThoughtsFromServer,
  ]);

  // Map planning task to dashboard Task shape
  const mapPlanningTaskToDashboard = useCallback(
    (raw: {
      id: string;
      title?: string;
      priority?: number;
      progress?: number;
      source?: string;
      steps?: { id: string; label?: string; done?: boolean }[];
      requirement?: unknown;
      metadata?: { titleDisplay?: string; [key: string]: unknown };
    }) => {
      const sourceMap: Record<
        string,
        'planner' | 'goal' | 'reflection' | 'intrusion' | 'system'
      > = {
        planner: 'planner',
        goal: 'goal',
        intrusive: 'intrusion',
        autonomous: 'system',
        manual: 'system',
      };
      const r = raw.requirement as
        | {
            kind?: string;
            quantity?: number;
            have?: number;
            needed?: number;
            patterns?: string[];
            outputPattern?: string;
            proxyPatterns?: string[];
            proxyHave?: number;
          }
        | undefined;
      const requirement: Task['requirement'] =
        r &&
        ['collect', 'mine', 'craft'].includes(r.kind ?? '') &&
        typeof r.quantity === 'number' &&
        typeof r.have === 'number' &&
        typeof r.needed === 'number'
          ? {
              kind: r.kind as 'collect' | 'mine' | 'craft',
              quantity: r.quantity,
              have: r.have,
              needed: r.needed,
              patterns: r.patterns,
              outputPattern: r.outputPattern,
              proxyPatterns: r.proxyPatterns,
              proxyHave: r.proxyHave,
            }
          : undefined;
      return {
        id: raw.id,
        title: raw.metadata?.titleDisplay ?? raw.title ?? 'Task',
        priority: typeof raw.priority === 'number' ? raw.priority : 0,
        progress: typeof raw.progress === 'number' ? raw.progress : 0,
        source: sourceMap[raw.source ?? ''] ?? 'system',
        steps: Array.isArray(raw.steps)
          ? raw.steps.map((s) => ({
              id: s.id,
              label: s.label ?? s.id,
              done: !!s.done,
            }))
          : undefined,
        requirement,
      };
    },
    []
  );

  // Poll tasks only as fallback (push via SSE is primary); slow interval to reduce load
  const TASK_POLL_MS = 60_000;
  useEffect(() => {
    const pollTasks = async () => {
      try {
        const res = await fetch('/api/tasks', {
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const data = await res.json();
          setTasks(Array.isArray(data.tasks) ? data.tasks : []);
          setTasksFallback(!!data.fallback);
        }
      } catch {
        // Non-fatal; next poll will retry
      }
    };
    const interval = setInterval(pollTasks, TASK_POLL_MS);
    return () => clearInterval(interval);
  }, [setTasks]);

  // Subscribe to task-updates SSE: progress/steps/taskAdded/taskMetadataUpdated (push)
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/task-updates');
      es.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as {
            type?: string;
            event?: string;
            data?: {
              task?: {
                id: string;
                title?: string;
                priority?: number;
                progress?: number;
                source?: string;
                steps?: { id: string; label?: string; done?: boolean }[];
                requirement?: unknown;
              };
            };
          };
          if (msg.type !== 'task_update' || !msg.data?.task?.id) return;
          const { event, data } = msg;
          const task = data.task;
          if (!task) return;
          if (event === 'taskAdded') {
            addTask(mapPlanningTaskToDashboard(task));
            return;
          }
          if (event === 'taskMetadataUpdated') {
            updateTask(task.id, {
              progress:
                typeof task.progress === 'number' ? task.progress : undefined,
              steps: Array.isArray(task.steps)
                ? task.steps.map((s) => ({
                    id: s.id,
                    label: s.label ?? s.id,
                    done: !!s.done,
                  }))
                : undefined,
            });
            return;
          }
          if (
            event === 'taskProgressUpdated' ||
            event === 'taskStepCompleted' ||
            event === 'taskStepStarted' ||
            event === 'taskStepsInserted'
          ) {
            const updates: {
              progress?: number;
              steps?: { id: string; label: string; done: boolean }[];
            } = {
              progress:
                typeof task.progress === 'number' ? task.progress : undefined,
            };
            if (Array.isArray(task.steps)) {
              updates.steps = task.steps.map((s) => ({
                id: s.id,
                label: s.label ?? s.id,
                done: !!s.done,
              }));
            }
            if (updates.progress !== undefined || updates.steps !== undefined) {
              updateTask(task.id, updates);
            }
          }
        } catch {
          // Ignore parse errors for non-JSON or malformed messages
        }
      };
      es.onerror = () => {
        // Connection drop; slow polling will keep list in sync
      };
    } catch {
      // EventSource not available; fall back to polling only
    }
    return () => {
      if (es) {
        es.close();
      }
    };
  }, [updateTask, addTask, mapPlanningTaskToDashboard]);

  // Subscribe to memory-updates SSE so events/notes update via push
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/memory-updates');
      es.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as { event?: string; data?: unknown };
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
        } catch {
          // Ignore parse errors
        }
      };
      es.onerror = () => {};
    } catch {
      // EventSource not available
    }
    return () => {
      if (es) es.close();
    };
  }, [addEvent, setNotes]);

  // Poll thought history so thoughts update when SSE has no connections or drops
  const THOUGHTS_POLL_MS = 20000;
  useEffect(() => {
    const mergeNewThoughts = async () => {
      try {
        const currentIds = new Set(
          useDashboardStore.getState().thoughts.map((t) => t.id)
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

  // Periodic refresh of bot state and connection status
  useEffect(() => {
    const refreshBotState = async () => {
      try {
        // Fetch inventory
        const inventoryRes = await fetch('/api/inventory', {
          signal: AbortSignal.timeout(10000),
        });
        if (inventoryRes.ok) {
          const inventoryData = await inventoryRes.json();
          if (inventoryData.success) {
            setInventory(inventoryData.inventory);
          }
        }

        // Fetch memories, events, and notes periodically
        const [memoriesRes, eventsRes, notesRes] = await Promise.allSettled([
          fetch('/api/memories', { signal: AbortSignal.timeout(10000) }),
          fetch('/api/events', { signal: AbortSignal.timeout(10000) }),
          fetch('/api/notes', { signal: AbortSignal.timeout(10000) }),
        ]);

        // Process memories - filter out system memories from cognitive stream
        if (memoriesRes.status === 'fulfilled' && memoriesRes.value.ok) {
          const memoriesData = await memoriesRes.value.json();
          if (memoriesData.memories && Array.isArray(memoriesData.memories)) {
            // Only add new memories (check by ID to avoid duplicates)
            const existingThoughtIds = new Set(thoughts.map((t) => t.id));
            memoriesData.memories.forEach((memory: any) => {
              // Filter out system memories that shouldn't appear in cognitive stream
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

            // Update memories store for sidebar rendering
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

        // Process events - filter out system events from cognitive stream
        if (eventsRes.status === 'fulfilled' && eventsRes.value.ok) {
          const eventsData = await eventsRes.value.json();
          if (eventsData.events && Array.isArray(eventsData.events)) {
            // Only add new events (check by ID to avoid duplicates)
            const existingThoughtIds = new Set(thoughts.map((t) => t.id));
            eventsData.events.forEach((event: any) => {
              // Filter out system events that shouldn't appear in cognitive stream
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

            // Update events store for sidebar rendering
            const mapped = eventsData.events.map((e: any) => ({
              id: e.id,
              ts: e.timestamp || new Date().toISOString(),
              kind: e.type || e.kind || 'unknown',
              payload: { content: e.content, ...(e.payload || {}) },
            }));
            setEvents(mapped);
          }
        }

        // Process notes - filter out system notes from cognitive stream
        if (notesRes.status === 'fulfilled' && notesRes.value.ok) {
          const notesData = await notesRes.value.json();
          if (notesData.notes && Array.isArray(notesData.notes)) {
            // Only add new notes (check by ID to avoid duplicates)
            const existingThoughtIds = new Set(thoughts.map((t) => t.id));
            notesData.notes.forEach((note: any) => {
              // Filter out system notes that shouldn't appear in cognitive stream
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

            // Update notes store for sidebar rendering
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
          fetch('http://localhost:3005/state', {
            signal: AbortSignal.timeout(10000),
          }),
          fetch('http://localhost:3005/health', {
            signal: AbortSignal.timeout(10000),
          }),
        ]);

        if (botRes.status === 'fulfilled' && botRes.value.ok) {
          const botData = await botRes.value.json();
          const worldState = botData.data?.worldState || botData.data;

          // Map minecraft interface data to dashboard BotState structure
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

          // Check viewer status if bot is connected
          if (healthData.status === 'connected') {
            await checkViewerStatus();
          }
        } else {
          // If health check fails, mark as disconnected
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
        // If any error occurs, mark as disconnected
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

    // Refresh every 20 seconds so status/tasks/thoughts feel live without full reload
    const interval = setInterval(refreshBotState, 60000);
    return () => clearInterval(interval);
  }, [
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

  /**
   * Submit an intrusive thought to the bot
   */
  const handleSubmitIntrusion = async () => {
    const text = intrusion.trim();
    if (!text) return;

    try {
      // Use the cognitive stream hook for proper handling
      const success = await sendIntrusiveThought(text, {
        tags: ['external', 'intrusion'],
        strength: 0.8,
      });

      if (success) {
        setIntrusion('');
        debugLog('Intrusive thought submitted successfully');
      } else {
        console.error('Failed to submit intrusive thought');
      }
    } catch (error) {
      console.error('Error submitting intrusive thought:', error);
    }
  };

  return (
    <div className={styles.root}>
      {/* Top Navigation */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerLogo}>
            <Brain className={styles.icon4} />
          </div>
          <div className={styles.headerTitle}>Cognitive Stream</div>
          <nav className={styles.headerNav}>
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className={styles.tabsAuto}
            >
              <TabsList className={styles.tabsBg}>
                <TabsTrigger value="live">Live</TabsTrigger>
                <TabsTrigger value="evaluation">Evaluation</TabsTrigger>
                <TabsTrigger value="database">Database</TabsTrigger>
              </TabsList>
            </Tabs>
          </nav>
        </div>
        <div className={styles.headerRight}>
          <Button variant="outline" size="sm" className={styles.headerBtn}>
            <Search className={styles.iconMr} />
            Search
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={styles.headerBtn}
            onClick={() => setIsLive(!isLive)}
          >
            {isLive ? (
              <PauseCircle className={styles.iconMr} />
            ) : (
              <PlayCircle className={styles.iconMr} />
            )}
            {isLive ? 'Pause' : 'Go Live'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={styles.headerBtn}
            onClick={() => {
              // Refresh bot state data
              botStateWebSocket.reconnect();
              setViewerKey((prev) => prev + 1);
            }}
          >
            <RefreshCw className={styles.iconMr} />
            Refresh
          </Button>
          <div className={styles.statusGroup}>
            <div
              className={cn(
                styles.statusDot,
                botStateWebSocket.isConnected
                  ? styles.statusDotGreen
                  : botStateWebSocket.error
                    ? styles.statusDotRed
                    : styles.statusDotYellow
              )}
            />
            <span className={styles.statusLabel}>Bot State</span>
            {botStateWebSocket.error && (
              <button
                onClick={() => {
                  botStateWebSocket.reconnect();
                }}
                className={styles.reconnectBtn}
              >
                Reconnect
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content with Tabs */}
      <div className={styles.mainContent}>
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className={styles.tabsFull}
        >
          <TabsContent value="live" className={styles.tabContentFull}>
            <div className={styles.liveGrid}>
              {/* Left: Stress heatmap, Tasks, Planner, Reflective Notes, Environment, Events, Memories */}
              <aside className={styles.leftSidebar}>
                {hud?.intero && (
                  <Section
                    title="Stress / Interoception"
                    icon={<Brain className={styles.icon4} />}
                  >
                    <div className={styles.stressContent}>
                      <StressHexHeatmap
                        intero={hud.intero}
                        dwellCounts={dwellCounts}
                        className={styles.shrink0}
                      />
                      <div className={styles.moodText}>
                        Mood:{' '}
                        <span className={styles.moodValue}>{hud.mood}</span>
                      </div>
                    </div>
                  </Section>
                )}
                <Section
                  title="Tasks"
                  icon={<ListChecks className={styles.icon4} />}
                >
                  {tasks.length > 0 ? (
                    <div className={styles.taskList}>
                      {tasks.map((task) => (
                        <div key={task.id} className={styles.taskCard}>
                          <div className={styles.taskHeader}>
                            <div className={styles.taskTitle}>{task.title}</div>
                            <Pill>{task.source}</Pill>
                          </div>
                          <div className={styles.taskProgressTrack}>
                            <div
                              className={styles.taskProgressFill}
                              style={{
                                width: `${Math.round(task.progress * 100)}%`,
                              }}
                            />
                          </div>
                          {task.requirement && (
                            <div className={styles.taskRequirement}>
                              <div className={styles.requirementHeader}>
                                <span className={styles.requirementLabel}>
                                  Requirement
                                </span>
                                {task.requirement?.kind === 'craft' &&
                                task.requirement?.outputPattern ? (
                                  <span>
                                    Output: {task.requirement.outputPattern}
                                    {task.requirement.have >=
                                    (task.requirement.quantity || 1)
                                      ? ' • Crafted'
                                      : task.requirement.proxyHave !== undefined
                                        ? ` • Materials ~${task.requirement.proxyHave}`
                                        : ''}
                                  </span>
                                ) : (
                                  <span>
                                    Have {task.requirement?.have ?? 0}/
                                    {task.requirement?.quantity ?? 0}
                                    {typeof task.requirement?.needed ===
                                    'number'
                                      ? ` • Need ${task.requirement.needed}`
                                      : ''}
                                  </span>
                                )}
                              </div>
                              {Array.isArray(task.requirement?.patterns) &&
                              task.requirement?.patterns?.length ? (
                                <div className={styles.requirementPatterns}>
                                  Items: {task.requirement.patterns.join(', ')}
                                </div>
                              ) : null}
                              {/* Mini requirement progress bar */}
                              {(() => {
                                const req = task.requirement as any;
                                if (!req) return null;
                                let reqProgress = 0;
                                if (
                                  req.kind === 'collect' ||
                                  req.kind === 'mine'
                                ) {
                                  const total = Math.max(1, req.quantity || 0);
                                  reqProgress = Math.max(
                                    0,
                                    Math.min(1, (req.have || 0) / total)
                                  );
                                } else if (req.kind === 'craft') {
                                  const q = Math.max(1, req.quantity || 1);
                                  if ((req.have || 0) >= q) reqProgress = 1;
                                  else if (typeof req.proxyHave === 'number') {
                                    // mirror server heuristic (3 logs ~ ready)
                                    reqProgress = Math.max(
                                      0,
                                      Math.min(1, req.proxyHave / 3)
                                    );
                                  } else reqProgress = 0;
                                }
                                const pct = Math.round(reqProgress * 100);
                                return (
                                  <div
                                    className={
                                      styles.requirementProgressWrapper
                                    }
                                  >
                                    <div
                                      className={
                                        styles.requirementProgressHeader
                                      }
                                    >
                                      <span
                                        className={
                                          styles.requirementProgressLabel
                                        }
                                      >
                                        Requirement Progress
                                      </span>
                                      <span
                                        className={
                                          styles.requirementProgressValue
                                        }
                                      >
                                        {pct}%
                                      </span>
                                    </div>
                                    <div
                                      className={
                                        styles.requirementProgressTrack
                                      }
                                    >
                                      <div
                                        className={
                                          styles.requirementProgressFill
                                        }
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                          {task.steps && (
                            <ul className={styles.taskSteps}>
                              {task.steps.map((step) => (
                                <li key={step.id} className={styles.stepItem}>
                                  <input
                                    type="checkbox"
                                    checked={step.done}
                                    onChange={() => {}}
                                    className={styles.stepCheckbox}
                                  />
                                  <span
                                    className={
                                      step.done ? styles.stepDone : undefined
                                    }
                                  >
                                    {step.label}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={ListChecks}
                      title="No tasks available"
                      description={
                        tasksFallback
                          ? 'Planning system temporarily unavailable.'
                          : 'Tasks will appear here when the bot is actively planning or executing goals.'
                      }
                    />
                  )}
                </Section>

                <Section
                  title="Current Status"
                  icon={<Activity className={styles.icon4} />}
                  tight
                >
                  {plannerData ? (
                    <div className={styles.plannerContent}>
                      {plannerData.currentAction && (
                        <div className={styles.plannerCard}>
                          <div className={styles.plannerCardHeader}>
                            <h4 className={styles.plannerCardTitle}>
                              Current Action
                            </h4>
                            <span className={styles.plannerCardPercent}>
                              {Math.round(
                                (plannerData.currentAction.progress || 0) * 100
                              )}
                              %
                            </span>
                          </div>
                          <p className={styles.plannerCardDesc}>
                            {plannerData.currentAction.name}
                            {plannerData.currentAction.target && (
                              <span className={styles.plannerCardTarget}>
                                {' '}
                                → {plannerData.currentAction.target}
                              </span>
                            )}
                          </p>
                        </div>
                      )}

                      {plannerData.planQueue.length > 0 && (
                        <div className={styles.plannerCard}>
                          <h4 className={styles.plannerCardTitle}>
                            Upcoming Plans
                          </h4>
                          <div className={styles.plannerUpcomingContent}>
                            {plannerData.planQueue.slice(0, 2).map((plan) => (
                              <div
                                key={plan.id}
                                className={styles.plannerUpcomingItem}
                              >
                                • {plan.name}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <EmptyState
                      icon={Activity}
                      title="No status data"
                      description="Status information will appear here when the bot is active."
                    />
                  )}
                </Section>

                <Section
                  title="Reflective Notes"
                  icon={<FileText className={styles.icon4} />}
                  tight
                >
                  {notes.length > 0 ? (
                    <div className={styles.notesList}>
                      {notes.slice(0, 5).map((note) => (
                        <div key={note.id} className={styles.noteCard}>
                          <div className={styles.noteHeader}>
                            <Pill>{note.type}</Pill>
                            <time className={styles.tabularNums}>
                              {formatTime(note.ts)}
                            </time>
                          </div>
                          {note.title && (
                            <div className={styles.noteTitle}>{note.title}</div>
                          )}
                          <p className={styles.noteContent}>{note.content}</p>
                          <div className={styles.noteFooter}>
                            <Pill>{note.source}</Pill>
                            <span className={styles.noteConfidence}>
                              {Math.round(note.confidence * 100)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={FileText}
                      title="No reflective notes"
                      description="Reflective insights will appear here as the bot processes experiences."
                    />
                  )}
                </Section>

                <Section
                  title="Environment"
                  icon={<Map className={styles.icon4} />}
                >
                  {environment ? (
                    <div className={styles.envGrid}>
                      <div className={styles.envCell}>
                        <span className={styles.envLabel}>Biome</span>
                        <div>{environment.biome}</div>
                      </div>
                      <div className={styles.envCell}>
                        <span className={styles.envLabel}>Weather</span>
                        <div>{environment.weather}</div>
                      </div>
                      <div className={styles.envCell}>
                        <span className={styles.envLabel}>Time</span>
                        <div>{environment.timeOfDay}</div>
                      </div>
                      <div className={styles.envCell}>
                        <span className={styles.envLabel}>Nearby</span>
                        <div>{environment.nearbyEntities.join(', ')}</div>
                      </div>
                    </div>
                  ) : (
                    <EmptyState
                      icon={Map}
                      title="No environment data"
                      description="Environment information will appear here when the bot is connected to the world."
                    />
                  )}
                </Section>

                <Section
                  title="Events"
                  icon={<History className={styles.icon4} />}
                >
                  {events.length > 0 ? (
                    <div className={styles.eventMemoryList}>
                      {events
                        .slice(-8)
                        .reverse()
                        .map((event) => (
                          <div key={event.id} className={styles.eventCard}>
                            <div className={styles.eventHeader}>
                              <Pill>{event.kind}</Pill>
                              <time className={styles.tabularNums}>
                                {formatTime(event.ts)}
                              </time>
                            </div>
                            <p className={styles.eventContent}>
                              {(event.payload?.content as string) ||
                                (event.payload?.title as string) ||
                                event.kind}
                            </p>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={History}
                      title="No events recorded"
                      description="Events will appear here as the bot interacts with the world."
                    />
                  )}
                </Section>

                <Section
                  title="Memories"
                  icon={<Brain className={styles.icon4} />}
                >
                  {memories.length > 0 ? (
                    <div className={styles.eventMemoryList}>
                      {memories
                        .slice(-6)
                        .reverse()
                        .map((memory) => (
                          <div key={memory.id} className={styles.eventCard}>
                            <div className={styles.eventHeader}>
                              <Pill>{memory.type}</Pill>
                              <time className={styles.tabularNums}>
                                {formatTime(memory.ts)}
                              </time>
                            </div>
                            <p className={styles.eventContent}>{memory.text}</p>
                            {memory.score != null && (
                              <div className={styles.memorySalience}>
                                Salience: {Math.round(memory.score * 100)}%
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={Brain}
                      title="No memories available"
                      description="Memories will appear here as the bot forms and recalls experiences."
                    />
                  )}
                </Section>
              </aside>

              {/* Center: Live Stream + Inventory */}
              <main className={styles.centerColumn}>
                <Section
                  title="Live Stream"
                  icon={<Activity className={styles.icon4} />}
                  actions={
                    botConnections.find((c) => c.name === 'minecraft-bot')
                      ?.viewerActive ? (
                      <div className={styles.streamHeaderButtons}>
                        <button
                          onClick={async () => {
                            setViewerKey((prev) => prev + 1);
                            await checkViewerStatus();
                          }}
                          className={styles.viewerBtn}
                        >
                          Refresh Viewer
                        </button>
                        <button
                          onClick={() => {
                            window.open(
                              botConnections.find(
                                (c) => c.name === 'minecraft-bot'
                              )?.viewerUrl || 'http://localhost:3006',
                              '_blank'
                            );
                          }}
                          className={styles.viewerBtn}
                        >
                          Full Screen
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              const response = await fetch(
                                'http://localhost:3005/stop-viewer',
                                { method: 'POST' }
                              );
                              const result = await response.json();
                              if (result.success) {
                                setBotConnections((prev) =>
                                  prev.map((conn) =>
                                    conn.name === 'minecraft-bot'
                                      ? { ...conn, viewerActive: false }
                                      : conn
                                  )
                                );
                                await checkViewerStatus();
                              }
                            } catch (error) {
                              console.error('Error stopping viewer:', error);
                            }
                          }}
                          className={styles.viewerBtnStop}
                        >
                          Stop Viewer
                        </button>
                      </div>
                    ) : null
                  }
                >
                  <div className={styles.streamWrapper}>
                    {botConnections.find((c) => c.name === 'minecraft-bot')
                      ?.viewerActive ? (
                      <>
                        <iframe
                          key={viewerKey}
                          src={
                            botConnections.find(
                              (c) => c.name === 'minecraft-bot'
                            )?.viewerUrl || 'http://localhost:3006'
                          }
                          className={styles.streamIframe}
                          title="Minecraft Bot View"
                          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        />
                        <ViewerHudOverlay
                          health={hud?.vitals?.health ?? botState?.health ?? 20}
                          hunger={hud?.vitals?.hunger ?? botState?.food ?? 20}
                          armor={0}
                          breath={20}
                          experience={0}
                        />
                      </>
                    ) : (
                      <div className={styles.streamPlaceholder}>
                        <div className={styles.streamPlaceholderContent}>
                          <div className={styles.streamPlaceholderIcon}>
                            <Activity
                              className={cn(styles.icon6, styles.statusLabel)}
                            />
                          </div>
                          <h3 className={styles.streamPlaceholderTitle}>
                            Bot Status
                          </h3>
                          <p className={styles.streamPlaceholderDesc}>
                            {botConnections.find(
                              (c) => c.name === 'minecraft-bot'
                            )?.connected
                              ? 'Bot connected, starting viewer...'
                              : 'Waiting for Minecraft bot to connect...'}
                          </p>
                          {botConnections.find(
                            (c) => c.name === 'minecraft-bot'
                          )?.connected && (
                            <button
                              onClick={async () => {
                                try {
                                  // Check viewer status first
                                  await checkViewerStatus();

                                  if (!viewerStatus?.canStart) {
                                    console.error(
                                      'Cannot start viewer:',
                                      viewerStatus?.reason
                                    );
                                    return;
                                  }

                                  // Start the viewer
                                  const response = await fetch(
                                    'http://localhost:3005/start-viewer',
                                    {
                                      method: 'POST',
                                    }
                                  );
                                  const result = await response.json();
                                  if (result.success) {
                                    // Update viewer status immediately for better UX
                                    setBotConnections((prev) =>
                                      prev.map((conn) =>
                                        conn.name === 'minecraft-bot'
                                          ? { ...conn, viewerActive: true }
                                          : conn
                                      )
                                    );
                                    // Refresh viewer status and force a re-render
                                    await checkViewerStatus();
                                    setViewerKey((prev) => prev + 1);
                                  } else {
                                    console.error(
                                      'Failed to start viewer:',
                                      result.message
                                    );
                                    if (result.details) {
                                      console.error('Details:', result.details);
                                    }
                                  }
                                } catch (error) {
                                  console.error(
                                    'Error starting viewer:',
                                    error
                                  );
                                }
                              }}
                              className={cn(
                                styles.startViewerBtn,
                                viewerStatus?.canStart
                                  ? styles.startViewerReady
                                  : styles.startViewerDisabled
                              )}
                              disabled={!viewerStatus?.canStart}
                              title={
                                viewerStatus?.reason || 'Start Minecraft viewer'
                              }
                            >
                              {viewerStatus?.canStart
                                ? 'Start Viewer'
                                : 'Viewer Not Ready'}
                            </button>
                          )}
                          <div className={styles.botStatusInfo}>
                            {botState ? (
                              <>
                                <div>
                                  Position: X: {botState.position?.x || 0}, Y:{' '}
                                  {botState.position?.y || 0}, Z:{' '}
                                  {botState.position?.z || 0}
                                </div>
                                <div>
                                  Health: {botState.health || 0}/20 | Food:{' '}
                                  {botState.food || 0}/20
                                </div>
                                <div>
                                  Time: Day{' '}
                                  {Math.floor((botState.time || 0) / 24000) + 1}
                                  ,{' '}
                                  {Math.floor(
                                    ((botState.time || 0) % 24000) / 1000
                                  )}
                                  :
                                  {(
                                    Math.floor((botState.time || 0) % 1000) /
                                    16.67
                                  )
                                    .toString()
                                    .padStart(2, '0')}
                                </div>
                                <div>
                                  Weather: {botState.weather || 'Unknown'}
                                </div>
                                {botState.inventory &&
                                  botState.inventory.length > 0 && (
                                    <div>
                                      Inventory: {botState.inventory.length}{' '}
                                      items
                                    </div>
                                  )}
                              </>
                            ) : (
                              <>
                                <div>Position: X: 0, Y: 0, Z: 0</div>
                                <div>Health: 0/20 | Food: 0/20</div>
                                <div>Time: Day 1, 0:00</div>
                                <div>Weather: Unknown</div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    <div className={styles.streamStatusBadge}>
                      <div
                        className={cn(
                          styles.statusDot,
                          botConnections.find((c) => c.name === 'minecraft-bot')
                            ?.viewerActive
                            ? styles.statusDotPulse
                            : botConnections.find(
                                  (c) => c.name === 'minecraft-bot'
                                )?.connected
                              ? styles.statusDotYellow
                              : styles.statusDotRed
                        )}
                      />
                      {botConnections.find((c) => c.name === 'minecraft-bot')
                        ?.viewerActive
                        ? 'VIEWER LIVE'
                        : botConnections.find((c) => c.name === 'minecraft-bot')
                              ?.connected
                          ? 'BOT CONNECTED'
                          : 'DISCONNECTED'}
                      <div className={styles.cogDot} />
                      <span className={styles.cogLabel}>COG</span>
                    </div>
                  </div>
                </Section>

                <InventoryDisplay
                  inventory={inventory}
                  selectedSlot={botState?.selectedSlot || 0}
                />
              </main>

              {/* Right: Cognitive Stream + Thought Input */}
              <aside className={styles.rightSidebar}>
                <Section
                  title="Cognitive Stream"
                  icon={<MessageSquare className={styles.icon4} />}
                  actions={<Pill>consciousness flow</Pill>}
                  className={styles.cognitiveSection}
                  fullHeight
                >
                  <div
                    className={styles.cognitiveContainer}
                    data-testid="cognitive-stream-container"
                  >
                    {(() => {
                      const STATUS_TYPES = [
                        'system_status',
                        'system_metric',
                        'system_log',
                        'environmental',
                        'status', // minecraft-interface sends type 'status' for health/hunger updates
                        'idle-reflection', // repetitive awareness messages
                      ];
                      const isStatusOrEnvironmental = (
                        t: (typeof thoughts)[0]
                      ) => {
                        // Check both thoughtType and type — either can indicate status/environmental
                        const thoughtType = (t.thoughtType || '').toLowerCase();
                        const rawType = (t.type || '').toLowerCase();
                        if (STATUS_TYPES.includes(thoughtType) || STATUS_TYPES.includes(rawType))
                          return true;
                        // Content fallback: status-like messages that lost their type
                        const text = (t.text || '').trim().toLowerCase();
                        return (
                          text.startsWith('health:') ||
                          text.startsWith('system status:') ||
                          text.startsWith('awareness:') ||
                          text === 'maintaining awareness of surroundings.' ||
                          /observing\s+environment\s+and\s+deciding/.test(text)
                        );
                      };
                      const sortByTime = (
                        a: (typeof thoughts)[0],
                        b: (typeof thoughts)[0]
                      ) => (a.ts || '').localeCompare(b.ts || '');
                      const cognitiveThoughts = thoughts
                        .filter((t) => !isStatusOrEnvironmental(t))
                        .sort(sortByTime);
                      const statusEnvironmentalThoughts = thoughts
                        .filter(isStatusOrEnvironmental)
                        .sort(sortByTime);

                      const renderThoughtCard = (
                        thought: (typeof thoughts)[0]
                      ) => {
                        // Determine styling based on thought type and provenance (dashboard-only)
                        // Intrusive thoughts use attribution 'self' for the bot; we show "intrusive" via thoughtType/provenance
                        const isIntrusive =
                          thought.provenance === 'intrusion' ||
                          thought.thoughtType === 'intrusive';
                        const isExternalChat =
                          thought.thoughtType === 'external_chat_in';
                        const isBotResponse =
                          thought.thoughtType === 'external_chat_out';
                        const isSocial = thought.thoughtType === 'social';
                        const isInternal =
                          thought.thoughtType === 'internal' ||
                          thought.thoughtType === 'reflection' ||
                          thought.thoughtType === 'idle-reflection' ||
                          thought.thoughtType === 'observation' ||
                          thought.thoughtType === 'planning';

                        // Cognitive system event types
                        const isSystemEvent =
                          thought.thoughtType === 'system_event';
                        const isThoughtProcessing =
                          thought.thoughtType === 'thought_processing';
                        const isTaskCreation =
                          thought.thoughtType === 'task_creation';
                        const isSocialConsideration =
                          thought.thoughtType === 'social_consideration';
                        const isSystemStatus =
                          thought.thoughtType === 'system_status';
                        const isSystemMetric =
                          thought.thoughtType === 'system_metric';
                        const isSystemLog =
                          thought.thoughtType === 'system_log';

                        let prefix = '';
                        let typeLabel = thought.thoughtType || thought.type;
                        let colorKey: ThoughtColorKey = 'default';

                        if (isIntrusive) {
                          colorKey = 'intrusive';
                          prefix = ' ';
                          typeLabel = 'intrusive';
                        } else if (isExternalChat) {
                          colorKey = 'chatIn';
                          prefix = ` ${thought.sender}: `;
                          typeLabel = 'chat_in';
                        } else if (isBotResponse) {
                          colorKey = 'chatOut';
                          prefix = ' ';
                          typeLabel = 'chat_out';
                        } else if (isSocial || isSocialConsideration) {
                          colorKey = 'social';
                          prefix = ' ';
                          typeLabel = isSocialConsideration
                            ? 'social_consideration'
                            : 'social';
                        } else if (isInternal) {
                          colorKey = 'internal';
                          prefix = ' ';
                          typeLabel = 'internal';
                        } else if (isSystemEvent) {
                          colorKey = 'systemEvent';
                          typeLabel = 'system_event';
                        } else if (isThoughtProcessing) {
                          colorKey = 'thoughtProcessing';
                          prefix = '⚡ ';
                          typeLabel = 'thought_processing';
                        } else if (isTaskCreation) {
                          colorKey = 'taskCreation';
                          typeLabel = 'task_creation';
                        } else if (
                          isSystemStatus ||
                          thought.thoughtType === 'status'
                        ) {
                          colorKey = 'status';
                          typeLabel = 'status';
                        } else if (isSystemMetric) {
                          colorKey = 'systemMetric';
                          prefix = '📈 ';
                          typeLabel = 'system_metric';
                        } else if (isSystemLog) {
                          colorKey = 'systemLog';
                          prefix = '📝 ';
                          typeLabel = 'system_log';
                        } else if (thought.thoughtType === 'environmental') {
                          colorKey = 'environmental';
                          typeLabel = 'environmental';
                        }

                        const colors = THOUGHT_COLORS[colorKey];

                        return (
                          <div
                            className={cn(
                              styles.thoughtCard,
                              colors.border,
                              colors.bg
                            )}
                          >
                            <div className={styles.thoughtHeader}>
                              <span className={styles.thoughtTypeLabel}>
                                {typeLabel}
                              </span>
                              <time className={styles.tabularNums}>
                                {formatTime(thought.ts)}
                              </time>
                            </div>
                            <p className={cn(styles.thoughtText, colors.text)}>
                              {prefix}
                              {thought.text}
                            </p>
                          </div>
                        );
                      };

                      return (
                        <Tabs
                          defaultValue="cognitive"
                          className={styles.cognitiveContainer}
                        >
                          <TabsList className={styles.innerTabsList}>
                            <TabsTrigger
                              value="cognitive"
                              className={styles.innerTabTrigger}
                            >
                              Cognitive Stream
                            </TabsTrigger>
                            <TabsTrigger
                              value="status"
                              className={styles.innerTabTrigger}
                            >
                              Status / Environmental
                            </TabsTrigger>
                          </TabsList>
                          <TabsContent
                            value="cognitive"
                            className={styles.innerTabContent}
                          >
                            {cognitiveThoughts.length > 0 ? (
                              <ScrollArea
                                className={styles.scrollFull}
                                ref={scrollAreaRef}
                              >
                                <div className={styles.thoughtsList}>
                                  {cognitiveThoughts.map((thought) => (
                                    <React.Fragment key={thought.id}>
                                      {renderThoughtCard(thought)}
                                    </React.Fragment>
                                  ))}
                                  <div ref={thoughtsEndRef} />
                                </div>
                              </ScrollArea>
                            ) : (
                              <EmptyState
                                icon={MessageSquare}
                                title="No thoughts yet"
                                description="Cognitive thoughts will appear here as the bot processes and reflects."
                              />
                            )}
                          </TabsContent>
                          <TabsContent
                            value="status"
                            className={styles.innerTabContent}
                          >
                            {statusEnvironmentalThoughts.length > 0 ? (
                              <ScrollArea className={styles.scrollFull}>
                                <div className={styles.thoughtsList}>
                                  {statusEnvironmentalThoughts.map(
                                    (thought) => (
                                      <React.Fragment key={thought.id}>
                                        {renderThoughtCard(thought)}
                                      </React.Fragment>
                                    )
                                  )}
                                </div>
                              </ScrollArea>
                            ) : (
                              <EmptyState
                                icon={Activity}
                                title="No status updates yet"
                                description="Health, hunger, and environmental updates will appear here."
                              />
                            )}
                          </TabsContent>
                        </Tabs>
                      );
                    })()}
                  </div>
                </Section>

                {/* Intrusive Thought Input */}
                <div className={styles.intrusiveInputWrapper}>
                  <div className={styles.intrusiveInputRow}>
                    <input
                      value={intrusion}
                      onChange={(e) => setIntrusion(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSubmitIntrusion();
                      }}
                      placeholder="Enter an intrusive thought… (appears as bot's own idea)"
                      className={styles.intrusiveInput}
                    />
                    <Button
                      onClick={handleSubmitIntrusion}
                      className={styles.injectBtn}
                    >
                      <UploadCloud className={styles.iconMr} />
                      Inject
                    </Button>
                  </div>
                  <div className={styles.intrusiveHint}>
                    Try: &quot;craft a wooden pickaxe&quot;, &quot;mine some
                    stone&quot;, &quot;explore the area&quot;, &quot;build a
                    house&quot;
                  </div>
                </div>
              </aside>
            </div>
          </TabsContent>

          {/* Evaluation Tab Content */}
          <TabsContent value="evaluation" className={styles.tabContentFull}>
            <EvaluationTab />
          </TabsContent>

          {/* Database Tab Content */}
          <TabsContent value="database" className={styles.tabContentFull}>
            <DatabasePanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default function ConsciousMinecraftDashboard() {
  return (
    <DashboardProvider>
      <ConsciousMinecraftDashboardContent />
    </DashboardProvider>
  );
}
