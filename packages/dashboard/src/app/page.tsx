'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity,
  BarChart3,
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
import { debugLog } from '@/lib/utils';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useCognitiveStream } from '@/hooks/use-cognitive-stream';
import { useBotStateSSE } from '@/hooks/use-bot-state-sse';
import { formatTime } from '@/lib/utils';
import { HudMeter } from '@/components/hud-meter';
import { Section } from '@/components/section';
import { Pill } from '@/components/pill';
import { EmptyState } from '@/components/empty-state';
import { InventoryDisplay } from '@/components/inventory-display';
import { EvaluationPanel } from '@/components/evaluation-panel';
import { DatabasePanel } from '@/components/database-panel';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DashboardProvider } from '@/contexts/dashboard-context';

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
          setHud({
            ts: new Date().toISOString(),
            vitals: {
              health: healthData.health,
              hunger: healthData.food,
              stamina: 100, // Default value
              sleep: 100, // Default value
            },
            intero: {
              stress: 20, // Default value
              focus: 80, // Default value
              curiosity: 75, // Default value
            },
            mood: 'neutral', // Default value
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
          // Update HUD with comprehensive data from periodic updates
          const hudData = message.data;
          setHud({
            ts: new Date().toISOString(),
            vitals: {
              health: hudData.health || 20,
              hunger: hudData.food || 20,
              stamina: (hudData.energy || 1) * 100, // Convert from 0-1 to 0-100
              sleep: 100, // Default value
            },
            intero: {
              stress: (1 - (hudData.safety || 0.9)) * 100, // Convert safety to stress (inverted)
              focus: (hudData.curiosity || 0.6) * 100, // Use curiosity as focus proxy
              curiosity: (hudData.curiosity || 0.6) * 100, // Direct curiosity mapping
            },
            mood:
              (hudData.safety || 0.9) > 0.8
                ? 'content'
                : (hudData.safety || 0.9) > 0.5
                  ? 'neutral'
                  : 'concerned',
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
            // Update HUD to show 0 health when bot dies
            setHud({
              ts: new Date().toISOString(),
              vitals: {
                health: 0,
                hunger: errorData.food || 0,
                stamina: 0,
                sleep: 100,
              },
              intero: {
                stress: 100, // High stress when dead
                focus: 0, // No focus when dead
                curiosity: 0, // No curiosity when dead
              },
              mood: 'dead',
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

          // Update HUD with respawned health
          setHud({
            ts: new Date().toISOString(),
            vitals: {
              health: respawnData.health || 20,
              hunger: respawnData.food || 20,
              stamina: 100,
              sleep: 100,
            },
            intero: {
              stress: 20,
              focus: 80,
              curiosity: 75,
            },
            mood: 'neutral',
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
    [setHud, setInventory, setBotState, setBotConnections, addThought]
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
        intero?: { stress?: number; focus?: number; curiosity?: number };
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
        };
        setHud({
          ts: new Date().toISOString(),
          vitals,
          intero,
          mood: d.mood ?? 'neutral',
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
        title: raw.title ?? 'Task',
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
          if (data.tasks && Array.isArray(data.tasks)) setTasks(data.tasks);
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
            text: t.content,
            type,
            attribution,
            thoughtType: t.metadata?.thoughtType || t.type,
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
    <div className="h-screen w-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-black text-zinc-100 overflow-hidden h-full">
      {/* Top Navigation */}
      <header className="flex items-center justify-between border-b border-zinc-900/80 bg-zinc-950/80 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/60">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded bg-emerald-500/10 grid place-items-center">
            <Brain className="size-4" />
          </div>
          <div className="font-semibold tracking-wide">Cognitive Stream</div>
          <nav className="ml-6 hidden md:flex items-center gap-4 text-sm text-zinc-300">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="w-auto"
            >
              <TabsList className="bg-zinc-900/50">
                <TabsTrigger value="live" className="hover:text-zinc-100">
                  Live
                </TabsTrigger>
                <TabsTrigger value="evaluation" className="hover:text-zinc-100">
                  Evaluation
                </TabsTrigger>
                <TabsTrigger value="database" className="hover:text-zinc-100">
                  Database
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="bg-zinc-900 border-zinc-800 hover:bg-zinc-800/80"
          >
            <Search className="size-4 mr-2" />
            Search
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="bg-zinc-900 border-zinc-800 hover:bg-zinc-800/80"
            onClick={() => setIsLive(!isLive)}
          >
            {isLive ? (
              <PauseCircle className="size-4 mr-2" />
            ) : (
              <PlayCircle className="size-4 mr-2" />
            )}
            {isLive ? 'Pause' : 'Go Live'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="bg-zinc-900 border-zinc-800 hover:bg-zinc-800/80"
            onClick={() => {
              // Refresh bot state data
              botStateWebSocket.reconnect();
              setViewerKey((prev) => prev + 1);
            }}
          >
            <RefreshCw className="size-4 mr-2" />
            Refresh
          </Button>
          <div className="flex items-center gap-1 text-xs">
            <div
              className={`size-2 rounded-full ${botStateWebSocket.isConnected ? 'bg-green-500' : botStateWebSocket.error ? 'bg-red-500' : 'bg-yellow-500'}`}
            />
            <span className="text-zinc-400">Bot State</span>
            {botStateWebSocket.error && (
              <button
                onClick={() => {
                  botStateWebSocket.reconnect();
                }}
                className="ml-2 text-xs text-zinc-400 hover:text-zinc-200 underline"
              >
                Reconnect
              </button>
            )}
          </div>
        </div>
      </header>

      {/* HUD Bar */}
      <div className="border-b border-zinc-900/80 bg-zinc-950/70 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/50">
        {hud ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
              <HudMeter
                label="Health"
                value={((hud.vitals.health || 0) / 20) * 100}
              />
              <HudMeter
                label="Hunger"
                value={((hud.vitals.hunger || 0) / 20) * 100}
              />
              <HudMeter label="Stamina" value={hud.vitals.stamina || 0} />
              <HudMeter label="Sleep" value={hud.vitals.sleep || 0} />
              <HudMeter
                label="Stress"
                value={hud.intero.stress || 0}
                hint="lower is better"
              />
              <HudMeter label="Focus" value={hud.intero.focus || 0} />
              <HudMeter label="Curiosity" value={hud.intero.curiosity || 0} />
            </div>
            <div className="mt-1 text-xs text-zinc-400">
              Mood: <span className="text-zinc-200">{hud.mood}</span>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center py-4">
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <div className="size-2 rounded-full bg-zinc-600 animate-pulse" />
              <span>Waiting for HUD data...</span>
            </div>
          </div>
        )}
      </div>

      {/* Main Content with Tabs */}
      <div className="h-[calc(100vh-136px)]">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
          <TabsContent value="live" className="h-full mt-0">
            <div className="grid h-full grid-cols-12 gap-3 p-3">
              {/* Left: Tasks, Planner, Reflective Notes, Environment, Events, Memories */}
              <aside className="col-span-12 md:col-span-3 flex flex-col gap-3 overflow-auto">
                <Section title="Tasks" icon={<ListChecks className="size-4" />}>
                  {tasks.length > 0 ? (
                    <div className="flex flex-col gap-3">
                      {tasks.map((task) => (
                        <div
                          key={task.id}
                          className="rounded-xl border border-zinc-800 bg-zinc-950 p-3"
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-medium text-zinc-200">
                              {task.title}
                            </div>
                            <Pill>{task.source}</Pill>
                          </div>
                          <div className="mt-2 h-1.5 w-full rounded bg-zinc-800">
                            <div
                              className="h-1.5 rounded bg-sky-500 transition-all duration-300"
                              style={{
                                width: `${Math.round(task.progress * 100)}%`,
                              }}
                            />
                          </div>
                          {task.requirement && (
                            <div className="mt-2 text-xs text-zinc-400">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-zinc-300">
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
                                <div className="mt-1 truncate text-zinc-500">
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
                                  <div className="mt-2">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                                        Requirement Progress
                                      </span>
                                      <span className="text-[10px] text-zinc-400">
                                        {pct}%
                                      </span>
                                    </div>
                                    <div className="h-1 w-full rounded bg-zinc-800">
                                      <div
                                        className="h-1 rounded bg-emerald-500 transition-all duration-300"
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                          {task.steps && (
                            <ul className="mt-2 space-y-1 text-sm text-zinc-300">
                              {task.steps.map((step) => (
                                <li
                                  key={step.id}
                                  className="flex items-center gap-2"
                                >
                                  <input
                                    type="checkbox"
                                    checked={step.done}
                                    onChange={() => {}}
                                    className="size-3"
                                  />
                                  <span
                                    className={
                                      step.done
                                        ? 'line-through text-zinc-500'
                                        : ''
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
                      description="Tasks will appear here when the bot is actively planning or executing goals."
                    />
                  )}
                </Section>

                <Section
                  title="Current Status"
                  icon={<Activity className="size-4" />}
                  tight
                >
                  {plannerData ? (
                    <div className="space-y-3">
                      {plannerData.currentAction && (
                        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-medium text-zinc-200">
                              Current Action
                            </h4>
                            <span className="text-xs text-zinc-500">
                              {Math.round(
                                (plannerData.currentAction.progress || 0) * 100
                              )}
                              %
                            </span>
                          </div>
                          <p className="text-xs text-zinc-400">
                            {plannerData.currentAction.name}
                            {plannerData.currentAction.target && (
                              <span className="text-zinc-500">
                                {' '}
                                → {plannerData.currentAction.target}
                              </span>
                            )}
                          </p>
                        </div>
                      )}

                      {plannerData.planQueue.length > 0 && (
                        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                          <h4 className="text-sm font-medium text-zinc-200 mb-2">
                            Upcoming Plans
                          </h4>
                          <div className="space-y-1">
                            {plannerData.planQueue.slice(0, 2).map((plan) => (
                              <div
                                key={plan.id}
                                className="text-xs text-zinc-400"
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
                      className="p-3"
                    />
                  )}
                </Section>

                <Section
                  title="Reflective Notes"
                  icon={<FileText className="size-4" />}
                  tight
                >
                  {notes.length > 0 ? (
                    <div className="flex flex-col gap-2 p-2">
                      {notes.slice(0, 5).map((note) => (
                        <div
                          key={note.id}
                          className="rounded-lg border border-zinc-800 bg-zinc-950 p-2.5"
                        >
                          <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                            <Pill>{note.type}</Pill>
                            <time className="tabular-nums">
                              {formatTime(note.ts)}
                            </time>
                          </div>
                          {note.title && (
                            <div className="text-xs font-medium text-zinc-200 mb-0.5">
                              {note.title}
                            </div>
                          )}
                          <p className="text-xs text-zinc-300 overflow-hidden text-ellipsis line-clamp-2">
                            {note.content}
                          </p>
                          <div className="flex items-center justify-between mt-1.5">
                            <Pill>{note.source}</Pill>
                            <span className="text-[10px] text-zinc-500">
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
                      className="p-3"
                    />
                  )}
                </Section>

                <Section title="Environment" icon={<Map className="size-4" />}>
                  {environment ? (
                    <div className="grid grid-cols-2 gap-2 text-sm text-zinc-300">
                      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                        <span className="text-zinc-500">Biome</span>
                        <div>{environment.biome}</div>
                      </div>
                      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                        <span className="text-zinc-500">Weather</span>
                        <div>{environment.weather}</div>
                      </div>
                      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                        <span className="text-zinc-500">Time</span>
                        <div>{environment.timeOfDay}</div>
                      </div>
                      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                        <span className="text-zinc-500">Nearby</span>
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

                <Section title="Events" icon={<History className="size-4" />}>
                  {events.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {events
                        .slice(-8)
                        .reverse()
                        .map((event) => (
                          <div
                            key={event.id}
                            className="rounded-lg border border-zinc-800 bg-zinc-950 p-2.5"
                          >
                            <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                              <Pill>{event.kind}</Pill>
                              <time className="tabular-nums">
                                {formatTime(event.ts)}
                              </time>
                            </div>
                            <p className="text-xs text-zinc-300 overflow-hidden text-ellipsis line-clamp-2">
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

                <Section title="Memories" icon={<Brain className="size-4" />}>
                  {memories.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {memories
                        .slice(-6)
                        .reverse()
                        .map((memory) => (
                          <div
                            key={memory.id}
                            className="rounded-lg border border-zinc-800 bg-zinc-950 p-2.5"
                          >
                            <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                              <Pill>{memory.type}</Pill>
                              <time className="tabular-nums">
                                {formatTime(memory.ts)}
                              </time>
                            </div>
                            <p className="text-xs text-zinc-300 overflow-hidden text-ellipsis line-clamp-2">
                              {memory.text}
                            </p>
                            {memory.score != null && (
                              <div className="mt-1 text-[10px] text-zinc-500">
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
              <main className="col-span-12 md:col-span-6 flex flex-col gap-3 overflow-hidden">
                <Section
                  title="Live Stream"
                  icon={<Activity className="size-4" />}
                >
                  <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
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
                          className="absolute inset-0 w-full h-full border-0"
                          title="Minecraft Bot View"
                          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        />
                        <div className="absolute right-3 top-3 flex items-center gap-2">
                          <button
                            onClick={async () => {
                              setViewerKey((prev) => prev + 1);
                              // Also refresh viewer status
                              await checkViewerStatus();
                            }}
                            className="rounded-md bg-black/60 px-2 py-1 text-xs text-zinc-300 hover:bg-black/80"
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
                            className="rounded-md bg-black/60 px-2 py-1 text-xs text-zinc-300 hover:bg-black/80"
                          >
                            Full Screen
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                const response = await fetch(
                                  'http://localhost:3005/stop-viewer',
                                  {
                                    method: 'POST',
                                  }
                                );
                                const result = await response.json();
                                if (result.success) {
                                  // Update viewer status
                                  setBotConnections((prev) =>
                                    prev.map((conn) =>
                                      conn.name === 'minecraft-bot'
                                        ? { ...conn, viewerActive: false }
                                        : conn
                                    )
                                  );
                                  // Refresh viewer status
                                  await checkViewerStatus();
                                }
                              } catch (error) {
                                console.error('Error stopping viewer:', error);
                              }
                            }}
                            className="rounded-md bg-red-600/60 px-2 py-1 text-xs text-zinc-300 hover:bg-red-600/80"
                          >
                            Stop Viewer
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center p-6">
                          <div className="mb-4 rounded-full bg-zinc-800/50 p-3 inline-block">
                            <Activity className="size-6 text-zinc-400" />
                          </div>
                          <h3 className="text-sm font-medium text-zinc-200 mb-2">
                            Bot Status
                          </h3>
                          <p className="text-xs text-zinc-400 mb-4">
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
                              className={`rounded-md px-3 py-1 text-xs ${
                                viewerStatus?.canStart
                                  ? 'bg-sky-600 text-white hover:bg-sky-700'
                                  : 'bg-gray-400 text-gray-200 cursor-not-allowed'
                              }`}
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
                          <div className="text-xs text-zinc-500 space-y-1">
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
                    <div className="absolute left-3 top-3 flex items-center gap-2 rounded-md bg-black/60 px-2 py-1 text-xs">
                      <div
                        className={`size-2 rounded-full ${
                          botConnections.find((c) => c.name === 'minecraft-bot')
                            ?.viewerActive
                            ? 'bg-green-500 animate-pulse'
                            : botConnections.find(
                                  (c) => c.name === 'minecraft-bot'
                                )?.connected
                              ? 'bg-yellow-500'
                              : 'bg-red-500'
                        }`}
                      />
                      {botConnections.find((c) => c.name === 'minecraft-bot')
                        ?.viewerActive
                        ? 'VIEWER LIVE'
                        : botConnections.find((c) => c.name === 'minecraft-bot')
                              ?.connected
                          ? 'BOT CONNECTED'
                          : 'DISCONNECTED'}
                      <div className="size-2 rounded-full bg-zinc-600" />
                      <span className="text-zinc-400">COG</span>
                    </div>
                  </div>
                </Section>

                <InventoryDisplay
                  inventory={inventory}
                  selectedSlot={botState?.selectedSlot || 0}
                />
              </main>

              {/* Right: Cognitive Stream + Thought Input */}
              <aside className="col-span-12 md:col-span-3 flex flex-col gap-3 h-full overflow-hidden">
                <Section
                  title="Cognitive Stream"
                  icon={<MessageSquare className="size-4" />}
                  actions={<Pill>consciousness flow</Pill>}
                  className="flex-1 flex flex-col min-h-0"
                  fullHeight
                >
                  <div
                    className="flex-1 min-h-0 flex flex-col overflow-hidden"
                    data-testid="cognitive-stream-container"
                  >
                    {(() => {
                      const STATUS_TYPES = [
                        'system_status',
                        'system_metric',
                        'system_log',
                        'environmental',
                        'status', // minecraft-interface sends type 'status' for health/hunger updates
                      ];
                      const isStatusOrEnvironmental = (
                        t: (typeof thoughts)[0]
                      ) => {
                        const kind = (
                          t.thoughtType ||
                          t.type ||
                          ''
                        ).toLowerCase();
                        if (STATUS_TYPES.includes(kind)) return true;
                        // Content fallback: status-like messages that lost their type
                        const text = (t.text || '').trim().toLowerCase();
                        return (
                          text.startsWith('health:') ||
                          text.startsWith('system status:') ||
                          /observing\s+environment\s+and\s+deciding/.test(text)
                        );
                      };
                      const cognitiveThoughts = thoughts.filter(
                        (t) => !isStatusOrEnvironmental(t)
                      );
                      const statusEnvironmentalThoughts = thoughts.filter(
                        isStatusOrEnvironmental
                      );

                      const renderThoughtCard = (
                        thought: (typeof thoughts)[0]
                      ) => {
                        // Determine styling based on thought type and attribution
                        const isIntrusive = thought.attribution === 'intrusive';
                        const isExternalChat =
                          thought.thoughtType === 'external_chat_in';
                        const isBotResponse =
                          thought.thoughtType === 'external_chat_out';
                        const isSocial = thought.thoughtType === 'social';
                        const isInternal =
                          thought.thoughtType === 'internal' ||
                          thought.thoughtType === 'reflection' ||
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

                        let borderColor = 'border-zinc-800';
                        let bgColor = 'bg-zinc-950';
                        let prefix = '';
                        let typeLabel = thought.thoughtType || thought.type;
                        let textColor = 'text-zinc-200';
                        // let iconColor = 'text-zinc-400';

                        if (isIntrusive) {
                          borderColor = 'border-purple-600/50';
                          bgColor = 'bg-purple-950/20';
                          prefix = ' ';
                          typeLabel = 'intrusive';
                          textColor = 'text-purple-200';
                          // iconColor = 'text-purple-400';
                        } else if (isExternalChat) {
                          borderColor = 'border-blue-600/50';
                          bgColor = 'bg-blue-950/20';
                          prefix = ` ${thought.sender}: `;
                          typeLabel = 'chat_in';
                          textColor = 'text-blue-200';
                          // iconColor = 'text-blue-400';
                        } else if (isBotResponse) {
                          borderColor = 'border-green-600/50';
                          bgColor = 'bg-green-950/20';
                          prefix = ' ';
                          typeLabel = 'chat_out';
                          textColor = 'text-green-200';
                          // iconColor = 'text-green-400';
                        } else if (isSocial || isSocialConsideration) {
                          borderColor = 'border-orange-600/50';
                          bgColor = 'bg-orange-950/20';
                          prefix = ' ';
                          typeLabel = isSocialConsideration
                            ? 'social_consideration'
                            : 'social';
                          textColor = 'text-orange-200';
                          // iconColor = 'text-orange-400';
                        } else if (isInternal) {
                          borderColor = 'border-yellow-600/50';
                          bgColor = 'bg-yellow-950/20';
                          prefix = ' ';
                          typeLabel = 'internal';
                          textColor = 'text-yellow-200';
                          // iconColor = 'text-yellow-400';
                        } else if (isSystemEvent) {
                          borderColor = 'border-indigo-600/50';
                          bgColor = 'bg-indigo-950/20';
                          prefix = '🔄 ';
                          typeLabel = 'system_event';
                          textColor = 'text-indigo-200';
                          // iconColor = 'text-indigo-400';
                        } else if (isThoughtProcessing) {
                          borderColor = 'border-cyan-600/50';
                          bgColor = 'bg-cyan-950/20';
                          prefix = '⚡ ';
                          typeLabel = 'thought_processing';
                          textColor = 'text-cyan-200';
                          // iconColor = 'text-cyan-400';
                        } else if (isTaskCreation) {
                          borderColor = 'border-emerald-600/50';
                          bgColor = 'bg-emerald-950/20';
                          prefix = '✅ ';
                          typeLabel = 'task_creation';
                          textColor = 'text-emerald-200';
                          // iconColor = 'text-emerald-400';
                        } else if (isSystemStatus) {
                          borderColor = 'border-slate-600/50';
                          bgColor = 'bg-slate-950/20';
                          prefix = '';
                          typeLabel = 'status';
                          textColor = 'text-slate-200';
                          // iconColor = 'text-slate-400';
                        } else if (thought.thoughtType === 'status') {
                          // minecraft-interface health/hunger updates (type: 'status')
                          borderColor = 'border-slate-600/50';
                          bgColor = 'bg-slate-950/20';
                          prefix = '';
                          typeLabel = 'status';
                          textColor = 'text-slate-200';
                        } else if (isSystemMetric) {
                          borderColor = 'border-pink-600/50';
                          bgColor = 'bg-pink-950/20';
                          prefix = '📈 ';
                          typeLabel = 'system_metric';
                          textColor = 'text-pink-200';
                          // iconColor = 'text-pink-400';
                        } else if (isSystemLog) {
                          borderColor = 'border-gray-600/50';
                          bgColor = 'bg-gray-950/20';
                          prefix = '📝 ';
                          typeLabel = 'system_log';
                          textColor = 'text-gray-200';
                          // iconColor = 'text-gray-400';
                        } else if (thought.thoughtType === 'environmental') {
                          borderColor = 'border-teal-600/50';
                          bgColor = 'bg-teal-950/20';
                          prefix = '';
                          typeLabel = 'environmental';
                          textColor = 'text-teal-200';
                        }

                        return (
                          <div
                            className={`rounded-xl border ${borderColor} ${bgColor} p-2.5`}
                          >
                            <div className="flex items-center justify-between text-[11px] text-zinc-400">
                              <span className="uppercase tracking-wide">
                                {typeLabel}
                              </span>
                              <time className="tabular-nums">
                                {formatTime(thought.ts)}
                              </time>
                            </div>
                            <p className={`mt-1 text-sm ${textColor}`}>
                              {prefix}
                              {thought.text}
                            </p>
                          </div>
                        );
                      };

                      return (
                        <Tabs
                          defaultValue="cognitive"
                          className="flex-1 flex flex-col min-h-0 overflow-hidden"
                        >
                          <TabsList className="w-full grid grid-cols-2 shrink-0 mb-2 bg-zinc-900/80">
                            <TabsTrigger value="cognitive" className="text-xs">
                              Cognitive Stream
                            </TabsTrigger>
                            <TabsTrigger value="status" className="text-xs">
                              Status / Environmental
                            </TabsTrigger>
                          </TabsList>
                          <TabsContent
                            value="cognitive"
                            className="flex-1 min-h-0 mt-0 overflow-hidden data-[state=inactive]:hidden flex flex-col"
                          >
                            {cognitiveThoughts.length > 0 ? (
                              <ScrollArea
                                className="h-full min-h-0 flex-1"
                                ref={scrollAreaRef}
                              >
                                <div className="flex flex-col gap-2 pr-1 pb-2">
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
                            className="flex-1 min-h-0 mt-0 overflow-hidden data-[state=inactive]:hidden flex flex-col"
                          >
                            {statusEnvironmentalThoughts.length > 0 ? (
                              <ScrollArea className="h-full min-h-0 flex-1">
                                <div className="flex flex-col gap-2 pr-1 pb-2">
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
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={intrusion}
                      onChange={(e) => setIntrusion(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSubmitIntrusion();
                      }}
                      placeholder="Enter an intrusive thought… (appears as bot's own idea)"
                      className="flex-1 rounded-xl bg-zinc-900 px-3 py-2 text-sm outline-none placeholder:text-zinc-600"
                    />
                    <Button
                      onClick={handleSubmitIntrusion}
                      className="bg-emerald-600/90 hover:bg-emerald-600 border-zinc-800"
                    >
                      <UploadCloud className="size-4 mr-2" />
                      Inject
                    </Button>
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500">
                    Try: &quot;craft a wooden pickaxe&quot;, &quot;mine some
                    stone&quot;, &quot;explore the area&quot;, &quot;build a
                    house&quot;
                  </div>
                </div>
              </aside>
            </div>
          </TabsContent>

          {/* Evaluation Tab Content */}
          <TabsContent value="evaluation" className="h-full mt-0">
            <div className="grid h-full grid-cols-12 gap-3 p-3">
              {/* Left: Evaluation Panel */}
              <aside className="col-span-12 md:col-span-4 flex flex-col gap-3 overflow-auto">
                <EvaluationPanel />
              </aside>

              {/* Center: Evaluation Details */}
              <main className="col-span-12 md:col-span-8 flex flex-col gap-3 overflow-hidden">
                <Section
                  title="Evaluation Overview"
                  icon={<BarChart3 className="size-4" />}
                >
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
                    <div className="text-center">
                      <BarChart3 className="size-12 text-zinc-600 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-zinc-200 mb-2">
                        Evaluation Dashboard
                      </h3>
                      <p className="text-sm text-zinc-400">
                        Real-time evaluation metrics and run history are
                        available in the Evaluation Panel on the left. Select a
                        run to see detailed results here.
                      </p>
                    </div>
                  </div>
                </Section>
              </main>
            </div>
          </TabsContent>

          {/* Database Tab Content */}
          <TabsContent value="database" className="h-full mt-0">
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
