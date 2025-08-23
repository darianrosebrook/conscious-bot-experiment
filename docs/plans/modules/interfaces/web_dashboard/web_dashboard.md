 ---

## 1. **Overall Layout and Style**

* **A two-column + docked HUD layout**, with a central live “stream” area, and sidebars for state and metadata.
* **Visual inspiration**: Twitch’s live streaming UI (video + chat) but with overlays more like an immersive HUD (health, hunger, environment) from a game.
* **Primary colors**: dark background with bright, contrast-heavy highlights (greens, blues, purples) to suggest “machine consciousness.”
* **Typography**: code-editor style monospace for thoughts/memories, but clean sans-serif for nav and labels (to reinforce distinction between human vs. agent content).

---

## 2. **Main Panels**

### A. **Cognitive Stream (Center / Main Feed)**

* **Running commentary of thoughts**: a scrolling feed, styled like a livestream chat.

  * Bot’s thoughts: timestamped, with an avatar/icon (maybe a neuron graphic).
  * Intrusive thoughts (user-injected): visually identical, but **without attribution** (bot “believes” it came from itself).
  * Optional toggle: show/hide “source tags” for debugging (helpful during testing).
* Could animate in “typing dots” to mimic inner dialogue formation.

### B. **HUD: State of Being (Top Overlay / Docked Panel)**

* Game-style heads-up display:

  * **Vitals**: health, hunger, stamina, sleep.
  * **Interoception meters**: stress, focus, curiosity (your artificial “inner state” variables).
  * **Mood summary**: generated from recent affective context, displayed as a small caption (“feeling cautious,” “curious,” etc.).
* Persistent at the top, like a Twitch streamer’s overlay bar.

### C. **Environment Panel (Right Sidebar)**

* Mini-map or small Minecraft scene viewer (2D or 3D snapshot).
* Textual environment facts: current biome, nearby entities, weather, time of day.
* Event feed: logs of major in-world events (damage, crafting, interactions).

---

## 3. **Task & Memory Systems**

### A. **Task Queue (Left Sidebar / Collapsible)**

* Shows **current objectives**, ordered in priority.
* Each task has:

  * Progress meter.
  * Substeps (checklist style).
  * Source (self-generated vs. reflective vs. intrusive thought).
* Interaction: click to expand/collapse tasks and see reasoning tree.

### B. **Memory Browser (Tabbed Section below Cognitive Stream)**

* **Recent memories**: timeline scroller with key events (visual + text).
* **Episodic**: what happened (Minecraft events with context).
* **Semantic**: learned facts (“pigs often wander in plains”).
* **Reflective**: bot’s self-notes or conclusions.
* Filterable by type, timestamp, relevance.

---

## 4. **Intrusive Thought Input**

* **Docked input bar at bottom**, styled like Twitch chat.
* Placeholder: *“Enter a thought…”*
* When submitted, thought is injected seamlessly into the **Cognitive Stream**, indistinguishable from the bot’s own generative stream.
* Bot must rationalize: Does it act? Discard? Reflect?
* (Optional: A debug switch to label injected thoughts for researchers).

---

## 5. **Additional Features**

* **Playback/Replay mode**: like a YouTube “VOD,” scrub back through the thought feed and environment snapshots.
* **Split view**: watch live commentary + simultaneously explore memory or event history.
* **Export tools**: save a “day in the life” as a highlight reel (thought logs + environment events).
* **Streamer presence**: treat the bot as if it is the streamer; its “facecam equivalent” could be a visualized avatar/brain state visualization.

---

## 6. **Suggested Information Architecture**

* **Top Nav (Media-Style)**: Home | Live | Memories | Events | Settings.
* **Main Stage (Center)**: Cognitive Stream (scrolling thoughts).
* **Docked Panels**:

  * Top: HUD (state of being).
  * Right: Environment viewer & events.
  * Left: Task queue.
  * Bottom: Intrusive thought input bar.
