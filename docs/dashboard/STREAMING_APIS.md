# Dashboard Streaming APIs

The dashboard receives updates from backend services via **push** (SSE/WebSocket) where possible, with slow **polling** only as fallback or safety net.

## Push-based endpoints

| Source | Dashboard endpoint | How updates arrive |
|--------|--------------------|--------------------|
| Planning | `GET /api/task-updates` (SSE) | Planning POSTs to `POST /api/task-updates` on task add/progress/step events; dashboard subscribes via SSE. |
| Planning | `GET /api/memory-updates` (SSE) | Planning POSTs to `POST /api/memory-updates` on event/note add; dashboard subscribes via SSE. |
| Planning | `POST /api/environment-updates` | Environment/inventory updates; dashboard can subscribe to `GET /api/environment-updates` (SSE). |
| Cognition / Minecraft | `GET /api/ws/cognitive-stream` (SSE) | Services POST thoughts to `POST /api/ws/cognitive-stream`; dashboard subscribes via SSE. |
| Minecraft interface | `GET /api/ws/bot-state` (SSE) | Minecraft-interface POSTs to `POST /api/ws/bot-state` every 2s when bot is connected; dashboard subscribes via SSE and gets one initial snapshot + push updates. |
| Minecraft interface | WebSocket `ws://localhost:3005` | Direct WebSocket from dashboard to minecraft-interface for bot state; primary when same-origin or CORS allows. |

## Polling fallbacks

- **Task list**: Poll `GET /api/tasks` every 60s; new/updated tasks arrive via task-updates SSE (`taskAdded`, `taskMetadataUpdated`).
- **Thought history**: Poll `GET /api/ws/cognitive-stream/history` every 20s to catch thoughts if SSE dropped.
- **Bot state**: When WebSocket to 3005 is disconnected, dashboard uses SSE to `/api/ws/bot-state` (push from minecraft-interface POST). If both fail, poll fallback runs every 10s.
- **Memories/events/notes/inventory**: Refresh every 60s; events/notes also arrive via memory-updates SSE.

## Adding push for a new API

1. **Backend**: When data changes, POST to the dashboard (e.g. `POST /api/ws/bot-state` with body `{ data }`).
2. **Dashboard API route**: Implement `GET` (SSE) that adds the client to a connection set and sends one initial snapshot if needed; implement `POST` that receives the payload and broadcasts to all SSE clients.
3. **Dashboard page**: Subscribe with `EventSource(url)` and handle `onmessage` to update the store; avoid or reduce polling for that data.
