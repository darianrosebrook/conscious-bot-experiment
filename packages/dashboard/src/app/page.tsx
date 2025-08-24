'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Brain,
  FileText,
  Flag,
  History,
  ListChecks,
  Map,
  MessageSquare,
  PauseCircle,
  PlayCircle,
  Search,
  UploadCloud,
} from 'lucide-react';

import { useDashboardStore } from '@/stores/dashboard-store';
import { useSSE } from '@/hooks/use-sse';
import { submitIntrusiveThought } from '@/lib/api';
import { generateId, formatTime } from '@/lib/utils';
import { HudMeter } from '@/components/hud-meter';
import { Section } from '@/components/section';
import { Pill } from '@/components/pill';
import { EmptyState } from '@/components/empty-state';
import { InventoryDisplay } from '@/components/inventory-display';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Thought, HudData } from '@/types';

interface BotState {
  position?: {
    x: number;
    y: number;
    z: number;
  };
  health?: number;
  food?: number;
  inventory?: Array<{
    name: string;
    count: number;
    displayName: string;
  }>;
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
export default function ConsciousMinecraftDashboard() {
  const {
    isLive,
    hud,
    thoughts,
    tasks,
    environment,
    inventory,
    setIsLive,
    setHud,
    addThought,
    setTasks,
    setEnvironment,
    setInventory,
  } = useDashboardStore();

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
  const thoughtsEndRef = useRef<HTMLDivElement>(null);

  // SSE connections for real-time data
  const hudSSE = useSSE({
    url: '/api/ws/hud',
    onMessage: (data) => {
      // Type-safe HUD data handling
      if (
        data &&
        typeof data === 'object' &&
        'vitals' in data &&
        'intero' in data
      ) {
        setHud(data as HudData);
      }
    },
  });

  const cotSSE = useSSE({
    url: '/api/ws/cot',
    onMessage: (data) => {
      addThought(data as Thought);
    },
  });

  // Auto-scroll to bottom of thoughts
  useEffect(() => {
    thoughtsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thoughts]);

  // Fetch initial data from bot systems
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // Fetch tasks
        const tasksRes = await fetch('/api/tasks');
        if (tasksRes.ok) {
          const tasksData = await tasksRes.json();
          setTasks(tasksData.tasks || []);
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

        // Fetch bot state and health (includes viewer info)
        const [botRes, healthRes] = await Promise.allSettled([
          fetch('http://localhost:3005/state'),
          fetch('http://localhost:3005/health'),
        ]);

        if (botRes.status === 'fulfilled' && botRes.value.ok) {
          const botData = await botRes.value.json();
          setBotState(botData.data);
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
        }
      } catch (error) {
        // Silently handle errors
      }
    };

