# Conscious Minecraft Bot – Technical Architecture & Implementation Spec

**Audience:** design technologists, full‑stack engineers, research ops.
**UI shell:** Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui.
**Realtime:** WebSocket (HUD + Chain‑of‑Thought), Server‑Sent Events optional.
**Replay:** Event‑sourced timeline with screenshot keyframes from prismarine‑viewer.

---

## 0) Services & Ports

| Service                 | Port | Responsibility                                                                            | Ingress/Egress                                                                                 |
| ----------------------- | ---: | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Dashboard (Next.js)** | 3000 | Media‑style UI, WS clients, replay scrubber, auth, static assets                          | -> WS to 3003/3004; HTTP to 3001/3002/3003/3004/3005 via API routes; receives images from 3005 |
| **Memory System**       | 3001 | Vector/graph store for episodic/semantic/reflective memories, retrieval & write‑backs     | <- writes from 3003; -> reads by 3002/3003/3000                                                |
| **Planning System**     | 3002 | Task graph, hierarchical plans, priority queues                                           | <- context from 3003; -> tasks to 3005 & 3000                                                  |
| **Cognition System**    | 3003 | Inner loop: perception → appraisal → CoT → action proposals; WS broadcast                 | <- sensors (3004/3005); -> WS to 3000; -> plans to 3002                                        |
| **World System**        | 3004 | World facts & events: biome/time/weather/entities; event bus (Kafka/NATS/Rabbit optional) | -> 3003/3005/3000                                                                              |
| **Minecraft Bot**       | 3005 | Mineflayer/prismarine agent; captures screenshots; executes actions                       | <-> 3004 (world); <- 3002 (tasks); -> 3003 (observations); -> 3000 (image upload/stream)       |

> **Principle:** the Dashboard is *read‑mostly* and *side‑effect‑free*, except for the **intrusive thought** endpoint which routes to Cognition.

---

## 1) Next.js 15 App Layout & UI Stack

* **App Router** with nested routes: `/(live)`, `/memories`, `/events`, `/settings`, `/replay/[sessionId]`.
* **Styling:** Tailwind; **components:** shadcn/ui primitives (Button, Card, Tabs, ScrollArea, Dialog, Tooltip, Toast, Slider, Progress, Menubar).
* **Icons:** lucide‑react.
* **State:** client: Zustand or Jotai for UI; server: event feed via WS → store.
* **Accessibility:** shadcn/ui (Radix) focus management; semantic landmarks; reduced‑motion guards; captions for stream.

### 1.1 shadcn/ui Setup

* Install generator; align with Next.js 15 + Tailwind config.
* Components used: `Card`, `Tabs`, `ScrollArea`, `Tooltip`, `Dialog`, `Slider`, `Progress`, `Separator`, `Menubar`, `Toast`, `Toolbar`, `Badge`.
* Custom tokens in Tailwind for the HUD color system (neutral/danger/safe).

### 1.2 App Structure (files)

```
app/
  layout.tsx
  globals.css
  (live)/page.tsx              # live stream + cognitive feed + HUD
  memories/page.tsx            # memory browser
  events/page.tsx              # event log
  replay/[sessionId]/page.tsx  # scrubber + sync
  api/
    intrusive/route.ts         # POST intrusive thought → 3003
    ws/hud/route.ts            # WS proxy to 3003
    ws/cot/route.ts            # WS proxy to 3003 (chain of thought)
    world/route.ts             # GET world snapshot → 3004
    screenshots/route.ts       # GET list/images → 3005
```

> API routes serve as **reverse proxies** to the internal ports to avoid exposing them publicly and to unify auth/observability.

---

## 2) Realtime: WebSockets & Channels

### 2.1 Channels

* `ws://<dashboard>/api/ws/hud` → relays **HUD** updates: vitals (health, hunger, stamina, sleep), interoception (stress, focus, curiosity), mood, current policy.
* `ws://<dashboard>/api/ws/cot` → relays **Chain‑of‑Thought** messages: `{id, ts, text, type: self|reflection|intrusion}`.
* Optional: `ws://…/events` stream (if we prefer WS to HTTP polling), otherwise events are paginated HTTP.

### 2.2 Message Contracts

```ts
// HUD
{
  ts: string;                 // ISO
  vitals: { health: number; hunger: number; stamina: number; sleep: number };
  intero: { stress: number; focus: number; curiosity: number };
  mood: string;               // small summary
}

// CoT item
{
  id: string;
  ts: string;
  text: string;
  type: 'self' | 'reflection' | 'intrusion';
  attrHidden?: boolean;       // true in prod; debugging only
}
```

### 2.3 Proxy Implementation (Next.js route handler)

