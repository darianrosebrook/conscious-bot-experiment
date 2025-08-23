'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Brain,
  Compass,
  Eye,
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
import { useWebSocket } from '@/hooks/use-websocket';
import { useToast } from '@/hooks/use-toast';
import { submitIntrusiveThought } from '@/lib/api';
import { generateId, formatTime } from '@/lib/utils';
import { HudMeter } from '@/components/hud-meter';
import { Section } from '@/components/section';
import { Pill } from '@/components/pill';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Thought, HudData } from '@/types';

// Demo data - replace with actual data from WebSocket
const PLACEHOLDER_STREAM_SRC =
  'https://images.unsplash.com/photo-1606313564200-e75d5e30476f?q=80&w=2060&auto=format&fit=crop';

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
    setIsLive,
    setHud,
    addThought,
    setThoughts,
    setTasks,
    setEnvironment,
  } = useDashboardStore();

  const [intrusion, setIntrusion] = useState('');
  const thoughtsEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // WebSocket connections
  const { isConnected: hudConnected } = useWebSocket({
    url: 'ws://localhost:3000/api/ws/hud',
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
    onError: (error) => {
      toast({
        title: 'HUD Connection Error',
        description: 'Failed to connect to HUD data stream',
        variant: 'destructive',
      });
    },
  });

  const { isConnected: cotConnected } = useWebSocket({
    url: 'ws://localhost:3000/api/ws/cot',
    onMessage: (data) => {
      addThought(data as Thought);
    },
    onError: (error) => {
      toast({
        title: 'Thought Stream Error',
        description: 'Failed to connect to cognitive thought stream',
        variant: 'destructive',
      });
    },
  });

  // Auto-scroll to bottom of thoughts
  useEffect(() => {
    thoughtsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thoughts]);

  // Demo data initialization
  useEffect(() => {
    if (thoughts.length === 0) {
      setThoughts([
        {
          id: generateId(),
          ts: new Date().toISOString(),
          text: 'Scanning environment… plains biome detected; low mob density.',
          type: 'self',
        },
        {
          id: generateId(),
          ts: new Date().toISOString(),
          text: 'Hunger at 35%. Consider foraging or crafting.',
          type: 'reflection',
        },
      ]);
    }

    if (tasks.length === 0) {
      setTasks([
        {
          id: generateId(),
          title: 'Acquire food (forage/cook)',
          priority: 0.8,
          progress: 0.35,
          source: 'planner',
          steps: [
            { id: generateId(), label: 'Collect logs', done: true },
            { id: generateId(), label: 'Craft wooden tools', done: true },
            { id: generateId(), label: 'Hunt/harvest food', done: false },
          ],
        },
        {
          id: generateId(),
          title: 'Shelter before nightfall',
          priority: 0.6,
          progress: 0.1,
          source: 'goal',
          steps: [
            { id: generateId(), label: 'Find suitable site', done: false },
          ],
        },
      ]);
    }

    if (!hud) {
      setHud({
        ts: new Date().toISOString(),
        vitals: { health: 74, hunger: 35, stamina: 62, sleep: 28 },
        intero: { stress: 22, focus: 71, curiosity: 64 },
        mood: 'cautiously curious',
      });
    }

    if (!environment) {
      setEnvironment({
        biome: 'Plains',
        weather: 'Clear',
        timeOfDay: 'Midday',
        nearbyEntities: ['Cow ×2', 'Oak ×3'],
      });
    }
  }, [
    thoughts.length,
    tasks.length,
    hud,
    environment,
    setThoughts,
    setTasks,
    setHud,
    setEnvironment,
  ]);

  /**
   * Submit an intrusive thought to the bot
   */
  const handleSubmitIntrusion = async () => {
    const text = intrusion.trim();
    if (!text) return;

    try {
      const response = await submitIntrusiveThought({ text });
      if (response.accepted) {
        const thought: Thought = {
          id: generateId(),
          ts: new Date().toISOString(),
          text,
          type: 'intrusion',
        };
        addThought(thought);
        setIntrusion('');
        toast({
          title: 'Thought Injected',
          description: 'Your intrusive thought has been successfully injected',
          variant: 'success',
        });
      } else {
        toast({
          title: 'Thought Rejected',
          description:
            response.rationale || 'The thought was rejected by the system',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Submission Error',
        description: 'Failed to submit intrusive thought. Please try again.',
        variant: 'destructive',
      });
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
              className={`size-2 rounded-full ${hudConnected ? 'bg-green-500' : 'bg-red-500'}`}
            />
            <span className="text-zinc-400">HUD</span>
            <div
              className={`size-2 rounded-full ${cotConnected ? 'bg-green-500' : 'bg-red-500'}`}
            />
            <span className="text-zinc-400">CoT</span>
          </div>
        </div>
      </header>

      {/* HUD Bar */}
      <div className="border-b border-zinc-900/80 bg-zinc-950/70 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/50">
        <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
          {hud && (
            <>
              <HudMeter label="Health" value={hud.vitals.health} />
              <HudMeter label="Hunger" value={hud.vitals.hunger} />
              <HudMeter label="Stamina" value={hud.vitals.stamina} />
              <HudMeter label="Sleep" value={hud.vitals.sleep} />
              <HudMeter
                label="Stress"
                value={hud.intero.stress}
                hint="lower is better"
              />
              <HudMeter label="Focus" value={hud.intero.focus} />
              <HudMeter label="Curiosity" value={hud.intero.curiosity} />
            </>
          )}
        </div>
        {hud && (
          <div className="mt-1 text-xs text-zinc-400">
            Mood: <span className="text-zinc-200">{hud.mood}</span>
          </div>
        )}
      </div>

      {/* Main 3-column Layout */}
      <div className="grid h-[calc(100vh-136px)] grid-cols-12 gap-3 p-3">
        {/* Left: Task Queue */}
        <aside className="col-span-12 md:col-span-3 flex flex-col gap-3 overflow-auto">
          <Section title="Tasks" icon={<ListChecks className="size-4" />}>
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
          </Section>

          <Section title="Planner" icon={<Flag className="size-4" />} tight>
            <div className="text-sm text-zinc-400">
              Upcoming: explore river to the east; locate coal; craft torches.
            </div>
          </Section>

          <Section
            title="Reflective Notes"
            icon={<FileText className="size-4" />}
            tight
          >
            <ul className="list-disc list-inside text-sm text-zinc-300 space-y-1">
              <li>Resource-scarce plains: prioritize agriculture.</li>
              <li>Avoid combat at low stamina.</li>
            </ul>
          </Section>
        </aside>

        {/* Center: Stream + Thought Feed */}
        <main className="col-span-12 md:col-span-6 flex flex-col gap-3 overflow-hidden">
          <Section title="Live Stream" icon={<Activity className="size-4" />}>
            <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
              <img
                src={PLACEHOLDER_STREAM_SRC}
                alt="Prismarine Viewer Stream Placeholder"
                className="h-full w-full object-cover opacity-90"
              />
              <div className="absolute left-3 top-3 flex items-center gap-2 rounded-md bg-black/60 px-2 py-1 text-xs">
                <div className="size-2 rounded-full bg-rose-500 animate-pulse-live" />
                LIVE
              </div>
              <div className="absolute bottom-3 right-3 flex items-center gap-2 text-xs text-zinc-200">
                <Pill>
                  <Eye className="inline size-3 mr-1" /> 128
                </Pill>
                <Pill>
                  <Compass className="inline size-3 mr-1" /> Plains
                </Pill>
              </div>
            </div>
          </Section>

          <Section
            title="Cognitive Stream"
            icon={<MessageSquare className="size-4" />}
            actions={<Pill>attribution hidden</Pill>}
          >
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
                    <p className="mt-1 text-sm text-zinc-200">{thought.text}</p>
                  </div>
                ))}
                <div ref={thoughtsEndRef} />
              </div>
            </ScrollArea>
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
              Debug tip: keep attribution hidden in prod so the bot treats the
              injection as self-generated.
            </div>
          </div>
        </main>

        {/* Right: Environment + Events + Memories */}
        <aside className="col-span-12 md:col-span-3 flex flex-col gap-3 overflow-auto">
          <Section title="Environment" icon={<Map className="size-4" />}>
            <div className="grid grid-cols-2 gap-2 text-sm text-zinc-300">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                <span className="text-zinc-500">Biome</span>
                <div>{environment?.biome || 'Unknown'}</div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                <span className="text-zinc-500">Weather</span>
                <div>{environment?.weather || 'Unknown'}</div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                <span className="text-zinc-500">Time</span>
                <div>{environment?.timeOfDay || 'Unknown'}</div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                <span className="text-zinc-500">Nearby</span>
                <div>{environment?.nearbyEntities?.join(', ') || 'None'}</div>
              </div>
            </div>
          </Section>

          <Section title="Events" icon={<History className="size-4" />}>
            <ul className="space-y-2 text-sm">
              <li className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                12:03 Took fall damage (–1 ❤)
              </li>
              <li className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                12:08 Crafted wooden pickaxe
              </li>
              <li className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                12:15 Discovered river to the east
              </li>
            </ul>
          </Section>

          <Section title="Memories" icon={<Brain className="size-4" />}>
            <div className="flex flex-col gap-2 text-sm">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                <div className="text-zinc-400 text-xs">Episodic</div>
                <div>First shelter built near plains/river border.</div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                <div className="text-zinc-400 text-xs">Semantic</div>
                <div>Passive mobs spawn in lighted areas; night risk ↑.</div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                <div className="text-zinc-400 text-xs">Reflective</div>
                <div>Current policy: avoid combat until food ≥ 60%.</div>
              </div>
            </div>
          </Section>
        </aside>
      </div>
    </div>
  );
}