* **Expandable Tabs (Below Main)**: Memories, Logs, Replay.

---

## 7. **Next Steps**

Wire up a nextjs 15 dashboard with shadcnUI's latest components and use the below code as an example on components to create.

---
 example code:
 import React, { useMemo, useState, useRef, useEffect } from "react";
import { Activity, AlertTriangle, Brain, CalendarClock, ChevronDown, ChevronUp, Compass, Eye, FileText, Flag, History, ListChecks, Map, MessageSquare, Mic, PauseCircle, PlayCircle, RefreshCw, Save, Search, Settings, UploadCloud, Zap } from "lucide-react";

/**
 * Conscious Minecraft Bot – Media‑Style Dashboard
 * 
 * Notes for wiring:
 * - Replace PLACEHOLDER_STREAM_SRC with your prismarine-viewer thumbnail/preview image.
 * - When you expose a live <canvas> or <video> from prismarine-viewer, swap the <img> with that element.
 * - Stream UI state via websockets/SSE: thoughts, HUD, environment, tasks, memories, events.
 * - Intrusive thoughts: POST to /intrusions with { text } and DO NOT tag as external; the bot should attribute it as self-generated thought.
 */

// ---- Demo data models, replace with actual data-------------------------------------------------------

type Thought = {
  id: string;
  t: string; // ISO time
  text: string;
  kind: "self" | "intrusion" | "reflection";
};

type Task = {
  id: string;
  title: string;
  progress: number; // 0..1
  source: "goal" | "planner" | "reflection" | "intrusion";
  steps?: { id: string; label: string; done: boolean }[];
};

const PLACEHOLDER_STREAM_SRC =
  "https://images.unsplash.com/photo-1606313564200-e75d5e30476f?q=80&w=2060&auto=format&fit=crop"; // Replace with your prismarine-viewer placeholder image

// ---- Small UI atoms ---------------------------------------------------------

function Meter({ label, value, max = 100, hint }: { label: string; value: number; max?: number; hint?: string }) {
  const pct = Math.max(0, Math.min(100, (100 * value) / max));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs text-zinc-300">
        <span className="uppercase tracking-wide">{label}</span>
        <span className="tabular-nums text-zinc-400">{Math.round(pct)}%</span>
      </div>
      <div className="h-2 w-full rounded bg-zinc-800">
        <div className="h-2 rounded bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
      {hint && <div className="text-[10px] text-zinc-500">{hint}</div>}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-zinc-800/80 px-2 py-0.5 text-[11px] text-zinc-300">{children}</span>;
}

function Section({ title, icon, actions, children, tight = false }: { title: string; icon?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; tight?: boolean; }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/60 shadow-sm">
      <header className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/80">
        <div className="flex items-center gap-2 text-zinc-200">
          {icon}
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        {actions}
      </header>
      <div className={"px-3 " + (tight ? "py-2" : "py-3")}>{children}</div>
    </section>
  );
}

// ---- Main App ---------------------------------------------------------------

