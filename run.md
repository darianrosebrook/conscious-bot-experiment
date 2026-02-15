
Conscious Bot System
========================

Checking system requirements...
 Node.js v22.19.0 is supported
 pnpm is available

Setting up MLX-LM sidecar environment...
 MLX virtual environment already exists
 Installing MLX dependencies...
 MLX dependencies installed
 Verifying MLX model cache...
 MLX models are cached locally

Setting up UMAP service environment...
 UMAP virtual environment already exists
 Installing UMAP dependencies...
 UMAP dependencies installed

Starting Docker services...
 Docker compose started
   Waiting for Postgres...
 Postgres is ready
 Minecraft server is ready

Cleaning up existing processes...

Checking port availability...
[2026-02-14T22:57:05.212Z] [Core API] [INFO] Port 3007 is available
[2026-02-14T22:57:05.313Z] [Memory] [INFO] Port 3001 is available
[2026-02-14T22:57:05.415Z] [World] [INFO] Port 3004 is available
[2026-02-14T22:57:05.516Z] [Cognition] [INFO] Port 3003 is available
[2026-02-14T22:57:05.615Z] [Planning] [INFO] Port 3002 is available
[2026-02-14T22:57:05.716Z] [Minecraft Interface] [INFO] Port 3005 is available
[2026-02-14T22:57:05.817Z] [MLX-LM Sidecar] [INFO] Port 5002 is available
[2026-02-14T22:57:05.918Z] [Dashboard] [INFO] Port 3000 is available
[2026-02-14T22:57:06.019Z] [Sterling] [INFO] Port 8766 is available
[2026-02-14T22:57:06.120Z] [UMAP Service] [INFO] Port 5003 is available

Installing Node.js dependencies...
 Node.js dependencies installed

Building packages...
 Packages built successfully

Entity textures missing for 1.21.9 — extracting from JAR...
 Entity textures injected

Starting services in dependency order...

[2026-02-14T22:57:09.029Z] [Core API] [START] Starting service on port 3007
[2026-02-14T22:57:09.029Z] [Core API] [INFO] Core API and capability registry
[Core API] > @conscious-bot/core@0.1.0 dev:server /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/core
[Core API] > tsx src/server.ts
[Core API] [DynamicCreationFlow] Initialized. Reduction client: NOT bound — proposal generation will be skipped until a reduction client is set
[Core API] Core API server ready on port 3007
[Core API] Health check: http://localhost:3007/health
[Core API] Capability registry endpoints available
[2026-02-14T22:57:14.055Z] [Core API] [HEALTH] Service is healthy and ready
   Waiting for dependencies: Core API