```ts
// app/api/ws/hud/route.ts
import { NextRequest } from 'next/server';

export const GET = async (req: NextRequest) => {
  const { socket, response } = Deno.upgradeWebSocket(req as unknown as Request); // or Node ws upgrade depending on runtime
  const upstream = new WebSocket('ws://localhost:3003/ws/hud');
  upstream.onmessage = (evt) => socket.send(evt.data);
  upstream.onclose = () => socket.close();
  socket.onclose = () => upstream.close();
  return response;
};
```

> Use the runtime’s WS upgrade primitive (Node 20/Edge runtime support varies). If deploying to Vercel/Netlify, consider SSE for portability or a dedicated WS gateway.

---

## 3) Intrusive Thoughts Pipeline

**User action:** POST `/api/intrusive` → Dashboard validates/auths → forwards to Cognition (3003) as **unattributed internal thought**.

**Contract:**

```ts
// Request
{ text: string; tags?: string[]; strength?: number /* bias weight for planner */ }

// Response
{ id: string; accepted: boolean; rationale?: string }
```

**Cognition duty:** assign a new CoT node **without external attribution**; planner (3002) may incorporate if policy permits.

---

## 4) Event Sourcing & Replay Scrubber

### 4.1 Storage Model

* **Event log** (append‑only): `{ id, ts, kind, payload }` persisted in World System (3004) and/or central log (Kafka/NATS optional).
* **Screenshot keyframes**: PNG/JPEG from 3005 stored to object storage (S3/MinIO) with `eventId` + coarse **frameIndex**.
* **Derived indices**: session → ordered event IDs; time → nearest screenshot.

### 4.2 Replay API (Dashboard)

* `GET /replay/:sessionId/events?cursor=…` → paginated events.
* `GET /screenshots?sessionId=…&at=timestamp` → nearest keyframe URL + ±N neighbors.

### 4.3 UI Behavior

* **Slider (shadcn Slider)** bound to **session time**.
* On scrub: fetch nearest event window + screenshot; hydrate **HUD snapshot** (persist periodic HUD deltas, or compute via reducer from prior events).
* Thought feed is time‑scoped to the slider value.
* “Play” button advances with requestAnimationFrame, stepping by wall‑time or tick count.

### 4.4 Event Schema

```ts
// World
{ id, ts, kind: 'blockUpdate'|'entitySeen'|'biomeChange'|'weather'|'timeOfDay'|'damage'|'craft'|'pickup'|'chat', payload: {...} }

// Cognition
{ id, ts, kind: 'appraisal'|'policyChange'|'cot'|'memoryWrite', payload: {...} }

// Planning
{ id, ts, kind: 'taskCreated'|'taskAdvanced'|'taskCompleted'|'replanned', payload: {...} }
```

---

## 5) Memory System (3001)

* **Types:** Episodic (event‑linked), Semantic (facts), Reflective (self‑notes/policies).
* **API:**

  * `POST /memories` → write memory records;
  * `GET /memories?type=…&q=…&limit=…` → retrieve;
  * `POST /retrieve` → hybrid search (vector + keyword) with **salience score**.
* **Write policy:** 3003 (Cognition) emits `memoryWrite` when salience ≥ threshold or on task completion.
* **Dashboard usage:** Memory browser pane queries 3001; replay overlays memory cards at timestamps.

### 5.1 Memory Record

```ts
{
  id: string;
  ts: string;
  type: 'episodic'|'semantic'|'reflective';
  text: string;
  tags?: string[];
  link?: { eventId?: string; entityId?: string };
  score?: number; // salience or retrieval score
}
```

---

## 6) Cognition System (3003)

* **Inputs:** WS sensors from 3004/3005; memory retrieval from 3001; current plan from 3002.
* **Outputs:** WS topics `hud`, `cot`; HTTP `POST /intrusions` to accept injected thoughts; `POST /policy` for policy updates.
* **Attribution rule:** intrusive thoughts are **not marked** as external; debugging toggles exist but off in prod.

---

## 7) Planning System (3002)

* **Role:** convert goals + constraints into task graphs; publish `task*` events; accept feedback from Cognition (success/failure signals).
* **API:** `GET /tasks?status=active`, `PATCH /tasks/:id` to update progress, `POST /replan`.

---

## 8) World System (3004)

* **Role:** normalized world facts; event emission; query snapshots.
* **API:** `GET /snapshot`, `GET /events?cursor=…`, `WS /events` (optional).
* **Security:** read‑only to Dashboard; read/write to Bot & Cognition.

---

## 9) Minecraft Bot (3005)

