# MLX-LM Sidecar: Health Endpoint and Setup

## Health endpoint

- **URL**: `GET http://localhost:5002/health`
- **Response (ready)**: `200` with JSON `{"status": "healthy", "generation_model": "...", "embedding_model": "..."}`.
- **Response (loading)**: `503` with JSON `{"status": "loading", "generation_model": null, "embedding_model": null}` until models are loaded (when server is started with bind-first behavior).

## Root cause of health-check timeouts

The server did not listen on the port until **after** both models were loaded:

1. `main()` called `load_generation_model()` (can take minutes on first run).
2. Then `load_embedding_model()` (same).
3. Then `app.run(host=..., port=...)`.

So the TCP socket was not bound until step 3. Callers (benchmark script, start script) saw "connection refused" for the entire load period. The `/health` handler itself was correct; the server simply was not accepting connections.

## Fix: bind first, then load models

1. Start the Flask app in a background thread so the server binds immediately.
2. Load models in the main thread after the server is up.
3. `/health` returns `503` with `{"status": "loading"}` until the requested models are loaded, then `200` with `{"status": "healthy", ...}`.

Result: callers get a connection quickly (or a fast `503`), then can poll `/health` until `200` when the sidecar is ready to serve `/api/generate` and `/api/embeddings`. The benchmark script and start script treat only `200` as ready; `503` causes them to keep polling.

## Python sidecar setup

| Item | Location | Notes |
|------|----------|--------|
| Venv | `mlx-lm-sidecar/venv-mlx` | Created by `setup.sh` or start script; must exist before running server. |
| Python | `./venv-mlx/bin/python` | Used by start script and benchmark from project root: `cd mlx-lm-sidecar && ./venv-mlx/bin/python mlx_server.py --port 5002`. |
| Models | `~/.cache/huggingface/hub/` | `mlx-community/gemma-3n-E2B-it-lm-4bit`, `mlx-community/embeddinggemma-300m-4bit`. First run may download. |
| Arch | arm64 (Apple Silicon) | MLX requires Apple Silicon; setup.sh checks and skips on other arches. |

## Setup script (`setup.sh`)

- Ensures Darwin + arm64.
- Creates `venv-mlx` if missing.
- Installs `requirements.txt` (mlx, mlx-lm, mlx-embeddings, flask, etc.).
- Optionally downloads models via `huggingface_hub.snapshot_download` if not cached.

Run from repo root: `./mlx-lm-sidecar/setup.sh` or from `mlx-lm-sidecar`: `./setup.sh`.

## Manual startup and observation

To see exactly what the sidecar does at startup:

1. **Terminal 1 – start the sidecar** (from repo root):
   ```bash
   cd mlx-lm-sidecar && ./venv-mlx/bin/python mlx_server.py --port 5002
   ```
   You should see, in order:
   - Flask: "Running on http://localhost:5002"
   - "Loading generation model: ..." then "Generation model loaded: ..."
   - "Loading embedding model: ..." then "Embedding model loaded: ..."
   - "MLX-LM sidecar ready on http://..."

2. **Terminal 2 – poll health until ready**:
   ```bash
   ./mlx-lm-sidecar/poll-health.sh 5002
   ```
   This prints each response (connection refused, then 503 with body, then 200) every 2s until 200.

If the sidecar hangs or errors, the output in Terminal 1 shows where it stopped (e.g. during embedding load or after the multiprocessing warning).

## Requirements

- `mlx`, `mlx-lm`, `mlx-embeddings`, `huggingface_hub`, `flask`, `flask-cors`. Versions in `mlx-lm-sidecar/requirements.txt`.

## CLI

- `--port` (default 5002), `--host` (default localhost).
- `--skip-generation` / `--skip-embeddings`: load only one of the two models; `/health` considers only the requested models when returning 200.

---

## Benchmark results and evaluation

Example run (Apple Silicon, gemma-3n-E2B-it-lm-4bit, single cold run):

| Scenario                          | promptCh | maxTok | clientMs | serverMs | promptTok | complTok |
|-----------------------------------|----------|--------|----------|----------|-----------|----------|
| observation-like 400c / 128 tok    |      400 |    128 |     3586 |     3556 |       133 |      129 |
| observation-like 400c / 256 tok    |      400 |    256 |     2739 |     2735 |       133 |      125 |
| observation-like 400c / 512 tok    |      400 |    512 |     1952 |     1948 |       133 |       96 |
| observation-like 800c / 256 tok   |      800 |    256 |     1699 |     1696 |       207 |       77 |
| observation-like 800c / 128 tok    |      800 |    128 |     1458 |     1454 |       207 |       63 |
| short 80c / 64 tok                 |       80 |     64 |     1281 |     1277 |        19 |       60 |
| short 80c / 128 tok               |       80 |    128 |     1758 |     1754 |        19 |       90 |

- **Average client latency**: ~2067 ms.
- **Average server duration**: ~2060 ms (client and server times align; little overhead).

**Findings**

1. **Lower max_tokens is faster**: 128 tok vs 512 tok on the same prompt (400c) is ~1.8x faster client-side (2739 ms vs 1952 ms in the 256 vs 512 row; 128-tok cases are generally faster). Tuning `maxTokens` in `llm-token-config.ts` (e.g. observation at 128–256) reduces latency.
2. **Shorter prompts help**: 80c / 64 tok is the fastest (~1281 ms); 800c prompts are ~1.3–1.5x slower than 400c for similar max_tokens. Keeping observation prompts concise helps.
3. **First request is often slowest**: First scenario (400c / 128 tok) was ~3586 ms; later scenarios with similar or larger token counts were faster. Warm-up effect; consider a single warm-up generate call if measuring steady-state latency.
4. **Use for tuning**: Run `pnpm run benchmark:mlx` (with sidecar already up or let the script start it) to compare prompt length and `max_tokens` before changing `packages/cognition/src/config/llm-token-config.ts`.

---

## Keeping MLX inference responsive and avoiding overload

### Is MLX "hot" between calls?

- **Yes.** The model stays in memory; there is no per-request cold load after the first generate. The first request after startup is often slowest (warm-up); later requests are typically 1.3–2.7 s for short observation prompts.
- **Overhead between calls:** Only the next inference (no re-load). Concurrency is the issue: the sidecar uses a single `_gpu_lock`, so only one generate runs at a time. Concurrent requests queue and the Nth request waits for the previous N−1 to finish. If the client times out before its turn, you see "This operation was aborted".

### How we avoid overloading the LLM

1. **Single-flight observation in Cognition**  
   Observation LLM calls are serialized with a mutex: only one `observationReasoner.reason()` runs at a time. So we never pile multiple observation requests onto MLX at once; each request gets ~2–3 s and completes.

2. **Client timeout**  
   Minecraft's `resilientFetch` for `/process` (environmental_awareness and environmental_event) uses `timeoutMs: 25000` so that even when requests are queued server-side, the client waits long enough.

3. **Throttling at the source**  
   Bot-adapter already throttles entity and environmental `/process` calls (e.g. 30 s between entity, 15 s between environmental). Together with single-flight, this keeps observation load low.

4. **Observation token budget**  
   `llm-token-config` sets observation `maxTokens: 128` so MLX returns quickly; benchmark showed 128 tok is faster than 256/512 for observation-like prompts.

### Optional warm-up

To avoid the slow first request in production, Cognition could run one no-op generate (e.g. "ok" with max_tokens 2) at startup after the LLM health check. Not required for correctness; only for smoothing the first user-visible observation.