export default function ConsciousMinecraftDashboard() {
  // demo reactive state
  const [isLive, setIsLive] = useState(true);
  const [intrusion, setIntrusion] = useState("");
  const [thoughts, setThoughts] = useState<Thought[]>(() => [
    { id: "t1", t: new Date().toISOString(), text: "Scanning environment… plains biome detected; low mob density.", kind: "self" },
    { id: "t2", t: new Date().toISOString(), text: "Hunger at 35%. Consider foraging or crafting.", kind: "reflection" },
  ]);

  const [tasks, setTasks] = useState<Task[]>([
    { id: "task1", title: "Acquire food (forage/cook)", progress: 0.35, source: "planner", steps: [
      { id: "s1", label: "Collect logs", done: true },
      { id: "s2", label: "Craft wooden tools", done: true },
      { id: "s3", label: "Hunt/harvest food", done: false },
    ]},
    { id: "task2", title: "Shelter before nightfall", progress: 0.1, source: "goal", steps: [
      { id: "s4", label: "Find suitable site", done: false },
    ]},
  ]);

  // HUD demo numbers
  const hud = {
    health: 74, hunger: 35, stamina: 62, sleep: 28,
    stress: 22, focus: 71, curiosity: 64,
    mood: "cautiously curious",
  };

  function submitIntrusion() {
    const text = intrusion.trim();
    if (!text) return;
    const th: Thought = { id: crypto.randomUUID(), t: new Date().toISOString(), text, kind: "intrusion" };
    setThoughts((prev) => [...prev, th]);
    setIntrusion("");
    // TODO: POST to /intrusions { text }
  }

  return (
    <div className="h-screen w-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-black text-zinc-100 overflow-hidden">
      {/* Top nav */}
      <header className="flex items-center justify-between border-b border-zinc-900/80 bg-zinc-950/80 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/60">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded bg-emerald-500/10 grid place-items-center"><Brain className="size-4" /></div>
          <div className="font-semibold tracking-wide">Cognitive Stream</div>
          <nav className="ml-6 hidden md:flex items-center gap-4 text-sm text-zinc-300">
            <Tabs>
              <Tab className="hover:text-zinc-100" href="#">Live</Tab>
              <Tab className="hover:text-zinc-100" href="#">Memories</Tab>
              <Tab className="hover:text-zinc-100" href="#">Events</Tab>
              <Tab className="hover:text-zinc-100" href="#">Settings</Tab>
            </Tabs>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm hover:bg-zinc-800/80">
            <Search className="size-4" />
            Search
          </button>
          <button onClick={() => setIsLive(v => !v)} className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm hover:bg-zinc-800/80">
            {isLive ? <PauseCircle className="size-4" /> : <PlayCircle className="size-4" />}
            {isLive ? "Pause" : "Go Live"}
          </button>
        </div>
      </header>

      {/* HUD bar */}
      <div className="border-b border-zinc-900/80 bg-zinc-950/70 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/50">
        <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
          <Meter label="Health" value={hud.health} />
          <Meter label="Hunger" value={hud.hunger} />
          <Meter label="Stamina" value={hud.stamina} />
          <Meter label="Sleep" value={hud.sleep} />
          <Meter label="Stress" value={hud.stress} hint="lower is better" />
          <Meter label="Focus" value={hud.focus} />
          <Meter label="Curiosity" value={hud.curiosity} />
        </div>
        <div className="mt-1 text-xs text-zinc-400">Mood: <span className="text-zinc-200">{hud.mood}</span></div>
      </div>

      {/* Main 3-column layout */}
      <div className="grid h-[calc(100vh-136px)] grid-cols-12 gap-3 p-3">
        {/* Left: Task Queue */}
        <aside className="col-span-12 md:col-span-3 flex flex-col gap-3 overflow-auto">
          <Section title="Tasks" icon={<ListChecks className="size-4" />}>
            <div className="flex flex-col gap-3">
              {tasks.map((task) => (
                <div key={task.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-zinc-200">{task.title}</div>
                    <Pill>{task.source}</Pill>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded bg-zinc-800">
                    <div className="h-1.5 rounded bg-sky-500" style={{ width: `${Math.round(task.progress * 100)}%` }} />
                  </div>
                  {task.steps && (
                    <ul className="mt-2 space-y-1 text-sm text-zinc-300">
                      {task.steps.map(s => (
                        <li key={s.id} className="flex items-center gap-2">
                          <input type="checkbox" checked={s.done} onChange={() => {}} className="size-3" />
                          <span className={s.done ? "line-through text-zinc-500" : ""}>{s.label}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </Section>

          <Section title="Planner" icon={<Flag className="size-4" />} tight>
            <div className="text-sm text-zinc-400">Upcoming: explore river to the east; locate coal; craft torches.</div>
          </Section>

          <Section title="Reflective Notes" icon={<FileText className="size-4" />} tight>
            <ul className="list-disc list-inside text-sm text-zinc-300 space-y-1">
              <li>Resource-scarce plains: prioritize agriculture.</li>
              <li>Avoid combat at low stamina.</li>
            </ul>
          </Section>
        </aside>

        {/* Center: Stream + Thought feed */}
        <main className="col-span-12 md:col-span-6 flex flex-col gap-3 overflow-hidden">
          <Section title="Live Stream" icon={<Activity className="size-4" />}>
            {/* Replace this <img> with your prismarine-viewer <canvas> or <video> element */}
            <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
              <img
                src={PLACEHOLDER_STREAM_SRC}
                alt="Prismarine Viewer Stream Placeholder"
                className="h-full w-full object-cover opacity-90"
              />
              <div className="absolute left-3 top-3 flex items-center gap-2 rounded-md bg-black/60 px-2 py-1 text-xs">
                <div className="size-2 rounded-full bg-rose-500 animate-pulse" /> LIVE
              </div>
              <div className="absolute bottom-3 right-3 flex items-center gap-2 text-xs text-zinc-200">
                <Pill><Eye className="inline size-3 mr-1" /> 128</Pill>
                <Pill><Compass className="inline size-3 mr-1" /> Plains</Pill>
              </div>
            </div>
          </Section>

          <Section title="Cognitive Stream" icon={<MessageSquare className="size-4" />} actions={<Pill>attribution hidden</Pill>}>
          {/* Chat thread, style this with overflow so we can scroll up/down without the input being pushed down infinitely, new thoughts automatically appear at the bottom and scroll to it unless manually scrolled up*/}
            <div className="max-h-[38vh] overflow-auto pr-1">
              <ul className="flex flex-col gap-2">
                {thoughts.map((th) => (
                  <li key={th.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-2.5">
                    <div className="flex items-center justify-between text-[11px] text-zinc-400">
                      <span className="uppercase tracking-wide">{th.kind === "intrusion" ? "thought" : th.kind}</span>
                      <time className="tabular-nums">{new Date(th.t).toLocaleTimeString()}</time>
                    </div>
                    <p className="mt-1 text-sm text-zinc-200">{th.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          </Section>

          {/* Intrusive Thought input */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-2">
            <div className="flex items-center gap-2">
              <input
                value={intrusion}
                onChange={(e) => setIntrusion(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitIntrusion(); }}
                placeholder="Enter a thought… (appears to the bot as its own)"
                className="flex-1 rounded-xl bg-zinc-900 px-3 py-2 text-sm outline-none placeholder:text-zinc-600"
              />
              <button onClick={submitIntrusion} className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-emerald-600/90 px-3 py-2 text-sm font-medium hover:bg-emerald-600">
                <UploadCloud className="size-4" /> Inject
              </button>
            </div>
            <div className="mt-1 text-[11px] text-zinc-500">Debug tip: keep attribution hidden in prod so the bot treats the injection as self-generated.</div>
          </div>
        </main>

        {/* Right: Environment + Events + Memories */}
        <aside className="col-span-12 md:col-span-3 flex flex-col gap-3 overflow-auto">
          <Section title="Environment" icon={<Map className="size-4" />}>
            <div className="grid grid-cols-2 gap-2 text-sm text-zinc-300">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2"><span className="text-zinc-500">Biome</span><div>Plains</div></div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2"><span className="text-zinc-500">Weather</span><div>Clear</div></div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2"><span className="text-zinc-500">Time</span><div>Midday</div></div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2"><span className="text-zinc-500">Nearby</span><div>Cow ×2, Oak ×3</div></div>
            </div>
          </Section>

          <Section title="Events" icon={<History className="size-4" />}>
            <ul className="space-y-2 text-sm">
              <li className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">12:03 Took fall damage (–1 ❤)</li>
              <li className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">12:08 Crafted wooden pickaxe</li>
              <li className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">12:15 Discovered river to the east</li>
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