    fetchInitialData();
  }, [setTasks, setEnvironment, setInventory]);

  // Periodic refresh of bot state and connection status
  useEffect(() => {
    const refreshBotState = async () => {
      try {
        // Fetch inventory
        const inventoryRes = await fetch('/api/inventory');
        if (inventoryRes.ok) {
          const inventoryData = await inventoryRes.json();
          if (inventoryData.success) {
            setInventory(inventoryData.inventory);
          }
        }

        const [botRes, healthRes] = await Promise.allSettled([
          fetch('http://localhost:3005/state'),
          fetch('http://localhost:3005/health'),
        ]);

        if (botRes.status === 'fulfilled' && botRes.value.ok) {
          const botData = await botRes.value.json();
          setBotState(botData.data);
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

    // Refresh every 30 seconds (reduced from 5 seconds to reduce API spam)
    const interval = setInterval(refreshBotState, 30000);
    return () => clearInterval(interval);
  }, [setInventory]);

  /**
   * Submit an intrusive thought to the bot
   */
  const handleSubmitIntrusion = async () => {
    const text = intrusion.trim();
    if (!text) return;

    // Add immediate feedback thought
    const feedbackThought: Thought = {
      id: generateId(),
      ts: new Date().toISOString(),
      text: `💭 Processing: "${text}"`,
      type: 'intrusion',
    };
    addThought(feedbackThought);

    try {
      const response = await submitIntrusiveThought({ text });
      if (response.accepted) {
        const thought: Thought = {
          id: generateId(),
          ts: new Date().toISOString(),
          text: `✅ Intrusive thought processed: "${text}"`,
          type: 'intrusion',
        };
        addThought(thought);
        setIntrusion('');
        
        // Add a follow-up thought about what the bot might do
        setTimeout(() => {
          const followUpThought: Thought = {
            id: generateId(),
            ts: new Date().toISOString(),
            text: `🤔 Considering how to act on: "${text}"`,
            type: 'reflection',
          };
          addThought(followUpThought);
        }, 1000);
      }
    } catch (error) {
      const errorThought: Thought = {
        id: generateId(),
        ts: new Date().toISOString(),
        text: `❌ Failed to process intrusive thought: "${text}"`,
        type: 'intrusion',
      };
      addThought(errorThought);
      console.error('Error submitting intrusive thought:', error);
    }
  };

  return (
    <div className="h-screen w-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-black text-zinc-100 overflow-hidden">
      {/* Top Navigation */}
      <header className="flex items-center justify-between border-b border-zinc-900/80 bg-zinc-950/80 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/60">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded bg-emerald-500/10 grid place-items-center">
            <Brain className="size-4" />
          </div>
          <div className="font-semibold tracking-wide">Cognitive Stream</div>
          <nav className="ml-6 hidden md:flex items-center gap-4 text-sm text-zinc-300">
            <Tabs defaultValue="live" className="w-auto">
              <TabsList className="bg-zinc-900/50">
                <TabsTrigger value="live" className="hover:text-zinc-100">
                  Live
                </TabsTrigger>
                <TabsTrigger value="memories" className="hover:text-zinc-100">
                  Memories
                </TabsTrigger>
                <TabsTrigger value="events" className="hover:text-zinc-100">
                  Events
                </TabsTrigger>
                <TabsTrigger value="settings" className="hover:text-zinc-100">
                  Settings
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
          <div className="flex items-center gap-1 text-xs">
            <div
              className={`size-2 rounded-full ${hudSSE.isConnected ? 'bg-green-500' : hudSSE.error ? 'bg-red-500' : 'bg-yellow-500'}`}
            />
            <span className="text-zinc-400">HUD</span>
            <div
              className={`size-2 rounded-full ${cotSSE.isConnected ? 'bg-green-500' : cotSSE.error ? 'bg-red-500' : 'bg-yellow-500'}`}
            />
            <span className="text-zinc-400">CoT</span>
            {(hudSSE.error || cotSSE.error) && (
              <button
                onClick={() => {
                  hudSSE.reconnect();
                  cotSSE.reconnect();
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
              <HudMeter label="Health" value={(hud.vitals.health / 20) * 100} />
              <HudMeter label="Hunger" value={(hud.vitals.hunger / 20) * 100} />
              <HudMeter label="Stamina" value={hud.vitals.stamina} />
              <HudMeter label="Sleep" value={hud.vitals.sleep} />
              <HudMeter
                label="Stress"
                value={hud.intero.stress}
                hint="lower is better"
              />
              <HudMeter label="Focus" value={hud.intero.focus} />
              <HudMeter label="Curiosity" value={hud.intero.curiosity} />
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

      {/* Main 3-column Layout */}
      <div className="grid h-[calc(100vh-136px)] grid-cols-12 gap-3 p-3">
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
                        style={{ width: `${Math.round(task.progress * 100)}%` }}
                      />
                    </div>
                    {task.steps && (
                      <ul className="mt-2 space-y-1 text-sm text-zinc-300">
                        {task.steps.map((step) => (
                          <li key={step.id} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={step.done}
                              onChange={() => {}}
                              className="size-3"
                            />
                            <span
                              className={
                                step.done ? 'line-through text-zinc-500' : ''
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

          <Section title="Planner" icon={<Flag className="size-4" />} tight>
            <EmptyState
              icon={Flag}
              title="No planner data"
              description="Planner information will appear here when the bot is actively planning."
              className="p-3"
            />
          </Section>

          <Section
            title="Reflective Notes"
            icon={<FileText className="size-4" />}
            tight
          >
            <EmptyState
              icon={FileText}
              title="No reflective notes"
              description="Reflective insights will appear here as the bot processes experiences."
              className="p-3"
            />
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
            <EmptyState
              icon={History}
              title="No events recorded"
              description="Events will appear here as the bot interacts with the world."
            />
          </Section>

          <Section title="Memories" icon={<Brain className="size-4" />}>
            <EmptyState
              icon={Brain}
              title="No memories available"
              description="Memories will appear here as the bot forms and recalls experiences."
            />
          </Section>
        </aside>

        {/* Center: Live Stream + Inventory */}
        <main className="col-span-12 md:col-span-6 flex flex-col gap-3 overflow-hidden">
          <Section title="Live Stream" icon={<Activity className="size-4" />}>
            <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
              {botConnections.find((c) => c.name === 'minecraft-bot')
                ?.viewerActive ? (
                <>
                  <iframe
                    key={viewerKey}
                    src={
                      botConnections.find((c) => c.name === 'minecraft-bot')
                        ?.viewerUrl || 'http://localhost:3006'
                    }
                    className="absolute inset-0 w-full h-full border-0"
                    title="Minecraft Bot View"
                    sandbox="allow-scripts allow-same-origin"
                  />
                  <div className="absolute right-3 top-3 flex items-center gap-2">
                    <button
                      onClick={() => setViewerKey((prev) => prev + 1)}
                      className="rounded-md bg-black/60 px-2 py-1 text-xs text-zinc-300 hover:bg-black/80"
                    >
                      Refresh Viewer
                    </button>
                    <button
                      onClick={() => {
                        window.open(
                          botConnections.find((c) => c.name === 'minecraft-bot')
                            ?.viewerUrl || 'http://localhost:3006',
                          '_blank'
                        );
                      }}
                      className="rounded-md bg-black/60 px-2 py-1 text-xs text-zinc-300 hover:bg-black/80"
                    >
                      Full Screen
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
                      {botConnections.find((c) => c.name === 'minecraft-bot')
                        ?.connected
                        ? 'Bot connected, starting viewer...'
                        : 'Waiting for Minecraft bot to connect...'}
                    </p>
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
                            {Math.floor((botState.time || 0) / 24000) + 1},{' '}
                            {Math.floor(((botState.time || 0) % 24000) / 1000)}:
                            {(Math.floor((botState.time || 0) % 1000) / 16.67)
                              .toString()
                              .padStart(2, '0')}
                          </div>
                          <div>Weather: {botState.weather || 'Unknown'}</div>
                          {botState.inventory &&
                            botState.inventory.length > 0 && (
                              <div>
                                Inventory: {botState.inventory.length} items
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
                      : botConnections.find((c) => c.name === 'minecraft-bot')
                            ?.connected
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
              </div>
            </div>
          </Section>

          <InventoryDisplay
            inventory={inventory}
            selectedSlot={botState?.selectedSlot || 0}
          />
        </main>

        {/* Right: Cognitive Stream + Thought Input */}
        <aside className="col-span-12 md:col-span-3 flex flex-col gap-3 overflow-auto">
          <Section
            title="Cognitive Stream"
            icon={<MessageSquare className="size-4" />}
            actions={<Pill>attribution hidden</Pill>}
          >
            {thoughts.length > 0 ? (
              <ScrollArea className="max-h-[38vh]">
                <div className="flex flex-col gap-2 pr-1">
                  {thoughts.map((thought) => (
                    <div
                      key={thought.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-950 p-2.5"
                    >
                      <div className="flex items-center justify-between text-[11px] text-zinc-400">
                        <span className="uppercase tracking-wide">
                          {thought.type === 'intrusion'
                            ? 'thought'
                            : thought.type}
                        </span>
                        <time className="tabular-nums">
                          {formatTime(thought.ts)}
                        </time>
                      </div>
                      <p className="mt-1 text-sm text-zinc-200">
                        {thought.text}
                      </p>
                    </div>
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
                placeholder="Enter a thought… (appears to the bot as its own)"
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
              Try: "craft a wooden pickaxe", "mine some stone", "explore the area", "build a house"
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