* **Mineflayer/prismarine** instance; captures **periodic screenshots** and uploads to Dashboard `/api/screenshots` or directly to object storage with signed URLs.
* **Executes** tasks from 3002; publishes sensor updates to 3004 and observations to 3003.

---

## 10) Security & Auth

* **Single sign‑on** to Dashboard; short‑lived JWT for API routes to internal services.
* **Service‑to‑service**: mTLS within the internal network; allow‑lists by route.
* **Intrusion guardrails:** server‑side rate‑limit + content policy (reject prompt‑injection patterns that violate capability constraints).

---

## 11) Observability

* **Logs**: structured (pino/winston) with trace IDs propagated across services.
* **Metrics**: Prometheus counters (intrusion\_accept\_rate, memory\_write\_latency, planner\_replan\_count).
* **Traces**: OpenTelemetry, spans for WS broadcasts and replay queries.

---

## 12) Performance & Resilience

* **Backpressure:** WS message coalescing for HUD at 10–20Hz; CoT at 3–5Hz.
* **Replay caching:** CDN/cache screenshots; index events per session; use binary indexed formats for time → offset.
* **Offline mode:** degrade to last world snapshot + cached thoughts.

---

## 13) Accessibility (A11y)

* Live region announcements for critical HUD deltas (damage, low hunger).
* Keyboard navigation across panes; slider is keyboard‑operable with ARIA values.
* Color contrast checked; captions/alt text for stream placeholder and screenshots.

---

## 14) Example Contracts (TypeScript)

```ts
// Task (Planning → Dashboard)
export type Task = {
  id: string;
  title: string;
  priority: number;         // 0..1
  progress: number;         // 0..1
  source: 'goal'|'planner'|'reflection'|'intrusion';
  steps?: { id: string; label: string; done: boolean }[];
};

// WS HUD (Cognition → Dashboard)
export type HudMsg = {
  ts: string;
  vitals: { health: number; hunger: number; stamina: number; sleep: number };
  intero: { stress: number; focus: number; curiosity: number };
  mood: string;
};

// CoT (Cognition → Dashboard)
export type CotMsg = {
  id: string;
  ts: string;
  text: string;
  type: 'self'|'reflection'|'intrusion';
};

// Event (World/Planning/Cognition → Dashboard)
export type EventMsg = {
  id: string;
  ts: string;
  kind: string;
  payload: Record<string, unknown>;
};

// Screenshot index (Bot → Dashboard)
export type Shot = {
  id: string;
  ts: string;
  url: string;      // signed URL or public path
  eventId?: string; // nearest event id
};
```

---

## 15) Empty States & Data Handling

The dashboard implements proper empty states for all data sections to provide clear feedback when no data is available:

### Empty State Component
```tsx
interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}
```

### Data Sections with Empty States
- **HUD**: Shows "Waiting for HUD data..." when no vitals/interoception data
- **Tasks**: "No tasks available" when no active tasks
- **Cognitive Stream**: "No thoughts yet" when no thoughts recorded
- **Environment**: "No environment data" when not connected to world
- **Events**: "No events recorded" when no events available
- **Memories**: "No memories available" when no memories formed
- **Planner**: "No planner data" when no planning information
- **Reflective Notes**: "No reflective notes" when no insights available
- **Live Stream**: "Stream not available" when no stream connection

### Replay Scrubber – UI Wiring (Pseudo)

```tsx
const [t, setT] = useState<number>(0);
const { events } = useEvents(sessionId, t);         // windowed fetch around t
const { shot } = useNearestScreenshot(sessionId, t);
const { hud } = useHudSnapshot(sessionId, t);       // from periodic HUD deltas

<Slider value={[t]} onValueChange={([v]) => setT(v)} min={t0} max={t1} />
<img src={shot.url} alt="world keyframe" />
<EventList events={events} />
<HudOverlay data={hud} />
<ThoughtFeed at={t} />
```

---

## 16) Deployment Notes

* Keep internal services on a private network; Dashboard exposes only public routes and internal API proxies.
* If WS hosting is constrained, prefer **SSE** for HUD/CoT and fall back to polling for events.

---

## 17) Test Matrix (Essential)

* **WS durability:** server restarts; client reconnect & backfill.
* **Replay correctness:** deterministic time → same HUD/CoT/events & screenshot alignment.
* **Intrusion semantics:** thought enters CoT without attribution; planner consumes when policy allows.

---

## 18) Open Questions / Options

1. Central event bus vs. per‑service feeds? (Simplicity vs. scalability).
2. Screenshot cadence & size tradeoffs (bandwidth vs. fidelity).
3. Edge runtime compatibility for WS proxies (consider a Node server for WS only).