[2026-02-14T22:57:15.056Z] [Memory] [START] Starting service on port 3001
[2026-02-14T22:57:15.056Z] [Memory] [INFO] Memory storage and retrieval system
[Memory] > @conscious-bot/memory@0.1.0 dev:server /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory
[Memory] > tsx src/server.ts
[Memory] [Memory] Registered 10 skills (shelter_basic, chop_tree_safe, ore_ladder_iron, smelt_iron_basic, craft_tool_tiered, food_pipeline_starter, torch_corridor, bridge_gap_safe, biome_probe, emergency_retreat_and_block)
[Memory] [Memory] Server running on port 3001
[Memory] [Memory] Endpoints: /live, /ready, /health, /enhanced/* (status, seed, database, stats)
[2026-02-14T22:57:20.065Z] [Memory] [HEALTH] Service is healthy and ready
   Waiting for dependencies: Core API
[2026-02-14T22:57:21.066Z] [World] [START] Starting service on port 3004
[2026-02-14T22:57:21.066Z] [World] [INFO] World state management and simulation
[World] > @conscious-bot/world@0.1.0 dev:server /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/world
[World] > tsx src/server.ts
[World] World system server running on port 3004
[World] [World] Planning server not yet reachable — will retry
[Memory] [memory] Probe pool targeting: localhost:5432/conscious_bot_seed_668984074568676532 (user: conscious_bot)
[2026-02-14T22:57:26.070Z] [World] [HEALTH] Service is healthy and ready
[World] [World] Planning server not yet reachable — will retry
[2026-02-14T22:57:27.071Z] [MLX-LM Sidecar] [START] Starting service on port 5002
[2026-02-14T22:57:27.071Z] [MLX-LM Sidecar] [INFO] MLX-LM inference and embedding server for Apple Silicon
[MLX-LM Sidecar]  * Serving Flask app 'mlx_server'
[MLX-LM Sidecar]  * Debug mode: off
[MLX-LM Sidecar] WARNING: This is a development server. Do not use it in a production deployment. Use a production WSGI server instead.
[MLX-LM Sidecar]  * Running on http://localhost:5002
[MLX-LM Sidecar] Press CTRL+C to quit
[MLX-LM Sidecar] Loading generation model: mlx-community/gemma-3n-E2B-it-lm-4bit ...
[MLX-LM Sidecar] 
Fetching 9 files:   0%|          | 0/9 [00:00<?, ?it/s]
[MLX-LM Sidecar] 
Fetching 9 files: 100%|██████████| 9/9 [00:00<00:00, 13827.38it/s]
[World] [World] Planning server not yet reachable — will retry
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 14:57:32] "GET /health HTTP/1.1" 503 -
[MLX-LM Sidecar] Generation model loaded: gemma-3n-E2B-it-lm-4bit
[MLX-LM Sidecar] Loading embedding model: mlx-community/embeddinggemma-300m-4bit ...
[MLX-LM Sidecar] 
Fetching 12 files:   0%|          | 0/12 [00:00<?, ?it/s]
[MLX-LM Sidecar] 
Fetching 12 files: 100%|██████████| 12/12 [00:00<00:00, 19380.69it/s]
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 14:57:34] "GET /health HTTP/1.1" 503 -
[MLX-LM Sidecar] Embedding model loaded: embeddinggemma-300m-4bit
[MLX-LM Sidecar] MLX-LM sidecar ready on http://localhost:5002
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 14:57:36] "GET /health HTTP/1.1" 200 -
[2026-02-14T22:57:36.195Z] [MLX-LM Sidecar] [HEALTH] Service is healthy and ready
[World] [World] Planning server not yet reachable — will retry
[2026-02-14T22:57:37.196Z] [Sterling] [START] Starting service on port 8766
[2026-02-14T22:57:37.197Z] [Sterling] [INFO] Sterling symbolic reasoning server (crafting, building, tool progression)
[Sterling] INFO:websockets.server:server listening on [::1]:8766
[Sterling] INFO:websockets.server:server listening on 127.0.0.1:8766
[World] [World] Planning server not yet reachable — will retry
[Sterling] INFO:websockets.server:connection open
[2026-02-14T22:57:42.222Z] [Sterling] [HEALTH] Service is healthy and ready
[2026-02-14T22:57:43.222Z] [UMAP Service] [START] Starting service on port 5003
[2026-02-14T22:57:43.223Z] [UMAP Service] [INFO] UMAP dimensionality reduction service for embedding visualization
[World] [World] Planning server not yet reachable — will retry
[UMAP Service] Starting UMAP reduction service on port 5003...
[UMAP Service]  * Serving Flask app 'umap_server'
[UMAP Service]  * Debug mode: off
[UMAP Service] WARNING: This is a development server. Do not use it in a production deployment. Use a production WSGI server instead.
[UMAP Service]  * Running on all addresses (0.0.0.0)
[UMAP Service]  * Running on http://127.0.0.1:5003
[UMAP Service]  * Running on http://10.0.0.11:5003
[UMAP Service] Press CTRL+C to quit
[UMAP Service] 127.0.0.1 - - [14/Feb/2026 14:57:48] "GET /health HTTP/1.1" 200 -
[2026-02-14T22:57:48.230Z] [UMAP Service] [HEALTH] Service is healthy and ready
   Waiting for dependencies: Core API
[2026-02-14T22:57:49.231Z] [Cognition] [START] Starting service on port 3003
[2026-02-14T22:57:49.231Z] [Cognition] [INFO] Cognitive reasoning and decision making
[Cognition] > @conscious-bot/cognition@0.1.0 dev:server /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition
[Cognition] > tsx src/server.ts
[Cognition] 2026-02-14T22:57:50.160Z INFO cognition-server event=server_started tags=server,startup Cognition service running on port 3003 port=3003
[Cognition] 2026-02-14T22:57:50.160Z INFO intero-history event=intero_history_loaded tags=intero-history,loaded Loaded intero history snapshots loaded=11 path=intero-history.jsonl
[Cognition] 2026-02-14T22:57:50.161Z INFO intero-history event=intero_state_restored tags=intero-history,restored Restored intero state from latest snapshot ts=1769923495170 stress=17
[Cognition] 2026-02-14T22:57:50.161Z INFO cognition-server event=server_endpoints_registered tags=server,startup Registered 13 endpoints count=13 endpoints=metrics, thought_generation, react_arbiter, social_cognition, social_consideration, nearby_entities, chat_consideration, departure_communication, cognitive_stream_recent, cognitive_stream_processed, social_memory_entities, social_memory_search, social_memory_stats
[World] [World] Planning server not yet reachable — will retry
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 14:57:52] "GET /health HTTP/1.1" 200 -
[Cognition] 2026-02-14T22:57:52.169Z INFO cognition-server event=llm_health_ok tags=llm,health LLM backend reachable healthUrl=http://localhost:5002/health
[MLX-LM Sidecar] mx.metal.device_info is deprecated and will be removed in a future version. Use mx.device_info instead.
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 14:57:52] "POST /api/generate HTTP/1.1" 200 -
[2026-02-14T22:57:54.240Z] [Cognition] [HEALTH] Service is healthy and ready
   Waiting for dependencies: Core API, Memory, World
[2026-02-14T22:57:55.242Z] [Planning] [START] Starting service on port 3002
[2026-02-14T22:57:55.242Z] [Planning] [INFO] Task planning and execution coordination
[Planning] > @conscious-bot/planning@0.1.0 dev:server /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning
[Planning] > tsx src/modular-server.ts
[Planning] [Thought-to-task] Started conversion polling
[Planning] [TaskIntegration] Goal resolver enabled
[Planning] [Planning] Event-driven thought generator initialized
[Planning] [resilient-fetch] world/state unavailable (attempt 1/6), retrying in 500ms [ECONNREFUSED]
[Planning] [KeepAliveIntegration] Initialized successfully
[Planning] [Planning] Keep-alive integration initialized
[Planning] [Planning] Hunger driveshaft controller initialized
[Planning] [Planning] Exploration driveshaft controller initialized
[Planning] [Planning] ReflexRegistry: 3 reflexes registered
[Sterling] INFO:websockets.server:connection open
[Planning] [Sterling] Connected to reasoning server
[Planning] Sterling reasoning service connected
[Planning] Sterling Language IO transport wired (shared WebSocket connection)
[Planning] Minecraft crafting solver initialized
[Planning] Minecraft building solver initialized
[Planning] Minecraft tool progression solver initialized
[Planning] Minecraft navigation solver initialized
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 14:57:56] "GET /health HTTP/1.1" 200 -
[Planning] [memory] Discovery: endpoint UP → http://localhost:3001
[Planning] [MCP] MCP server import successful
[Planning] [MCP] MCP server created successfully
[Planning] [MCP] Integration initialized successfully
[Planning] [Server] MCP integration initialized and mounted at /mcp
[Planning] [Planning] MCP integration initialized
[Planning] MCP integration connected to behavior tree runner
[Planning] Registered 15 core leaves in planning
[Planning] [Planning] MCP options seeded: 3/3 registered, 3 promoted (gather_wood, craft_wooden_pickaxe, explore_move)
[Planning] [Server] Planning system server running on port 3002
[Planning] [Server] Environment: development
[Planning] [Server] MCP Integration: active
[Planning] [Planning] Server started successfully
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 14:57:56] "GET /health HTTP/1.1" 200 -
[Planning] [Planning:startup] Service readiness: minecraft=down(5ms), memory=up(4ms), cognition=up(5ms), dashboard=down(3ms)
[Planning] [Planning:startup] Executor ready: false
[Planning] [Planning] Executor enabled (mode=live, maxSteps/min=6, leafAllowlist=40 leaves)
[Planning] [Pipeline] Cognition: http://localhost:3003
[Planning] [Pipeline] MC interface: http://localhost:3005
[Planning] [Planning] tryStartExecutor: waiting — systemReady=true, depsReady=false
[Planning] [Planning] Executor enabled but not ready — will start when dependencies are reachable
[Planning] [Planning] Using event-driven thought generation (cognition) instead of legacy cognitive processor.
[Planning] [Planning] Modular planning server started successfully
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 14:57:56] "GET /health HTTP/1.1" 200 -
[Planning] [Planning] tryStartExecutor: waiting — systemReady=true, depsReady=false
[2026-02-14T22:57:58.247Z] [Planning] [HEALTH] Service is healthy and ready
[Planning] WorldStateManager poll skipped (in-flight)
   Waiting for dependencies: Core API, Planning
[2026-02-14T22:57:59.248Z] [Minecraft Interface] [START] Starting service on port 3005
[2026-02-14T22:57:59.248Z] [Minecraft Interface] [INFO] Minecraft bot interface and control
[Minecraft Interface] > @conscious-bot/minecraft-interface@0.1.0 dev:server /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/minecraft-interface
[Minecraft Interface] > NODE_OPTIONS='--max-old-space-size=8192' tsx src/server.ts
[Minecraft Interface] [asset-server] No custom skin found (checked: monorepo root, cwd, ~/Downloads)
[Minecraft Interface] [asset-server] Prismarine viewer public dir missing sentinel files (index.html, index.js, worker.js): /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/minecraft-interface/src/viewer/public
[Minecraft Interface] Minecraft auth mode: microsoft (will prompt for Microsoft login on first connect)
[Minecraft Interface] Minecraft bot server running on port 3005
[Minecraft Interface] Bot config: BotSterling@localhost:25565
[Minecraft Interface] Use POST /connect to start the bot
[Minecraft Interface] Prismarine viewer port reserved at 3006
[Minecraft Interface] [Minecraft Interface] Registered 44/44 core leaves
[2026-02-14T22:58:02.260Z] [Minecraft Interface] [HEALTH] Service is healthy and ready
   Waiting for dependencies: Core API, Planning, Minecraft Interface
[2026-02-14T22:58:03.261Z] [Dashboard] [START] Starting service on port 3000
[2026-02-14T22:58:03.261Z] [Dashboard] [INFO] Web dashboard for monitoring and control
[Dashboard] > @conscious-bot/dashboard@0.1.0 dev /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/dashboard
[Dashboard] > vite --port 3000 --strictPort
[Minecraft Interface] [MINECRAFT INTERFACE] Bot not connected, returning 503
[Planning] WorldStateManager: poll got HTTP 503 — stale snapshot preserved
[Dashboard]   VITE v5.4.21  ready in 281 ms
[Dashboard]   ➜  Local:   http://localhost:3000/
[Dashboard]   ➜  Network: use --host to expose
[Minecraft Interface] WebSocket client connected (unknown)
[Cognition] 2026-02-14T22:58:05.116Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=GET path=/intero/history statusCode=304 durationMs=1 operationType=api_request success=true
[Minecraft Interface] [SSE] Bot state client connected (1 total)
[Memory] [SSE] Client connected to memory-updates (1 total)
[Planning] [SSE] Client connected to task-updates (1 total)
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 14:58:05] "GET /health HTTP/1.1" 200 -
[Minecraft Interface] [SSE] Bot state client disconnected (0 remaining)
[Cognition] 2026-02-14T22:58:05.231Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=GET path=/intero/history statusCode=304 durationMs=0 operationType=api_request success=true
[Planning] WorldStateManager: poll got HTTP 503 — stale snapshot preserved
[Minecraft Interface] [SSE] Bot state client connected (1 total)
[Memory] [SSE] Client connected to memory-updates (2 total)
[Planning] [SSE] Client connected to task-updates (2 total)
[Minecraft Interface] [MINECRAFT INTERFACE] /inventory endpoint called
[Minecraft Interface] [MINECRAFT INTERFACE] Inventory - Bot not connected, returning 503
[Minecraft Interface] [SSE] Bot state client connected (2 total)
[Minecraft Interface] [SSE] Bot state client disconnected (1 remaining)
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 14:58:05] "GET /health HTTP/1.1" 200 -
[Minecraft Interface] [MINECRAFT INTERFACE] /inventory endpoint called
[Minecraft Interface] [MINECRAFT INTERFACE] Inventory - Bot not connected, returning 503
[Minecraft Interface] [SSE] Bot state client connected (2 total)
[Minecraft Interface] [BeliefBus] Entity belief ingestion activated (5Hz)
[Minecraft Interface] [BeliefBus] Cognition emission activated (1Hz)
[Minecraft Interface] [BeliefBus] Started (system ready)
[Cognition] 2026-02-14T22:58:05.700Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/api/cognitive-stream statusCode=200 durationMs=0 operationType=api_request success=true
[2026-02-14T22:58:06.267Z] [Dashboard] [HEALTH] Service is healthy and ready
[Planning] [livestream] Dashboard UP
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 14:58:06] "GET /health HTTP/1.1" 200 -
[Planning] [readiness] minecraft: down → up
[Planning] [readiness] dashboard: down → up
[Planning] [Planning] Starting executor — system ready and dependencies reachable
[Planning] [Planning] Self-healing: executor started via fast retry probe
[Planning] ✅ [AuditLogger] Started audit session: executor-1771109886327
[Planning] [Planning] Audit session started: executor-1771109886327

Waiting for services to start...
[Minecraft Interface] Observation broadcast started (30s intervals)
[Minecraft Interface] [Prismarine] Viewer started at http://localhost:3006
[Minecraft Interface] [Prismarine] MC 1.21.9 supported (static)
[Minecraft Interface] Prismarine viewer web server running on *:3006
[Minecraft Interface] [NavigationBridge] Pathfinder initialized (version 1.21.9)
[Minecraft Interface] [mineflayer] Emitted mcData subset for version 1.21.9 (4 features, 790 version entries)
[Minecraft Interface] [MINECRAFT INTERFACE] Bot state updated: {
[Minecraft Interface]   position: { x: -276.49983589997106, y: 65, z: 144.30686227785495 },
[Minecraft Interface]   health: 5.833334922790527,
[Minecraft Interface]   inventoryItems: 3
[Minecraft Interface] }
[Planning] [WorldStateManager] State update: {
[Planning]   connected: true,
[Planning]   position: { x: -276.49983589997106, y: 65, z: 144.30686227785495 },
[Planning]   health: 5.833334922790527,
[Planning]   inventoryCount: 3
[Planning] }
[Cognition] 2026-02-14T22:58:08.616Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=2 operationType=api_request success=true
[Minecraft Interface] [mineflayer] Emitted mcData subset for version 1.21.9 (4 features, 790 version entries)
[Minecraft Interface] Broadcasting inventory_changed to 2 WS clients
[Cognition] 2026-02-14T22:58:14.641Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=2 operationType=api_request success=true

Checking service health...
[2026-02-14T22:58:15.273Z] [Core API] [HEALTH] Health check passed
[Minecraft Interface] [SSE] Bot state client disconnected (1 remaining)
[2026-02-14T22:58:15.784Z] [Memory] [HEALTH] Health check passed
[Planning] [livestream] MC interface UP
[2026-02-14T22:58:16.286Z] [World] [HEALTH] Health check passed
[Planning] [AUTONOMOUS EXECUTOR] Initializing executor state...
[Planning] Running autonomous task executor...
[Minecraft Interface] [ThreatPerception] localized threat assessment: 1 threats, level: medium
[Minecraft Interface] [ThreatPerception] suppressed 2 LOS logs in last 5000ms (creeper:2)
[Planning] [AUTONOMOUS EXECUTOR] Found 0 active tasks
[Planning] [AUTONOMOUS EXECUTOR] Idle detected: no_tasks (active=0, eligible=0)
[Planning] Idle: no_tasks
[Planning] [AUTONOMOUS EXECUTOR] Bot is idle (no_tasks) — posting lifecycle event to cognition
[Cognition] 2026-02-14T22:58:16.344Z INFO cognition-server event=event_thought_generated tags=event-driven,thought Thought generated event received type=planning preview=I have no active tasks. Observing my surroundings.
[Cognition] 2026-02-14T22:58:16.345Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/api/cognitive-stream/events statusCode=200 durationMs=1 operationType=api_request success=true
[Cognition] 2026-02-14T22:58:16.348Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/api/cognitive-stream statusCode=200 durationMs=1 operationType=api_request success=true
[Sterling] INFO:__main__:Loaded 23 digest expansion entries from ../sterling/config/smoke-expansion-stubs.json
[Cognition] 🧠 Received thought from planning system: observation - Idle episode (sterling executable)
[Cognition] ✅ Thought broadcast to 2 SSE clients
[Cognition] 2026-02-14T22:58:16.355Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/thought-generated statusCode=200 durationMs=1 operationType=api_request success=true
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 14:58:16] "GET /health HTTP/1.1" 200 -
[2026-02-14T22:58:16.792Z] [MLX-LM Sidecar] [HEALTH] Health check passed
[Sterling] INFO:websockets.server:connection open
[2026-02-14T22:58:17.311Z] [Sterling] [HEALTH] Health check passed
[UMAP Service] 127.0.0.1 - - [14/Feb/2026 14:58:17] "GET /health HTTP/1.1" 200 -
[2026-02-14T22:58:17.825Z] [UMAP Service] [HEALTH] Health check passed
[2026-02-14T22:58:18.329Z] [Cognition] [HEALTH] Health check passed
[2026-02-14T22:58:18.839Z] [Planning] [HEALTH] Health check passed
[2026-02-14T22:58:19.349Z] [Minecraft Interface] [HEALTH] Health check passed
[Cognition] 2026-02-14T22:58:19.657Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[2026-02-14T22:58:19.861Z] [Dashboard] [HEALTH] Health check passed

═══════════════════════════════════════════════════════════════
  SERVICES: core✓ memory✓ world✓ mlx✓ sterling✓ umap✓ cognition✓ planning✓ minecraft✓ dashboard✓
═══════════════════════════════════════════════════════════════

✓ All 10 services ready
[2026-02-14T22:58:20.364Z] [INFO] 
Broadcasting system readiness...
[2026-02-14T22:58:20.379Z] [Core API] [HEALTH] Readiness acknowledged (10/10 services)
[2026-02-14T22:58:20.590Z] [Memory] [HEALTH] Readiness acknowledged (10/10 services)
[2026-02-14T22:58:20.799Z] [World] [HEALTH] Readiness acknowledged (10/10 services)
[2026-02-14T22:58:21.003Z] [Cognition] [HEALTH] Readiness acknowledged (10/10 services)
[Cognition] 2026-02-14T22:58:21.003Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/system/ready statusCode=200 durationMs=0 operationType=api_request success=true
[2026-02-14T22:58:21.213Z] [Planning] [HEALTH] Readiness acknowledged (10/10 services)
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 14:58:21] "GET /health HTTP/1.1" 200 -
[2026-02-14T22:58:21.416Z] [Minecraft Interface] [HEALTH] Readiness acknowledged (10/10 services)
[2026-02-14T22:58:21.618Z] [SUCCESS] Readiness broadcast complete (10/10 services ready)

Checking optional external services...
[Sterling] INFO:websockets.server:connection open
  Sterling reasoning server available at ws://localhost:8766
  Minecraft server available at localhost:25565
  Kokoro TTS available at http://localhost:8080
[2026-02-14T22:58:21.655Z] [SUCCESS] 
Conscious Bot System is running!
[2026-02-14T22:58:21.655Z] [INFO] Service Status:
[2026-02-14T22:58:21.655Z] [INFO]   Core API:     http://localhost:3007
[2026-02-14T22:58:21.655Z] [INFO]   Memory:     http://localhost:3001
[2026-02-14T22:58:21.655Z] [INFO]   World:     http://localhost:3004
[2026-02-14T22:58:21.655Z] [INFO]   Cognition:     http://localhost:3003
[2026-02-14T22:58:21.655Z] [INFO]   Planning:     http://localhost:3002
[2026-02-14T22:58:21.655Z] [INFO]   Minecraft Interface:     http://localhost:3005
[2026-02-14T22:58:21.655Z] [INFO]   MLX-LM Sidecar:     http://localhost:5002
[2026-02-14T22:58:21.655Z] [INFO]   Dashboard:     http://localhost:3000
[2026-02-14T22:58:21.655Z] [INFO]   Sterling:     ws://localhost:8766
[2026-02-14T22:58:21.655Z] [INFO]   UMAP Service:     http://localhost:5003
[2026-02-14T22:58:21.655Z] [INFO] 
[2026-02-14T22:58:21.655Z] [INFO] Quick Actions:
[2026-02-14T22:58:21.655Z] [INFO]   Dashboard:     http://localhost:3000
[2026-02-14T22:58:21.655Z] [INFO]   Core API:      http://localhost:3007
[2026-02-14T22:58:21.655Z] [INFO]   Minecraft Bot: http://localhost:3005
[2026-02-14T22:58:21.655Z] [INFO]   MLX-LM Sidecar: http://localhost:5002
[2026-02-14T22:58:21.655Z] [INFO] 
[2026-02-14T22:58:21.655Z] [INFO] Minecraft Commands:
[2026-02-14T22:58:21.655Z] [INFO]   Connect bot: curl -X POST http://localhost:3005/connect
[2026-02-14T22:58:21.655Z] [INFO]   Disconnect bot: curl -X POST http://localhost:3005/disconnect
[2026-02-14T22:58:21.655Z] [INFO]   Get status: curl http://localhost:3005/status
[2026-02-14T22:58:21.655Z] [INFO] 
[2026-02-14T22:58:21.655Z] [INFO] To stop all services:
[2026-02-14T22:58:21.655Z] [INFO]   Press Ctrl+C or run: pnpm kill
[2026-02-14T22:58:21.655Z] [INFO] 
[2026-02-14T22:58:21.655Z] [INFO] Services are running. Press Ctrl+C to stop.
[2026-02-14T22:58:21.655Z] [INFO] Capturing logs for 120s (use --capture-logs=0 for startup only)
[Minecraft Interface] [SSE] Bot state client disconnected (0 remaining)
[Cognition] 2026-02-14T22:58:24.648Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Planning] [CognitiveStream] Fetched 1 actionable thoughts [ '"Idle episode (sterling executable)..."' ]
[Planning] [GoldenRun] Expansion request run_id=88a2bc79-fc55-448b-9dae-834215cc8b4e request_id=sterling_exec_1771109906259_jrsw8x digest=ling_ir:0168
[Sterling] INFO:core.linguistics.expand_by_digest_v1:Bootstrap lowering: gather → 4 concrete step(s)
[Planning] Task added to enhanced integration: Idle episode (sterling executable)
[Planning] [TaskIngestion] {"_diag_version":1,"source":"thought_converter","task_id":"cognitive-task-idle-episode-88a2bc79-fc55-448b-9dae-834215cc8b4e-ling_ir:0168","decision":"created","task_type":"sterling_ir"}
[Planning] [Thought→Task] {"_diag_version":1,"thought_id":"idle-episode","source":"unknown","has_committed_ir_digest":true,"reducer_is_executable":true,"sterling_processed":true,"decision":"created"}
[Cognition] [CognitiveStream] Acked 1/1 thoughts
[Cognition] 2026-02-14T22:58:26.293Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/api/cognitive-stream/ack statusCode=200 durationMs=0 operationType=api_request success=true
[Planning] [CognitiveStream] Acked 1/1 thoughts
[Planning] [Thought-to-task] Census: fetched=1 converted=1 skipped=0 acked=1
[Minecraft Interface] [ThreatPerception] suppressed 2 LOS logs in last 5000ms (creeper:2)
[Planning] [AUTONOMOUS EXECUTOR] Found 1 active tasks
[Planning] [AUTONOMOUS EXECUTOR] Top task: Idle episode (sterling executable)
[Planning] [AUTONOMOUS EXECUTOR] Top task: Idle episode (sterling executable) (sterling_ir)
[Planning] [AUTONOMOUS EXECUTOR] Task status: pending, priority: 0.5
[Planning] [AUTONOMOUS EXECUTOR] Found 1 eligible tasks (of 1 active), executing...
[Planning] [AUTONOMOUS EXECUTOR] Executing task: Idle episode (sterling executable) (sterling_ir)
[Planning] [AUTONOMOUS EXECUTOR] Task details: {
[Planning]   id: 'cognitive-task-idle-episode-88a2bc79-fc55-448b-9dae-834215cc8b4e-ling_ir:0168',
[Planning]   type: 'sterling_ir',
[Planning]   priority: 0.5,
[Planning]   urgency: 0.3,
[Planning]   status: 'pending'
[Planning] }
[Planning] Executing task: Idle episode (sterling executable) (0% complete)
[Planning] [AUTONOMOUS EXECUTOR] Checking bot connection...
[Planning] [AUTONOMOUS EXECUTOR] Bot connected: true
[Planning] [StepDispatch] task=cognitive-task-idle-episode-88a2bc79-fc55-448b-9dae-834215cc8b4e-ling_ir:0168 step=sterling-step-1 planned_leaf=find_resource resolved_leaf=find_resource argsSource=explicit args={"blockType":"sweet_berry_bush","radius":32,"maxResults":1,"lowered_from":"gather","theme":"food"}
[Planning] Updated task cognitive-task-idle-episode-88a2bc79-fc55-448b-9dae-834215cc8b4e-ling_ir:0168 status to active
[Planning] Task lifecycle event: task_started for task: Idle episode (sterling executable)
[Planning] [toolExecutor] Executing tool: minecraft.find_resource (normalized: minecraft.find_resource) with args: {
[Planning]   blockType: 'sweet_berry_bush',
[Planning]   radius: 32,
[Planning]   maxResults: 1,
[Planning]   lowered_from: 'gather',
[Planning]   theme: 'food'
[Planning] }
[Planning] [toolExecutor] → find_resource args={"blockType":"sweet_berry_bush","radius":32,"maxResults":1,"lowered_from":"gather","theme":"food"}
[Minecraft Interface] [MC/action] → type=find_resource params={"blockType":"sweet_berry_bush","radius":32,"maxResults":1,"lowered_from":"gather","theme":"food"}
[Cognition] [CognitiveStream] Acked 0/1 thoughts
[Cognition] 2026-02-14T22:58:26.367Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/api/cognitive-stream/ack statusCode=200 durationMs=0 operationType=api_request success=true
[Minecraft Interface] Metric: find_resource_count = 0 undefined
[Minecraft Interface] [MC/leaf] find_resource status=success duration=278ms
[Minecraft Interface] [MC/action] ← type=find_resource status=ok duration=278ms
[Planning] [toolExecutor] ← find_resource ok (282ms)
[Planning] ✅ [AuditLogger] tool_executed (282ms)
[Planning] [Verification] No verifier for leaf 'find_resource' — allowing progression
[Planning] Task progress updated: Idle episode (sterling executable) - 25% (active -> active)
[Planning] [MCP] Bot instance updated successfully
[Minecraft Interface] Bot instance updated in planning server
[Cognition] 2026-02-14T22:58:30.652Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 14:58:35] "GET /health HTTP/1.1" 200 -
[Cognition] 2026-02-14T22:58:35.655Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 14:58:35] "GET /health HTTP/1.1" 200 -
[Minecraft Interface] [ThreatPerception] suppressed 2 LOS logs in last 5000ms (creeper:2)
[Planning] [AUTONOMOUS EXECUTOR] Top task: Idle episode (sterling executable) (sterling_ir)
[Planning] [AUTONOMOUS EXECUTOR] Task status: active, priority: 0.5
[Planning] [AUTONOMOUS EXECUTOR] Found 1 eligible tasks (of 1 active), executing...
[Planning] [AUTONOMOUS EXECUTOR] Executing task: Idle episode (sterling executable) (sterling_ir)
[Planning] [AUTONOMOUS EXECUTOR] Task details: {
[Planning]   id: 'cognitive-task-idle-episode-88a2bc79-fc55-448b-9dae-834215cc8b4e-ling_ir:0168',
[Planning]   type: 'sterling_ir',
[Planning]   priority: 0.5,
[Planning]   urgency: 0.3,
[Planning]   status: 'active'
[Planning] }
[Planning] [AUTONOMOUS EXECUTOR] Checking bot connection...
[Planning] [AUTONOMOUS EXECUTOR] Bot connected: true
[Planning] [StepDispatch] task=cognitive-task-idle-episode-88a2bc79-fc55-448b-9dae-834215cc8b4e-ling_ir:0168 step=sterling-step-2 planned_leaf=dig_block resolved_leaf=dig_block argsSource=explicit args={"blockType":"sweet_berry_bush","lowered_from":"gather","theme":"food"}
[Planning] [toolExecutor] Executing tool: minecraft.dig_block (normalized: minecraft.dig_block) with args: {
[Planning]   blockType: 'sweet_berry_bush',
[Planning]   lowered_from: 'gather',
[Planning]   theme: 'food'
[Planning] }
[Planning] [toolExecutor] Blocked dispatch: dig_block has _error marker: missing_required_arg:pos
[Minecraft Interface] [Observation] Cognition service reachable
[Minecraft Interface] [MINECRAFT INTERFACE] Bot state updated: {
[Minecraft Interface]   position: { x: -276.49983589997106, y: 65, z: 144.30686227785495 },
[Minecraft Interface]   health: 5.833334922790527,
[Minecraft Interface]   inventoryItems: 3
[Minecraft Interface] }
[Cognition] 2026-02-14T22:58:41.658Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[Planning] Running autonomous task executor...
[Minecraft Interface] [ThreatPerception] localized threat assessment: 1 threats, level: medium
[Minecraft Interface] [ThreatPerception] suppressed 2 LOS logs in last 5000ms (creeper:2)
[Planning] [AUTONOMOUS EXECUTOR] Top task: Idle episode (sterling executable) (sterling_ir)
[Planning] [AUTONOMOUS EXECUTOR] Task status: active, priority: 0.5
[Planning] [AUTONOMOUS EXECUTOR] Found 1 eligible tasks (of 1 active), executing...
[Planning] [AUTONOMOUS EXECUTOR] Executing task: Idle episode (sterling executable) (sterling_ir)
[Planning] [AUTONOMOUS EXECUTOR] Task details: {
[Planning]   id: 'cognitive-task-idle-episode-88a2bc79-fc55-448b-9dae-834215cc8b4e-ling_ir:0168',
[Planning]   type: 'sterling_ir',
[Planning]   priority: 0.5,
[Planning]   urgency: 0.3,
[Planning]   status: 'active'
[Planning] }
[Planning] [AUTONOMOUS EXECUTOR] Checking bot connection...
[Planning] [AUTONOMOUS EXECUTOR] Bot connected: true
[Planning] [StepDispatch] task=cognitive-task-idle-episode-88a2bc79-fc55-448b-9dae-834215cc8b4e-ling_ir:0168 step=sterling-step-2 planned_leaf=dig_block resolved_leaf=dig_block argsSource=explicit args={"blockType":"sweet_berry_bush","lowered_from":"gather","theme":"food"}
[Planning] [toolExecutor] Executing tool: minecraft.dig_block (normalized: minecraft.dig_block) with args: {
[Planning]   blockType: 'sweet_berry_bush',
[Planning]   lowered_from: 'gather',
[Planning]   theme: 'food'
[Planning] }
[Planning] [toolExecutor] Blocked dispatch: dig_block has _error marker: missing_required_arg:pos
[Cognition] 2026-02-14T22:58:46.662Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Cognition] 2026-02-14T22:58:51.664Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 14:58:56] "GET /health HTTP/1.1" 200 -
[Minecraft Interface] [ThreatPerception] suppressed 1 LOS logs in last 5000ms (creeper:1)
[Planning] [AUTONOMOUS EXECUTOR] Top task: Idle episode (sterling executable) (sterling_ir)
[Planning] [AUTONOMOUS EXECUTOR] Task status: active, priority: 0.5
[Planning] [AUTONOMOUS EXECUTOR] Found 1 eligible tasks (of 1 active), executing...
[Planning] [AUTONOMOUS EXECUTOR] Executing task: Idle episode (sterling executable) (sterling_ir)
[Planning] [AUTONOMOUS EXECUTOR] Task details: {
[Planning]   id: 'cognitive-task-idle-episode-88a2bc79-fc55-448b-9dae-834215cc8b4e-ling_ir:0168',
[Planning]   type: 'sterling_ir',
[Planning]   priority: 0.5,
[Planning]   urgency: 0.3,
[Planning]   status: 'active'
[Planning] }
[Planning] Executing task: Idle episode (sterling executable) (25% complete)
[Planning] [AUTONOMOUS EXECUTOR] Checking bot connection...
[Planning] [AUTONOMOUS EXECUTOR] Bot connected: true
[Planning] [StepDispatch] task=cognitive-task-idle-episode-88a2bc79-fc55-448b-9dae-834215cc8b4e-ling_ir:0168 step=sterling-step-2 planned_leaf=dig_block resolved_leaf=dig_block argsSource=explicit args={"blockType":"sweet_berry_bush","lowered_from":"gather","theme":"food"}
[Planning] [toolExecutor] Executing tool: minecraft.dig_block (normalized: minecraft.dig_block) with args: {
[Planning]   blockType: 'sweet_berry_bush',
[Planning]   lowered_from: 'gather',
[Planning]   theme: 'food'
[Planning] }
[Planning] [toolExecutor] Blocked dispatch: dig_block has _error marker: missing_required_arg:pos
[Planning] [PlanRoute] {
[Planning]   backend: 'unplannable',
[Planning]   requiredRig: null,
[Planning]   reason: 'no-requirement',
[Planning]   taskTitle: 'Idle episode (sterling executable)'
[Planning] }
[Planning] [Lifecycle→Review] failed: task cognitive-task-idle-episode-88a2bc79-fc55-448b-9dae-834215cc8b4e-ling_ir:0168
[Planning] Task progress updated: Idle episode (sterling executable) - 25% (active -> failed)
[Cognition] 2026-02-14T22:58:56.348Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/api/task-review statusCode=200 durationMs=0 operationType=api_request success=true
[Cognition] 2026-02-14T22:58:56.668Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Planning] [MCP] Bot instance updated successfully
[Minecraft Interface] Bot instance updated in planning server
[Cognition] 2026-02-14T22:59:01.673Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 14:59:05] "GET /health HTTP/1.1" 200 -
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 14:59:05] "GET /health HTTP/1.1" 200 -
[Minecraft Interface] [ThreatPerception] suppressed 1 LOS logs in last 5000ms (creeper:1)
[Planning] [AUTONOMOUS EXECUTOR] Found 0 active tasks
[Cognition] 🧠 Received thought from planning system: observation - Idle episode (sterling executable)
[Cognition] ✅ Thought broadcast to 2 SSE clients
[Cognition] 2026-02-14T22:59:06.351Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/thought-generated statusCode=200 durationMs=1 operationType=api_request success=true
[Cognition] 2026-02-14T22:59:06.673Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Minecraft Interface] [MINECRAFT INTERFACE] Bot state updated: {
[Minecraft Interface]   position: { x: -276.49983589997106, y: 65, z: 144.30686227785495 },
[Minecraft Interface]   health: 5.833334922790527,
[Minecraft Interface]   inventoryItems: 3
[Minecraft Interface] }
[Cognition] 2026-02-14T22:59:11.678Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Cognition] 2026-02-14T22:59:14.685Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/api/cognitive-stream statusCode=200 durationMs=1 operationType=api_request success=true
[Cognition] 2026-02-14T22:59:14.686Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=6 operationType=api_request success=true
[Planning] Running autonomous task executor...
[Minecraft Interface] [ThreatPerception] localized threat assessment: 1 threats, level: medium
[Minecraft Interface] [ThreatPerception] suppressed 1 LOS logs in last 5000ms (creeper:1)
[Planning] [AUTONOMOUS EXECUTOR] Found 0 active tasks
[Planning] [AUTONOMOUS EXECUTOR] Idle detected: no_tasks (active=0, eligible=0)
[Planning] Idle: no_tasks
[Cognition] 2026-02-14T22:59:16.686Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/api/cognitive-stream statusCode=200 durationMs=0 operationType=api_request success=true
[Cognition] 2026-02-14T22:59:16.687Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=6 operationType=api_request success=true
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 14:59:17] "POST /api/generate HTTP/1.1" 200 -
[Cognition] {"event":"llm_output_reduction","envelope_schema_version":"1.0.0","envelope_id":"f5816b23a164408c","verbatim_text_hash":"hash_1813c4ec","reduce_latency_ms":1.2054999999963911,"reducer_result_schema_version":"1.1.0","is_executable":false,"degraded_mode":false,"error_class":null,"request_id":null}
[Cognition] 2026-02-14T22:59:17.508Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/api/llm/generate statusCode=200 durationMs=1161 operationType=api_request success=true
[Planning] [KeepAliveIntegration] Generated thought: I feel a slight urgency to find some food. INTENT: food... (eligible=true, sterlingUsed=true)
[Planning] [AUTONOMOUS EXECUTOR] Keep-alive tick: thought=keepaliv, eligible=true
[Cognition] 🧠 Received thought from planning system: observation - I feel a slight urgency to find some food. INTENT: food
[Cognition] ✅ Thought broadcast to 2 SSE clients
[Cognition] 2026-02-14T22:59:17.511Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/thought-generated statusCode=200 durationMs=0 operationType=api_request success=true
[Cognition] 2026-02-14T22:59:18.682Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Cognition] 2026-02-14T22:59:21.684Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[Planning] [CognitiveStream] Fetched 2 actionable thoughts [
[Planning]   '"I feel a slight urgency to find some foo..."',
[Planning]   '"Idle episode (sterling executable)..."'
[Planning] ]
[Planning] [Thought→Task] {"_diag_version":1,"thought_id":"keepalive-17","source":"unknown","has_committed_ir_digest":true,"reducer_is_executable":true,"sterling_processed":true,"decision":"dropped_no_goal_prop","reason":"committed_goal_prop_id is null (expansion will fail without goal target)"}
[Planning] [Thought-to-task] dropped_no_goal_prop: committed_goal_prop_id is null (expansion will fail without goal target)
[Planning] [Thought→Task] {"_diag_version":1,"thought_id":"idle-episode","source":"unknown","has_committed_ir_digest":true,"reducer_is_executable":true,"sterling_processed":true,"decision":"suppressed_dedup","reason":"task category recently failed (up to 120s cooldown)"}
[Planning] [Thought-to-task] suppressed_dedup: task category recently failed (up to 120s cooldown)
[Cognition] [CognitiveStream] Acked 2/2 thoughts
[Cognition] 2026-02-14T22:59:26.262Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/api/cognitive-stream/ack statusCode=200 durationMs=0 operationType=api_request success=true
[Planning] [CognitiveStream] Acked 2/2 thoughts
[Planning] [Thought-to-task] Census: fetched=2 converted=0 skipped=2 acked=2
[Planning] 🔇 Suppressing repeated message: "Running autonomous task executor..." (shown 3 times)
[Planning] [AUTONOMOUS EXECUTOR] Found 0 active tasks
[Cognition] [CognitiveStream] Acked 0/1 thoughts
[Cognition] 2026-02-14T22:59:26.494Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/api/cognitive-stream/ack statusCode=200 durationMs=0 operationType=api_request success=true
[Cognition] 2026-02-14T22:59:26.687Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Planning] [MCP] Bot instance updated successfully
[Minecraft Interface] Bot instance updated in planning server
[Cognition] 2026-02-14T22:59:31.689Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 14:59:35] "GET /health HTTP/1.1" 200 -
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 14:59:35] "GET /health HTTP/1.1" 200 -
[Planning] [AUTONOMOUS EXECUTOR] Found 0 active tasks
[Cognition] 🧠 Received thought from planning system: observation - Idle episode (sterling executable)
[Cognition] ✅ Thought broadcast to 2 SSE clients
[Cognition] 2026-02-14T22:59:36.351Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/thought-generated statusCode=200 durationMs=0 operationType=api_request success=true
[Cognition] 2026-02-14T22:59:36.691Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Minecraft Interface] [MINECRAFT INTERFACE] Bot state updated: {
[Minecraft Interface]   position: { x: -276.49983589997106, y: 65, z: 144.30686227785495 },
[Minecraft Interface]   health: 5.833334922790527,
[Minecraft Interface]   inventoryItems: 3
[Minecraft Interface] }
[Cognition] 2026-02-14T22:59:42.694Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[Minecraft Interface] [mineflayer] Weather changed to: rain
[Minecraft Interface] [mineflayer] Weather changed to: rain
[Planning] Running autonomous task executor...
[Minecraft Interface] [ThreatPerception] localized threat assessment: 1 threats, level: medium
[Planning] [AUTONOMOUS EXECUTOR] Found 0 active tasks
[Planning] [WorldStateManager] State update: {
[Planning]   connected: true,
[Planning]   position: { x: -276.49983589997106, y: 65, z: 144.30686227785495 },
[Planning]   health: 5.833334922790527,
[Planning]   inventoryCount: 3
[Planning] }
[Cognition] 2026-02-14T22:59:47.699Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Cognition] 2026-02-14T22:59:52.704Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Planning] [CognitiveStream] Fetched 1 actionable thoughts [ '"Idle episode (sterling executable)..."' ]
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 14:59:56] "GET /health HTTP/1.1" 200 -
[Planning] [GoldenRun] Expansion request run_id=e3628ba7-59bd-4806-80fe-2c778744e0da request_id=sterling_exec_1771109996260_8rpdsk digest=ling_ir:30de
[Sterling] INFO:core.linguistics.expand_by_digest_v1:Bootstrap lowering: gather → 4 concrete step(s)
[Planning] Task added to enhanced integration: Idle episode (sterling executable)
[Planning] [TaskIngestion] {"_diag_version":1,"source":"thought_converter","task_id":"cognitive-task-idle-episode-e3628ba7-59bd-4806-80fe-2c778744e0da-ling_ir:30de","decision":"created","task_type":"sterling_ir"}
[Planning] [Thought→Task] {"_diag_version":1,"thought_id":"idle-episode","source":"unknown","has_committed_ir_digest":true,"reducer_is_executable":true,"sterling_processed":true,"decision":"created"}
[Cognition] [CognitiveStream] Acked 1/1 thoughts
[Cognition] 2026-02-14T22:59:56.288Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/api/cognitive-stream/ack statusCode=200 durationMs=0 operationType=api_request success=true
[Planning] [CognitiveStream] Acked 1/1 thoughts
[Planning] [Thought-to-task] Census: fetched=1 converted=1 skipped=0 acked=1
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 14:59:56] "GET /health HTTP/1.1" 200 -
[Planning] [AUTONOMOUS EXECUTOR] Found 1 active tasks
[Planning] [AUTONOMOUS EXECUTOR] Top task: Idle episode (sterling executable)
[Planning] [AUTONOMOUS EXECUTOR] Top task: Idle episode (sterling executable) (sterling_ir)
[Planning] [AUTONOMOUS EXECUTOR] Task status: pending, priority: 0.5
[Planning] [AUTONOMOUS EXECUTOR] Found 1 eligible tasks (of 1 active), executing...
[Planning] [AUTONOMOUS EXECUTOR] Executing task: Idle episode (sterling executable) (sterling_ir)
[Planning] [AUTONOMOUS EXECUTOR] Task details: {
[Planning]   id: 'cognitive-task-idle-episode-e3628ba7-59bd-4806-80fe-2c778744e0da-ling_ir:30de',
[Planning]   type: 'sterling_ir',
[Planning]   priority: 0.5,
[Planning]   urgency: 0.3,
[Planning]   status: 'pending'
[Planning] }
[Planning] Executing task: Idle episode (sterling executable) (0% complete)
[Planning] [AUTONOMOUS EXECUTOR] Checking bot connection...
[Planning] [AUTONOMOUS EXECUTOR] Bot connected: true
[Planning] [StepDispatch] task=cognitive-task-idle-episode-e3628ba7-59bd-4806-80fe-2c778744e0da-ling_ir:30de step=sterling-step-1 planned_leaf=find_resource resolved_leaf=find_resource argsSource=explicit args={"blockType":"sweet_berry_bush","radius":32,"maxResults":1,"lowered_from":"gather","theme":"food"}
[Planning] Updated task cognitive-task-idle-episode-e3628ba7-59bd-4806-80fe-2c778744e0da-ling_ir:30de status to active
[Planning] Task lifecycle event: task_started for task: Idle episode (sterling executable)
[Planning] [toolExecutor] Executing tool: minecraft.find_resource (normalized: minecraft.find_resource) with args: {
[Planning]   blockType: 'sweet_berry_bush',
[Planning]   radius: 32,
[Planning]   maxResults: 1,
[Planning]   lowered_from: 'gather',
[Planning]   theme: 'food'
[Planning] }
[Planning] [toolExecutor] → find_resource args={"blockType":"sweet_berry_bush","radius":32,"maxResults":1,"lowered_from":"gather","theme":"food"}
[Minecraft Interface] [MC/action] → type=find_resource params={"blockType":"sweet_berry_bush","radius":32,"maxResults":1,"lowered_from":"gather","theme":"food"}
[Cognition] [CognitiveStream] Acked 0/1 thoughts
[Cognition] 2026-02-14T22:59:56.550Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/api/cognitive-stream/ack statusCode=200 durationMs=0 operationType=api_request success=true
[Minecraft Interface] Metric: find_resource_count = 0 undefined
[Minecraft Interface] [MC/leaf] find_resource status=success duration=292ms
[Minecraft Interface] [MC/action] ← type=find_resource status=ok duration=292ms
[Planning] [toolExecutor] ← find_resource ok (295ms)
[Planning] ✅ [AuditLogger] tool_executed (295ms)
[Planning] [Verification] No verifier for leaf 'find_resource' — allowing progression
[Planning] Task progress updated: Idle episode (sterling executable) - 25% (active -> active)
[Cognition] 2026-02-14T22:59:58.707Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Planning] [MCP] Bot instance updated successfully
[Minecraft Interface] Bot instance updated in planning server
[Cognition] 2026-02-14T23:00:03.712Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 15:00:05] "GET /health HTTP/1.1" 200 -
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 15:00:05] "GET /health HTTP/1.1" 200 -
[Planning] [AUTONOMOUS EXECUTOR] Top task: Idle episode (sterling executable) (sterling_ir)
[Planning] [AUTONOMOUS EXECUTOR] Task status: active, priority: 0.5
[Planning] [AUTONOMOUS EXECUTOR] Found 1 eligible tasks (of 1 active), executing...
[Planning] [AUTONOMOUS EXECUTOR] Executing task: Idle episode (sterling executable) (sterling_ir)
[Planning] [AUTONOMOUS EXECUTOR] Task details: {
[Planning]   id: 'cognitive-task-idle-episode-e3628ba7-59bd-4806-80fe-2c778744e0da-ling_ir:30de',
[Planning]   type: 'sterling_ir',
[Planning]   priority: 0.5,
[Planning]   urgency: 0.3,
[Planning]   status: 'active'
[Planning] }
[Planning] [AUTONOMOUS EXECUTOR] Checking bot connection...
[Planning] [AUTONOMOUS EXECUTOR] Bot connected: true
[Planning] [StepDispatch] task=cognitive-task-idle-episode-e3628ba7-59bd-4806-80fe-2c778744e0da-ling_ir:30de step=sterling-step-2 planned_leaf=dig_block resolved_leaf=dig_block argsSource=explicit args={"blockType":"sweet_berry_bush","lowered_from":"gather","theme":"food"}
[Planning] [toolExecutor] Executing tool: minecraft.dig_block (normalized: minecraft.dig_block) with args: {
[Planning]   blockType: 'sweet_berry_bush',
[Planning]   lowered_from: 'gather',
[Planning]   theme: 'food'
[Planning] }
[Planning] [toolExecutor] Blocked dispatch: dig_block has _error marker: missing_required_arg:pos
[Cognition] 2026-02-14T23:00:08.716Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Minecraft Interface] [MINECRAFT INTERFACE] Bot state updated: {
[Minecraft Interface]   position: { x: -276.49983589997106, y: 65, z: 144.30686227785495 },
[Minecraft Interface]   health: 5.833334922790527,
[Minecraft Interface]   inventoryItems: 3
[Minecraft Interface] }
[Cognition] 2026-02-14T23:00:13.720Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Planning] Running autonomous task executor...
[Minecraft Interface] [ThreatPerception] localized threat assessment: 1 threats, level: medium
[Planning] [AUTONOMOUS EXECUTOR] Top task: Idle episode (sterling executable) (sterling_ir)
[Planning] [AUTONOMOUS EXECUTOR] Task status: active, priority: 0.5
[Planning] [AUTONOMOUS EXECUTOR] Found 1 eligible tasks (of 1 active), executing...
[Planning] [AUTONOMOUS EXECUTOR] Executing task: Idle episode (sterling executable) (sterling_ir)
[Planning] [AUTONOMOUS EXECUTOR] Task details: {
[Planning]   id: 'cognitive-task-idle-episode-e3628ba7-59bd-4806-80fe-2c778744e0da-ling_ir:30de',
[Planning]   type: 'sterling_ir',
[Planning]   priority: 0.5,
[Planning]   urgency: 0.3,
[Planning]   status: 'active'
[Planning] }
[Planning] [AUTONOMOUS EXECUTOR] Checking bot connection...
[Planning] [AUTONOMOUS EXECUTOR] Bot connected: true
[Planning] [StepDispatch] task=cognitive-task-idle-episode-e3628ba7-59bd-4806-80fe-2c778744e0da-ling_ir:30de step=sterling-step-2 planned_leaf=dig_block resolved_leaf=dig_block argsSource=explicit args={"blockType":"sweet_berry_bush","lowered_from":"gather","theme":"food"}
[Planning] [toolExecutor] Executing tool: minecraft.dig_block (normalized: minecraft.dig_block) with args: {
[Planning]   blockType: 'sweet_berry_bush',
[Planning]   lowered_from: 'gather',
[Planning]   theme: 'food'
[Planning] }
[Planning] [toolExecutor] Blocked dispatch: dig_block has _error marker: missing_required_arg:pos
[Minecraft Interface] [MINECRAFT INTERFACE] /inventory endpoint called
[Memory] 🚀 Initializing Enhanced Memory System...
[Memory] ✅ Enhanced vector database initialized: conscious_bot_seed_668984074568676532.memory_chunks
[Memory] ✅ Enhanced knowledge graph initialized: knowledge_graph_entities, knowledge_graph_relationships
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 15:00:17] "GET /health HTTP/1.1" 200 -
[Memory] ✅ Enhanced Memory System initialized successfully
[Memory] 🔍 Hybrid search for: "*"
[Memory] 📈 Expanded query: "*"
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 15:00:17] "POST /api/embeddings HTTP/1.1" 200 -
[Memory] ✅ Hybrid search completed: 5 results in 53ms
[Minecraft Interface] [MINECRAFT INTERFACE] /inventory endpoint called
[Memory] 🔍 Hybrid search for: "*"
[Memory] 📈 Expanded query: "*"
[Memory] ✅ Hybrid search completed: 5 results in 4ms
[Cognition] 2026-02-14T23:00:19.722Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       
Startup logs saved to run.log (682 lines)
[Cognition] 2026-02-14T23:00:24.725Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[Planning] [AUTONOMOUS EXECUTOR] Top task: Idle episode (sterling executable) (sterling_ir)
[Planning] [AUTONOMOUS EXECUTOR] Task status: active, priority: 0.5
[Planning] [AUTONOMOUS EXECUTOR] Found 1 eligible tasks (of 1 active), executing...
[Planning] [AUTONOMOUS EXECUTOR] Executing task: Idle episode (sterling executable) (sterling_ir)
[Planning] [AUTONOMOUS EXECUTOR] Task details: {
[Planning]   id: [32m'cognitive-task-idle-episode-e3628ba7-59bd-4806-80fe-2c778744e0da-ling_ir:30de'[39m,
[Planning]   type: [32m'sterling_ir'[39m,
[Planning]   priority: [33m0.5[39m,
[Planning]   urgency: [33m0.3[39m,
[Planning]   status: [32m'active'[39m
[Planning] }
[Planning] Executing task: Idle episode (sterling executable) (25% complete)
[Planning] [AUTONOMOUS EXECUTOR] Checking bot connection...
[Planning] [AUTONOMOUS EXECUTOR] Bot connected: true
[Planning] [StepDispatch] task=cognitive-task-idle-episode-e3628ba7-59bd-4806-80fe-2c778744e0da-ling_ir:30de step=sterling-step-2 planned_leaf=dig_block resolved_leaf=dig_block argsSource=explicit args={"blockType":"sweet_berry_bush","lowered_from":"gather","theme":"food"}
[Planning] [toolExecutor] Executing tool: minecraft.dig_block (normalized: minecraft.dig_block) with args: {
[Planning]   blockType: [32m'sweet_berry_bush'[39m,
[Planning]   lowered_from: [32m'gather'[39m,
[Planning]   theme: [32m'food'[39m
[Planning] }
[Planning] [toolExecutor] Blocked dispatch: dig_block has _error marker: missing_required_arg:pos
[Planning] [PlanRoute] {
[Planning]   backend: [32m'unplannable'[39m,
[Planning]   requiredRig: [1mnull[22m,
[Planning]   reason: [32m'no-requirement'[39m,
[Planning]   taskTitle: [32m'Idle episode (sterling executable)'[39m
[Planning] }
[Planning] [Lifecycle→Review] failed: task cognitive-task-idle-episode-e3628ba7-59bd-4806-80fe-2c778744e0da-ling_ir:30de
[Planning] Task progress updated: Idle episode (sterling executable) - 25% (active -> failed)
[Cognition] 2026-02-14T23:00:26.357Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/api/task-review statusCode=200 durationMs=1 operationType=api_request success=true
[Cognition] 2026-02-14T23:00:29.729Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[Planning] [MCP] Bot instance updated successfully
[Minecraft Interface] Bot instance updated in planning server
[Cognition] 2026-02-14T23:00:34.732Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 15:00:35] "GET /health HTTP/1.1" 200 -
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 15:00:35] "GET /health HTTP/1.1" 200 -
[Planning] [AUTONOMOUS EXECUTOR] Found 0 active tasks
[Planning] [AUTONOMOUS EXECUTOR] Idle detected: no_tasks (active=0, eligible=0)
[Planning] Idle: no_tasks
[Cognition] 🧠 Received thought from planning system: observation - Idle episode (sterling executable)
[Cognition] ✅ Thought broadcast to 2 SSE clients
[Cognition] 2026-02-14T23:00:36.356Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/thought-generated statusCode=200 durationMs=1 operationType=api_request success=true
[Cognition] 2026-02-14T23:00:39.735Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Minecraft Interface] [MINECRAFT INTERFACE] Bot state updated: {
[Minecraft Interface]   position: { x: [33m-276.49983589997106[39m, y: [33m65[39m, z: [33m144.30686227785495[39m },
[Minecraft Interface]   health: [33m5.833334922790527[39m,
[Minecraft Interface]   inventoryItems: [33m3[39m
[Minecraft Interface] }
[Cognition] 2026-02-14T23:00:44.737Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[Planning] Running autonomous task executor...
[Minecraft Interface] [ThreatPerception] localized threat assessment: 1 threats, level: medium
[Planning] [AUTONOMOUS EXECUTOR] Found 0 active tasks
[Cognition] 2026-02-14T23:00:49.740Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Cognition] 2026-02-14T23:00:54.740Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Planning] [CognitiveStream] Fetched 1 actionable thoughts [ [32m'"Idle episode (sterling executable)..."'[39m ]
[Planning] [Thought→Task] {"_diag_version":1,"thought_id":"idle-episode","source":"unknown","has_committed_ir_digest":true,"reducer_is_executable":true,"sterling_processed":true,"decision":"suppressed_dedup","reason":"task category recently failed (up to 120s cooldown)"}
[Planning] [Thought-to-task] suppressed_dedup: task category recently failed (up to 120s cooldown)
[Cognition] [CognitiveStream] Acked 1/1 thoughts
[Cognition] 2026-02-14T23:00:56.271Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/api/cognitive-stream/ack statusCode=200 durationMs=0 operationType=api_request success=true
[Planning] [CognitiveStream] Acked 1/1 thoughts
[Planning] [Thought-to-task] Census: fetched=1 converted=0 skipped=1 acked=1
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 15:00:56] "GET /health HTTP/1.1" 200 -
[Minecraft Interface] [ThreatPerception] suppressed 3 LOS logs in last 5000ms (creeper:2, zombie:1)
[Planning] [AUTONOMOUS EXECUTOR] Found 0 active tasks
[Cognition] 2026-02-14T23:00:59.740Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Planning] [MCP] Bot instance updated successfully
[Minecraft Interface] Bot instance updated in planning server
[Cognition] 2026-02-14T23:01:04.742Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 15:01:05] "GET /health HTTP/1.1" 200 -
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 15:01:05] "GET /health HTTP/1.1" 200 -
[Minecraft Interface] [ThreatPerception] suppressed 3 LOS logs in last 5000ms (creeper:2, zombie:1)
[Planning] [AUTONOMOUS EXECUTOR] Found 0 active tasks
[Cognition] 🧠 Received thought from planning system: observation - Idle episode (sterling executable)
[Cognition] ✅ Thought broadcast to 2 SSE clients
[Cognition] 2026-02-14T23:01:06.360Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/thought-generated statusCode=200 durationMs=0 operationType=api_request success=true
[Cognition] 2026-02-14T23:01:09.743Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Minecraft Interface] [MINECRAFT INTERFACE] Bot state updated: {
[Minecraft Interface]   position: { x: [33m-276.49983589997106[39m, y: [33m65[39m, z: [33m144.30686227785495[39m },
[Minecraft Interface]   health: [33m5.833334922790527[39m,
[Minecraft Interface]   inventoryItems: [33m3[39m
[Minecraft Interface] }
[Cognition] 2026-02-14T23:01:14.748Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/api/cognitive-stream statusCode=200 durationMs=0 operationType=api_request success=true
[Cognition] 2026-02-14T23:01:14.749Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=4 operationType=api_request success=true
[Planning] Running autonomous task executor...
[Minecraft Interface] [ThreatPerception] localized threat assessment: 1 threats, level: medium
[Minecraft Interface] [ThreatPerception] suppressed 3 LOS logs in last 5000ms (creeper:2, zombie:1)
[Planning] [AUTONOMOUS EXECUTOR] Found 0 active tasks
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 15:01:17] "POST /api/generate HTTP/1.1" 200 -
[Cognition] {"event":"llm_output_reduction","envelope_schema_version":"1.0.0","envelope_id":"a224de84df6e4cee","verbatim_text_hash":"hash_258385bc","reduce_latency_ms":0.23554200000944547,"reducer_result_schema_version":"1.1.0","is_executable":false,"degraded_mode":false,"error_class":null,"request_id":null}
[Cognition] 2026-02-14T23:01:17.682Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/api/llm/generate statusCode=200 durationMs=1324 operationType=api_request success=true
[Planning] [KeepAliveIntegration] Generated thought: _output I feel a slight ache in my muscles. I should priorit... (eligible=true, sterlingUsed=true)
[Planning] [AUTONOMOUS EXECUTOR] Keep-alive tick: thought=keepaliv, eligible=true
[Cognition] 🧠 Received thought from planning system: observation - _output I feel a slight ache in my muscles. I should priorit
[Cognition] ✅ Thought broadcast to 2 SSE clients
[Cognition] 2026-02-14T23:01:17.685Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/thought-generated statusCode=200 durationMs=0 operationType=api_request success=true
[Cognition] 2026-02-14T23:01:17.753Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/api/cognitive-stream statusCode=200 durationMs=1 operationType=api_request success=true
[Cognition] 2026-02-14T23:01:17.753Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=6 operationType=api_request success=true
[Cognition] 2026-02-14T23:01:18.749Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Cognition] 2026-02-14T23:01:19.749Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Cognition] 2026-02-14T23:01:24.753Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[Planning] [CognitiveStream] Fetched 2 actionable thoughts [
[Planning]   [32m'"_output I feel a slight ache in my muscl..."'[39m,
[Planning]   [32m'"Idle episode (sterling executable)..."'[39m
[Planning] ]
[Planning] [Thought→Task] {"_diag_version":1,"thought_id":"keepalive-17","source":"unknown","has_committed_ir_digest":true,"reducer_is_executable":true,"sterling_processed":true,"decision":"dropped_no_goal_prop","reason":"committed_goal_prop_id is null (expansion will fail without goal target)"}
[Planning] [Thought-to-task] dropped_no_goal_prop: committed_goal_prop_id is null (expansion will fail without goal target)
[Planning] [GoldenRun] Expansion request run_id=f2c3c6cf-3a01-4671-83dd-f3ef1dc86e1b request_id=sterling_exec_1771110086265_lmqdjv digest=ling_ir:2b9d
[Sterling] INFO:core.linguistics.expand_by_digest_v1:Bootstrap lowering: gather → 4 concrete step(s)
[Planning] Task added to enhanced integration: Idle episode (sterling executable)
[Planning] [TaskIngestion] {"_diag_version":1,"source":"thought_converter","task_id":"cognitive-task-idle-episode-f2c3c6cf-3a01-4671-83dd-f3ef1dc86e1b-ling_ir:2b9d","decision":"created","task_type":"sterling_ir"}
[Planning] [Thought→Task] {"_diag_version":1,"thought_id":"idle-episode","source":"unknown","has_committed_ir_digest":true,"reducer_is_executable":true,"sterling_processed":true,"decision":"created"}
[Cognition] [CognitiveStream] Acked 2/2 thoughts
[Cognition] 2026-02-14T23:01:26.297Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/api/cognitive-stream/ack statusCode=200 durationMs=0 operationType=api_request success=true
[Planning] [CognitiveStream] Acked 2/2 thoughts
[Planning] [Thought-to-task] Census: fetched=2 converted=1 skipped=1 acked=2
[Minecraft Interface] [ThreatPerception] suppressed 3 LOS logs in last 5000ms (creeper:2, zombie:1)
[Planning] [AUTONOMOUS EXECUTOR] Found 1 active tasks
[Planning] [AUTONOMOUS EXECUTOR] Top task: Idle episode (sterling executable)
[Planning] [AUTONOMOUS EXECUTOR] Top task: Idle episode (sterling executable) (sterling_ir)
[Planning] [AUTONOMOUS EXECUTOR] Task status: pending, priority: 0.5
[Planning] [AUTONOMOUS EXECUTOR] Found 1 eligible tasks (of 1 active), executing...
[Planning] [AUTONOMOUS EXECUTOR] Executing task: Idle episode (sterling executable) (sterling_ir)
[Planning] [AUTONOMOUS EXECUTOR] Task details: {
[Planning]   id: [32m'cognitive-task-idle-episode-f2c3c6cf-3a01-4671-83dd-f3ef1dc86e1b-ling_ir:2b9d'[39m,
[Planning]   type: [32m'sterling_ir'[39m,
[Planning]   priority: [33m0.5[39m,
[Planning]   urgency: [33m0.3[39m,
[Planning]   status: [32m'pending'[39m
[Planning] }
[Planning] Executing task: Idle episode (sterling executable) (0% complete)
[Planning] [AUTONOMOUS EXECUTOR] Checking bot connection...
[Planning] [AUTONOMOUS EXECUTOR] Bot connected: true
[Planning] [StepDispatch] task=cognitive-task-idle-episode-f2c3c6cf-3a01-4671-83dd-f3ef1dc86e1b-ling_ir:2b9d step=sterling-step-1 planned_leaf=find_resource resolved_leaf=find_resource argsSource=explicit args={"blockType":"sweet_berry_bush","radius":32,"maxResults":1,"lowered_from":"gather","theme":"food"}
[Planning] Updated task cognitive-task-idle-episode-f2c3c6cf-3a01-4671-83dd-f3ef1dc86e1b-ling_ir:2b9d status to active
[Planning] Task lifecycle event: task_started for task: Idle episode (sterling executable)
[Planning] [toolExecutor] Executing tool: minecraft.find_resource (normalized: minecraft.find_resource) with args: {
[Planning]   blockType: [32m'sweet_berry_bush'[39m,
[Planning]   radius: [33m32[39m,
[Planning]   maxResults: [33m1[39m,
[Planning]   lowered_from: [32m'gather'[39m,
[Planning]   theme: [32m'food'[39m
[Planning] }
[Planning] [toolExecutor] → find_resource args={"blockType":"sweet_berry_bush","radius":32,"maxResults":1,"lowered_from":"gather","theme":"food"}
[Minecraft Interface] [MC/action] → type=find_resource params={"blockType":"sweet_berry_bush","radius":32,"maxResults":1,"lowered_from":"gather","theme":"food"}
[Minecraft Interface] Metric: find_resource_count = 0 [90mundefined[39m
[Minecraft Interface] [MC/leaf] find_resource status=success duration=261ms
[Minecraft Interface] [MC/action] ← type=find_resource status=ok duration=261ms
[Planning] [toolExecutor] ← find_resource ok (263ms)
[Planning] ✅ [AuditLogger] tool_executed (263ms)
[Planning] [Verification] No verifier for leaf 'find_resource' — allowing progression
[Planning] Task progress updated: Idle episode (sterling executable) - 25% (active -> active)
[Cognition] [CognitiveStream] Acked 0/2 thoughts
[Cognition] 2026-02-14T23:01:26.731Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/api/cognitive-stream/ack statusCode=200 durationMs=0 operationType=api_request success=true
[Cognition] 2026-02-14T23:01:27.755Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[Cognition] 2026-02-14T23:01:29.757Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[Planning] [MCP] Bot instance updated successfully
[Minecraft Interface] Bot instance updated in planning server
[Cognition] 2026-02-14T23:01:30.758Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[Cognition] 2026-02-14T23:01:33.757Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 15:01:35] "GET /health HTTP/1.1" 200 -
[Cognition] 2026-02-14T23:01:35.759Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[Minecraft Interface] [ThreatPerception] suppressed 3 LOS logs in last 5000ms (creeper:2, zombie:1)
[Planning] [AUTONOMOUS EXECUTOR] Top task: Idle episode (sterling executable) (sterling_ir)
[Planning] [AUTONOMOUS EXECUTOR] Task status: active, priority: 0.5
[Planning] [AUTONOMOUS EXECUTOR] Found 1 eligible tasks (of 1 active), executing...
[Planning] [AUTONOMOUS EXECUTOR] Executing task: Idle episode (sterling executable) (sterling_ir)
[Planning] [AUTONOMOUS EXECUTOR] Task details: {
[Planning]   id: [32m'cognitive-task-idle-episode-f2c3c6cf-3a01-4671-83dd-f3ef1dc86e1b-ling_ir:2b9d'[39m,
[Planning]   type: [32m'sterling_ir'[39m,
[Planning]   priority: [33m0.5[39m,
[Planning]   urgency: [33m0.3[39m,
[Planning]   status: [32m'active'[39m
[Planning] }
[Planning] [AUTONOMOUS EXECUTOR] Checking bot connection...
[Planning] [AUTONOMOUS EXECUTOR] Bot connected: true
[Planning] [StepDispatch] task=cognitive-task-idle-episode-f2c3c6cf-3a01-4671-83dd-f3ef1dc86e1b-ling_ir:2b9d step=sterling-step-2 planned_leaf=dig_block resolved_leaf=dig_block argsSource=explicit args={"blockType":"sweet_berry_bush","lowered_from":"gather","theme":"food"}
[Planning] [toolExecutor] Executing tool: minecraft.dig_block (normalized: minecraft.dig_block) with args: {
[Planning]   blockType: [32m'sweet_berry_bush'[39m,
[Planning]   lowered_from: [32m'gather'[39m,
[Planning]   theme: [32m'food'[39m
[Planning] }
[Planning] [toolExecutor] Blocked dispatch: dig_block has _error marker: missing_required_arg:pos
[Cognition] 2026-02-14T23:01:37.760Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[Cognition] 2026-02-14T23:01:38.761Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[Minecraft Interface] [MINECRAFT INTERFACE] Bot state updated: {
[Minecraft Interface]   position: { x: [33m-276.49983589997106[39m, y: [33m65[39m, z: [33m144.30686227785495[39m },
[Minecraft Interface]   health: [33m5.833334922790527[39m,
[Minecraft Interface]   inventoryItems: [33m3[39m
[Minecraft Interface] }
[Cognition] 2026-02-14T23:01:40.763Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[Cognition] 2026-02-14T23:01:45.769Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Planning] Running autonomous task executor...
[Minecraft Interface] [ThreatPerception] localized threat assessment: 1 threats, level: medium
[Minecraft Interface] [ThreatPerception] suppressed 2 LOS logs in last 5000ms (creeper:1, zombie:1)
[Planning] [AUTONOMOUS EXECUTOR] Top task: Idle episode (sterling executable) (sterling_ir)
[Planning] [AUTONOMOUS EXECUTOR] Task status: active, priority: 0.5
[Planning] [AUTONOMOUS EXECUTOR] Found 1 eligible tasks (of 1 active), executing...
[Planning] [AUTONOMOUS EXECUTOR] Executing task: Idle episode (sterling executable) (sterling_ir)
[Planning] [AUTONOMOUS EXECUTOR] Task details: {
[Planning]   id: [32m'cognitive-task-idle-episode-f2c3c6cf-3a01-4671-83dd-f3ef1dc86e1b-ling_ir:2b9d'[39m,
[Planning]   type: [32m'sterling_ir'[39m,
[Planning]   priority: [33m0.5[39m,
[Planning]   urgency: [33m0.3[39m,
[Planning]   status: [32m'active'[39m
[Planning] }
[Planning] [AUTONOMOUS EXECUTOR] Checking bot connection...
[Planning] [AUTONOMOUS EXECUTOR] Bot connected: true
[Planning] [StepDispatch] task=cognitive-task-idle-episode-f2c3c6cf-3a01-4671-83dd-f3ef1dc86e1b-ling_ir:2b9d step=sterling-step-2 planned_leaf=dig_block resolved_leaf=dig_block argsSource=explicit args={"blockType":"sweet_berry_bush","lowered_from":"gather","theme":"food"}
[Planning] [toolExecutor] Executing tool: minecraft.dig_block (normalized: minecraft.dig_block) with args: {
[Planning]   blockType: [32m'sweet_berry_bush'[39m,
[Planning]   lowered_from: [32m'gather'[39m,
[Planning]   theme: [32m'food'[39m
[Planning] }
[Planning] [toolExecutor] Blocked dispatch: dig_block has _error marker: missing_required_arg:pos
[Cognition] 2026-02-14T23:01:49.772Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/api/cognitive-stream statusCode=200 durationMs=0 operationType=api_request success=true
[Cognition] 2026-02-14T23:01:49.774Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=5 operationType=api_request success=true
[Cognition] 2026-02-14T23:01:50.770Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Cognition] 2026-02-14T23:01:54.773Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[Cognition] 2026-02-14T23:01:55.775Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 15:01:56] "GET /health HTTP/1.1" 200 -
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 15:01:56] "GET /health HTTP/1.1" 200 -
[Minecraft Interface] [ThreatPerception] suppressed 1 LOS logs in last 5000ms (zombie:1)
[Planning] [AUTONOMOUS EXECUTOR] Top task: Idle episode (sterling executable) (sterling_ir)
[Planning] [AUTONOMOUS EXECUTOR] Task status: active, priority: 0.5
[Planning] [AUTONOMOUS EXECUTOR] Found 1 eligible tasks (of 1 active), executing...
[Planning] [AUTONOMOUS EXECUTOR] Executing task: Idle episode (sterling executable) (sterling_ir)
[Planning] [AUTONOMOUS EXECUTOR] Task details: {
[Planning]   id: [32m'cognitive-task-idle-episode-f2c3c6cf-3a01-4671-83dd-f3ef1dc86e1b-ling_ir:2b9d'[39m,
[Planning]   type: [32m'sterling_ir'[39m,
[Planning]   priority: [33m0.5[39m,
[Planning]   urgency: [33m0.3[39m,
[Planning]   status: [32m'active'[39m
[Planning] }
[Planning] Executing task: Idle episode (sterling executable) (25% complete)
[Planning] [AUTONOMOUS EXECUTOR] Checking bot connection...
[Planning] [AUTONOMOUS EXECUTOR] Bot connected: true
[Planning] [StepDispatch] task=cognitive-task-idle-episode-f2c3c6cf-3a01-4671-83dd-f3ef1dc86e1b-ling_ir:2b9d step=sterling-step-2 planned_leaf=dig_block resolved_leaf=dig_block argsSource=explicit args={"blockType":"sweet_berry_bush","lowered_from":"gather","theme":"food"}
[Planning] [toolExecutor] Executing tool: minecraft.dig_block (normalized: minecraft.dig_block) with args: {
[Planning]   blockType: [32m'sweet_berry_bush'[39m,
[Planning]   lowered_from: [32m'gather'[39m,
[Planning]   theme: [32m'food'[39m
[Planning] }
[Planning] [toolExecutor] Blocked dispatch: dig_block has _error marker: missing_required_arg:pos
[Planning] [PlanRoute] {
[Planning]   backend: [32m'unplannable'[39m,
[Planning]   requiredRig: [1mnull[22m,
[Planning]   reason: [32m'no-requirement'[39m,
[Planning]   taskTitle: [32m'Idle episode (sterling executable)'[39m
[Planning] }
[Planning] [LoopBreaker:shadow] Loop detected: signatureId=7a9f47fc9e75cf52 occurrences=3 tasks=[cognitive-task-idle-episode-88a2bc79-fc55-448b-9dae-834215cc8b4e-ling_ir:0168,cognitive-task-idle-episode-e3628ba7-59bd-4806-80fe-2c778744e0da-ling_ir:30de,cognitive-task-idle-episode-f2c3c6cf-3a01-4671-83dd-f3ef1dc86e1b-ling_ir:2b9d]
[Planning] [Lifecycle→Review] failed: task cognitive-task-idle-episode-f2c3c6cf-3a01-4671-83dd-f3ef1dc86e1b-ling_ir:2b9d
[Planning] [LoopBreaker:shadow] Loop detected: signatureId=a3cbcb71e955ad37 occurrences=3 tasks=[cognitive-task-idle-episode-88a2bc79-fc55-448b-9dae-834215cc8b4e-ling_ir:0168,cognitive-task-idle-episode-e3628ba7-59bd-4806-80fe-2c778744e0da-ling_ir:30de,cognitive-task-idle-episode-f2c3c6cf-3a01-4671-83dd-f3ef1dc86e1b-ling_ir:2b9d]
[Planning] Task progress updated: Idle episode (sterling executable) - 25% (active -> failed)
[Cognition] 2026-02-14T23:01:56.365Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/api/task-review statusCode=200 durationMs=0 operationType=api_request success=true
[Cognition] 2026-02-14T23:01:58.777Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[Planning] [MCP] Bot instance updated successfully
[Minecraft Interface] Bot instance updated in planning server
[Cognition] 2026-02-14T23:02:00.777Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 15:02:05] "GET /health HTTP/1.1" 200 -
[Cognition] 2026-02-14T23:02:05.780Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[Minecraft Interface] [ThreatPerception] suppressed 2 LOS logs in last 5000ms (zombie:2)
[Planning] [AUTONOMOUS EXECUTOR] Found 0 active tasks
[Planning] [AUTONOMOUS EXECUTOR] Idle detected: no_tasks (active=0, eligible=0)
[Planning] 🔇 Suppressing repeated message: "Idle: no_tasks" (shown 3 times)
[Cognition] 🧠 Received thought from planning system: observation - Idle episode (sterling executable)
[Cognition] ✅ Thought broadcast to 2 SSE clients
[Cognition] 2026-02-14T23:02:06.367Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/thought-generated statusCode=200 durationMs=1 operationType=api_request success=true
[Minecraft Interface] [MINECRAFT INTERFACE] Bot state updated: {
[Minecraft Interface]   position: { x: [33m-276.49983589997106[39m, y: [33m65[39m, z: [33m144.30686227785495[39m },
[Minecraft Interface]   health: [33m5.833334922790527[39m,
[Minecraft Interface]   inventoryItems: [33m3[39m
[Minecraft Interface] }
[Cognition] 2026-02-14T23:02:10.782Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Cognition] 2026-02-14T23:02:15.786Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Planning] Running autonomous task executor...
[Minecraft Interface] [ThreatPerception] localized threat assessment: 1 threats, level: medium
[Minecraft Interface] [ThreatPerception] suppressed 3 LOS logs in last 5000ms (zombie:3)
[Planning] [AUTONOMOUS EXECUTOR] Found 0 active tasks
[Minecraft Interface] [MINECRAFT INTERFACE] /inventory endpoint called
[Memory] 🔍 Hybrid search for: "*"
[Memory] 📈 Expanded query: "*"
[Memory] ✅ Hybrid search completed: 5 results in 19ms
[Minecraft Interface] [MINECRAFT INTERFACE] /inventory endpoint called
[Memory] 🔍 Hybrid search for: "*"
[Memory] 📈 Expanded query: "*"
[Memory] ✅ Hybrid search completed: 5 results in 4ms
[Cognition] 2026-02-14T23:02:21.789Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 15:02:23] "GET /health HTTP/1.1" 200 -
[Planning] [CognitiveStream] Fetched 1 actionable thoughts [ [32m'"Idle episode (sterling executable)..."'[39m ]
[Planning] [LoopBreaker:shadow] Loop detected: signatureId=6ff845505d2fa93d occurrences=3 tasks=[dedup_phantom_idle-episode-d0ddcd2d-27d2-4961-bd29-5d2afc04cfd2,dedup_phantom_idle-episode-bf9dee03-c692-4c58-be47-83a1796566e8,dedup_phantom_idle-episode-600f85a3-2e2c-4433-9fd0-8d5d18440e59]
[Planning] [Thought→Task] {"_diag_version":1,"thought_id":"idle-episode","source":"unknown","has_committed_ir_digest":true,"reducer_is_executable":true,"sterling_processed":true,"decision":"suppressed_dedup","reason":"task category recently failed (up to 120s cooldown)"}
[Planning] [Thought-to-task] suppressed_dedup: task category recently failed (up to 120s cooldown)
[Cognition] [CognitiveStream] Acked 1/1 thoughts
[Cognition] 2026-02-14T23:02:26.270Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/api/cognitive-stream/ack statusCode=200 durationMs=0 operationType=api_request success=true
[Planning] [CognitiveStream] Acked 1/1 thoughts
[Planning] [Thought-to-task] Census: fetched=1 converted=0 skipped=1 acked=1
[Minecraft Interface] [ThreatPerception] suppressed 3 LOS logs in last 5000ms (zombie:3)
[Planning] [AUTONOMOUS EXECUTOR] Found 0 active tasks
[Cognition] 2026-02-14T23:02:26.792Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[Planning] [MCP] Bot instance updated successfully
[Minecraft Interface] Bot instance updated in planning server
[Cognition] 2026-02-14T23:02:31.797Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 15:02:35] "GET /health HTTP/1.1" 200 -
[Minecraft Interface] [ThreatPerception] suppressed 3 LOS logs in last 5000ms (zombie:3)
[Planning] [AUTONOMOUS EXECUTOR] Found 0 active tasks
[Cognition] 2026-02-14T23:02:36.799Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Minecraft Interface] [MINECRAFT INTERFACE] Bot state updated: {
[Minecraft Interface]   position: { x: [33m-276.49983589997106[39m, y: [33m65[39m, z: [33m144.30686227785495[39m },
[Minecraft Interface]   health: [33m5.833334922790527[39m,
[Minecraft Interface]   inventoryItems: [33m3[39m
[Minecraft Interface] }
[Cognition] 2026-02-14T23:02:41.801Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Planning] Running autonomous task executor...
[Minecraft Interface] [ThreatPerception] localized threat assessment: 1 threats, level: medium
[Minecraft Interface] [ThreatPerception] suppressed 2 LOS logs in last 5000ms (zombie:2)
[Planning] [AUTONOMOUS EXECUTOR] Found 0 active tasks
[Cognition] 2026-02-14T23:02:46.806Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Cognition] 2026-02-14T23:02:51.808Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 15:02:56] "GET /health HTTP/1.1" 200 -
[Minecraft Interface] [ThreatPerception] suppressed 2 LOS logs in last 5000ms (zombie:2)
[Planning] [AUTONOMOUS EXECUTOR] Found 0 active tasks
[Cognition] 2026-02-14T23:02:56.810Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Planning] [MCP] Bot instance updated successfully
[Minecraft Interface] Bot instance updated in planning server
[Cognition] 2026-02-14T23:03:01.814Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 15:03:05] "GET /health HTTP/1.1" 200 -
[Minecraft Interface] [ThreatPerception] suppressed 2 LOS logs in last 5000ms (zombie:2)
[Planning] [AUTONOMOUS EXECUTOR] Found 0 active tasks
[Planning] [AUTONOMOUS EXECUTOR] Idle detected: no_tasks (active=0, eligible=0)
[Planning] Idle: no_tasks
[Cognition] 2026-02-14T23:03:06.819Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[Minecraft Interface] 🧹 Memory cleanup: 0 chunks remaining
[Minecraft Interface] [MINECRAFT INTERFACE] Bot state updated: {
[Minecraft Interface]   position: { x: [33m-276.49983589997106[39m, y: [33m65[39m, z: [33m144.30686227785495[39m },
[Minecraft Interface]   health: [33m5.833334922790527[39m,
[Minecraft Interface]   inventoryItems: [33m3[39m
[Minecraft Interface] }
[Cognition] 2026-02-14T23:03:11.824Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[Planning] Running autonomous task executor...
[Minecraft Interface] [ThreatPerception] localized threat assessment: 1 threats, level: medium
[Minecraft Interface] [ThreatPerception] suppressed 1 LOS logs in last 5000ms (zombie:1)
[Planning] [AUTONOMOUS EXECUTOR] Found 0 active tasks
[Planning] [AUTONOMOUS EXECUTOR] Bot is idle (no_tasks) — posting lifecycle event to cognition
[Cognition] 2026-02-14T23:03:16.430Z INFO cognition-server event=event_thought_generated tags=event-driven,thought Thought generated event received type=planning preview=I have no active tasks. Observing my surroundings.
[Cognition] 2026-02-14T23:03:16.431Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/api/cognitive-stream/events statusCode=200 durationMs=1 operationType=api_request success=true
[Cognition] 2026-02-14T23:03:16.433Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/api/cognitive-stream statusCode=200 durationMs=1 operationType=api_request success=true
[Cognition] 2026-02-14T23:03:16.824Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Minecraft Interface] [MINECRAFT INTERFACE] /inventory endpoint called
[Memory] 🔍 Hybrid search for: "*"
[Memory] 📈 Expanded query: "*"
[Memory] ✅ Hybrid search completed: 5 results in 28ms
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 15:03:17] "POST /api/generate HTTP/1.1" 200 -
[Cognition] {"event":"llm_output_reduction","envelope_schema_version":"1.0.0","envelope_id":"f6924fcda0339351","verbatim_text_hash":"hash_1dc2a289","reduce_latency_ms":0.18845900002634153,"reducer_result_schema_version":"1.1.0","is_executable":true,"degraded_mode":false,"error_class":null,"request_id":null}
[Cognition] 2026-02-14T23:03:17.889Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/api/llm/generate statusCode=200 durationMs=1516 operationType=api_request success=true
[Cognition] 🧠 Received thought from planning system: observation - I notice the low health and high hunger levels. I will prior
[Cognition] ✅ Thought broadcast to 2 SSE clients
[Cognition] 2026-02-14T23:03:17.893Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/thought-generated statusCode=200 durationMs=1 operationType=api_request success=true
[Planning] [KeepAliveIntegration] Generated thought: I notice the low health and high hunger levels. I will prior... (eligible=true, sterlingUsed=true)
[Planning] [AUTONOMOUS EXECUTOR] Keep-alive tick: thought=keepaliv, eligible=true
[Cognition] 2026-02-14T23:03:21.828Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 15:03:23] "GET /health HTTP/1.1" 200 -
[Planning] [CognitiveStream] Fetched 1 actionable thoughts [ [32m'"I notice the low health and high hunger ..."'[39m ]
[Planning] [Thought→Task] {"_diag_version":1,"thought_id":"keepalive-17","source":"unknown","has_committed_ir_digest":true,"reducer_is_executable":true,"sterling_processed":true,"decision":"dropped_no_goal_prop","reason":"committed_goal_prop_id is null (expansion will fail without goal target)"}
[Planning] [Thought-to-task] dropped_no_goal_prop: committed_goal_prop_id is null (expansion will fail without goal target)
[Cognition] [CognitiveStream] Acked 1/1 thoughts
[Cognition] 2026-02-14T23:03:26.272Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/api/cognitive-stream/ack statusCode=200 durationMs=1 operationType=api_request success=true
[Planning] [CognitiveStream] Acked 1/1 thoughts
[Planning] [Thought-to-task] Census: fetched=1 converted=0 skipped=1 acked=1
[Planning] [AUTONOMOUS EXECUTOR] Found 0 active tasks
[Cognition] [CognitiveStream] Acked 0/1 thoughts
[Cognition] 2026-02-14T23:03:26.448Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/api/cognitive-stream/ack statusCode=200 durationMs=1 operationType=api_request success=true
[Cognition] 2026-02-14T23:03:27.831Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[Planning] [MCP] Bot instance updated successfully
[Minecraft Interface] Bot instance updated in planning server
[Cognition] 2026-02-14T23:03:32.836Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 15:03:35] "GET /health HTTP/1.1" 200 -
[Planning] [AUTONOMOUS EXECUTOR] Found 0 active tasks
[Cognition] 2026-02-14T23:03:37.839Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[Minecraft Interface] [MINECRAFT INTERFACE] Bot state updated: {
[Minecraft Interface]   position: { x: [33m-276.49983589997106[39m, y: [33m65[39m, z: [33m144.30686227785495[39m },
[Minecraft Interface]   health: [33m5.833334922790527[39m,
[Minecraft Interface]   inventoryItems: [33m3[39m
[Minecraft Interface] }
[Cognition] 2026-02-14T23:03:42.840Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Planning] Running autonomous task executor...
[Minecraft Interface] [ThreatPerception] localized threat assessment: 1 threats, level: medium
[Planning] [AUTONOMOUS EXECUTOR] Found 0 active tasks
[Cognition] 2026-02-14T23:03:47.841Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Cognition] 2026-02-14T23:03:52.843Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 15:03:56] "GET /health HTTP/1.1" 200 -
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 15:03:56] "GET /health HTTP/1.1" 200 -
[Planning] [AUTONOMOUS EXECUTOR] Found 0 active tasks
[Cognition] 2026-02-14T23:03:57.846Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Planning] [MCP] Bot instance updated successfully
[Minecraft Interface] Bot instance updated in planning server
[Cognition] 2026-02-14T23:04:02.850Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 15:04:05] "GET /health HTTP/1.1" 200 -
[Planning] [AUTONOMOUS EXECUTOR] Found 0 active tasks
[Planning] [AUTONOMOUS EXECUTOR] Idle detected: no_tasks (active=0, eligible=0)
[Planning] Idle: no_tasks
[Cognition] 2026-02-14T23:04:07.854Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Minecraft Interface] [MINECRAFT INTERFACE] Bot state updated: {
[Minecraft Interface]   position: { x: [33m-276.49983589997106[39m, y: [33m65[39m, z: [33m144.30686227785495[39m },
[Minecraft Interface]   health: [33m5.833334922790527[39m,
[Minecraft Interface]   inventoryItems: [33m3[39m
[Minecraft Interface] }
[Cognition] 2026-02-14T23:04:12.858Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[Planning] Running autonomous task executor...
[Minecraft Interface] [ThreatPerception] localized threat assessment: 1 threats, level: medium
[Planning] [AUTONOMOUS EXECUTOR] Found 0 active tasks
[Cognition] 2026-02-14T23:04:17.860Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Minecraft Interface] [MINECRAFT INTERFACE] /inventory endpoint called
[Minecraft Interface] [MINECRAFT INTERFACE] /inventory endpoint called
[Memory] 🔍 Hybrid search for: "*"
[Memory] 📈 Expanded query: "*"
[Memory] 🔍 Hybrid search for: "*"
[Memory] 📈 Expanded query: "*"
[Memory] ✅ Hybrid search completed: 5 results in 31ms
[Memory] ✅ Hybrid search completed: 5 results in 33ms
[Cognition] 2026-02-14T23:04:22.862Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 15:04:23] "GET /health HTTP/1.1" 200 -
[Planning] [AUTONOMOUS EXECUTOR] Found 0 active tasks
[Cognition] 2026-02-14T23:04:27.866Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[Planning] [MCP] Bot instance updated successfully
[Minecraft Interface] Bot instance updated in planning server
[Cognition] 2026-02-14T23:04:32.871Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 15:04:35] "GET /health HTTP/1.1" 200 -
[Planning] [AUTONOMOUS EXECUTOR] Found 0 active tasks
[Cognition] 2026-02-14T23:04:37.874Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Minecraft Interface] [MINECRAFT INTERFACE] Bot state updated: {
[Minecraft Interface]   position: { x: [33m-276.49983589997106[39m, y: [33m65[39m, z: [33m144.30686227785495[39m },
[Minecraft Interface]   health: [33m5.833334922790527[39m,
[Minecraft Interface]   inventoryItems: [33m3[39m
[Minecraft Interface] }
[Cognition] 2026-02-14T23:04:43.876Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Planning] Running autonomous task executor...
[Minecraft Interface] [ThreatPerception] localized threat assessment: 1 threats, level: medium
[Planning] [AUTONOMOUS EXECUTOR] Found 0 active tasks
[Cognition] 2026-02-14T23:04:48.881Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[Cognition] 2026-02-14T23:04:53.885Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=1 operationType=api_request success=true
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 15:04:56] "GET /health HTTP/1.1" 200 -
[Planning] [AUTONOMOUS EXECUTOR] Found 0 active tasks
[Cognition] 2026-02-14T23:04:58.889Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[Planning] [MCP] Bot instance updated successfully
[Minecraft Interface] Bot instance updated in planning server
[Cognition] 2026-02-14T23:05:03.891Z INFO cognition-server event=middleware_request tags=middleware,request Request completed method=POST path=/process statusCode=200 durationMs=0 operationType=api_request success=true
[MLX-LM Sidecar] 127.0.0.1 - - [14/Feb/2026 15:05:05] "GET /health HTTP/1.1" 200 -
[Memory] [SSE] Client disconnected from memory-updates (1 remaining)
[Planning] [SSE] Client disconnected from task-updates (1 remaining)
[Memory] [SSE] Client disconnected from memory-updates (0 remaining)
[Planning] [SSE] Client disconnected from task-updates (0 remaining)
[32m[2026-02-14T23:05:05.637Z] [Dashboard] [INFO] Exited normally[0m
[33m[2026-02-14T23:05:05.656Z] [Minecraft Interface] [ERROR] Exited with code null[0m
[Core API] /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/core:
[Core API] [41m[30m ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL [39m[49m [31m@conscious-bot/core@0.1.0 dev:server: `tsx src/server.ts`[39m
[Core API] [31mExit status 143[39m
[Memory] /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory:
[Memory] [41m[30m ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL [39m[49m [31m@conscious-bot/memory@0.1.0 dev:server: `tsx src/server.ts`[39m
[Memory] [31mExit status 143[39m
[World] /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/world:
[World] [41m[30m ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL [39m[49m [31m@conscious-bot/world@0.1.0 dev:server: `tsx src/server.ts`[39m
[World] [31mExit status 143[39m
[Planning] /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning:
[Planning] [41m[30m ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL [39m[49m [31m@conscious-bot/planning@0.1.0 dev:server: `tsx src/modular-server.ts`[39m
[Planning] [31mExit status 143[39m
[Cognition] /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition:
[Cognition] [41m[30m ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL [39m[49m [31m@conscious-bot/cognition@0.1.0 dev:server: `tsx src/server.ts`[39m
[Cognition] [31mExit status 143[39m
[36m[2026-02-14T23:05:05.916Z] [Core API] [ERROR] Exited with code 143[0m
[0m[2026-02-14T23:05:06.007Z] [World] [ERROR] Exited with code 143[0m
[34m[2026-02-14T23:05:06.047Z] [Memory] [ERROR] Exited with code 143[0m
[31m[2026-02-14T23:05:06.047Z] [Planning] [ERROR] Exited with code 143[0m
[35m[2026-02-14T23:05:06.122Z] [Cognition] [ERROR] Exited with code 143[0m
[36m[2026-02-14T23:05:06.171Z] [Sterling] [ERROR] Exited with code null[0m
[35m[2026-02-14T23:05:06.175Z] [MLX-LM Sidecar] [ERROR] Exited with code null[0m
[MLX-LM Sidecar]   warnings.warn(
[33m[2026-02-14T23:05:07.207Z] [SHUTDOWN] 
Shutting down Conscious Bot System...[0m
[36m[2026-02-14T23:05:07.207Z] [Core API] [SHUTDOWN] Stopping service...[0m
[34m[2026-02-14T23:05:07.208Z] [Memory] [SHUTDOWN] Stopping service...[0m
[0m[2026-02-14T23:05:07.208Z] [World] [SHUTDOWN] Stopping service...[0m
[35m[2026-02-14T23:05:07.208Z] [MLX-LM Sidecar] [SHUTDOWN] Stopping service...[0m
[36m[2026-02-14T23:05:07.208Z] [Sterling] [SHUTDOWN] Stopping service...[0m
[35m[2026-02-14T23:05:07.208Z] [UMAP Service] [SHUTDOWN] Stopping service...[0m
[35m[2026-02-14T23:05:07.208Z] [Cognition] [SHUTDOWN] Stopping service...[0m
[31m[2026-02-14T23:05:07.208Z] [Planning] [SHUTDOWN] Stopping service...[0m
[33m[2026-02-14T23:05:07.208Z] [Minecraft Interface] [SHUTDOWN] Stopping service...[0m
[32m[2026-02-14T23:05:07.208Z] [Dashboard] [SHUTDOWN] Stopping service...[0m
[35m[2026-02-14T23:05:07.213Z] [UMAP Service] [ERROR] Exited with code null[0m
[36m[2026-02-14T23:05:09.208Z] [Core API] [SHUTDOWN] Force killing service...[0m
[34m[2026-02-14T23:05:09.208Z] [Memory] [SHUTDOWN] Force killing service...[0m
[0m[2026-02-14T23:05:09.208Z] [World] [SHUTDOWN] Force killing service...[0m
[35m[2026-02-14T23:05:09.208Z] [MLX-LM Sidecar] [SHUTDOWN] Force killing service...[0m
[36m[2026-02-14T23:05:09.208Z] [Sterling] [SHUTDOWN] Force killing service...[0m
[35m[2026-02-14T23:05:09.208Z] [Cognition] [SHUTDOWN] Force killing service...[0m
[31m[2026-02-14T23:05:09.208Z] [Planning] [SHUTDOWN] Force killing service...[0m
[33m[2026-02-14T23:05:09.209Z] [Minecraft Interface] [SHUTDOWN] Force killing service...[0m
[32m[2026-02-14T23:05:09.209Z] [Dashboard] [SHUTDOWN] Force killing service...[0m
[32m[2026-02-14T23:05:10.247Z] [SUCCESS] All services stopped[0m
[34m[2026-02-14T23:05:10.247Z] [INFO] 👋 Goodbye![0m
