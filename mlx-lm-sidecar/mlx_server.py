#!/usr/bin/env python3
"""
MLX-LM Sidecar Server

Ollama-compatible REST API for text generation and embeddings using MLX
on Apple Silicon. Drop-in replacement so existing TypeScript consumers
(LLMInterface, EmbeddingService) need zero API changes.

Also includes UMAP dimensionality reduction for embedding visualization
(consolidated from the standalone umap-service).

Endpoints:
  GET  /health          - Health check
  GET  /api/tags        - List loaded models (Ollama compat)
  POST /api/generate    - Text generation (Ollama compat)
  POST /api/embeddings  - Embedding generation (Ollama compat)
  POST /reduce          - UMAP 768D → 3D reduction for visualization
  POST /clear-cache     - Clear UMAP reduction cache
"""

import argparse
import hashlib
import os
import threading
import time

# Limit threading in numba/BLAS to avoid Metal command buffer races
# when UMAP runs alongside MLX embedding generation
os.environ['NUMBA_NUM_THREADS'] = '1'
os.environ['OMP_NUM_THREADS'] = '1'
os.environ['OPENBLAS_NUM_THREADS'] = '1'
os.environ['MKL_NUM_THREADS'] = '1'

import mlx.core as mx
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS

# ---------------------------------------------------------------------------
# Globals – populated at startup
# ---------------------------------------------------------------------------
app = Flask(__name__)
CORS(app)

# Serialize all MLX GPU operations to prevent Metal command buffer races
_gpu_lock = threading.Lock()

# Set in main() from args; used by /health to return 503 until requested models are loaded
LOAD_GENERATION = True
LOAD_EMBEDDING = True

generation_model = None
generation_tokenizer = None
generation_model_name = ""

embedding_model = None
embedding_tokenizer = None
embedding_model_name = ""

# UMAP reduction cache (keyed by content hash of embeddings)
umap_reduction_cache: dict = {}
umap_reducer = None  # Lazy-loaded on first /reduce call


# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------

def _log(msg: str) -> None:
    """Print with flush so output is visible when running under scripts."""
    print(msg, flush=True)


def load_generation_model(model_id: str):
    """Load the text-generation model using mlx-lm."""
    global generation_model, generation_tokenizer, generation_model_name
    from mlx_lm import load as mlx_lm_load

    _log(f"Loading generation model: {model_id} ...")
    generation_model, generation_tokenizer = mlx_lm_load(model_id)
    generation_model_name = model_id.split("/")[-1]
    _log(f"Generation model loaded: {generation_model_name}")


def load_embedding_model(model_id: str):
    """Load the embedding model using mlx-embeddings."""
    global embedding_model, embedding_tokenizer, embedding_model_name
    from mlx_embeddings.utils import load as emb_load

    _log(f"Loading embedding model: {model_id} ...")
    embedding_model, embedding_tokenizer = emb_load(model_id)
    embedding_model_name = model_id.split("/")[-1]
    _log(f"Embedding model loaded: {embedding_model_name}")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/health", methods=["GET"])
def health():
    """Return 503 until requested models are loaded, then 200. Callers can poll until 200."""
    ready = True
    if LOAD_GENERATION and generation_model is None:
        ready = False
    if LOAD_EMBEDDING and embedding_model is None:
        ready = False
    payload = {
        "generation_model": generation_model_name or None,
        "embedding_model": embedding_model_name or None,
        "umap_cache_size": len(umap_reduction_cache),
        "umap_available": True,  # UMAP is always available (lazy-loaded on first use)
    }
    if not ready:
        return jsonify({"status": "loading", **payload}), 503
    return jsonify({"status": "healthy", **payload})


@app.route("/api/tags", methods=["GET"])
def api_tags():
    """Ollama-compatible model listing."""
    models = []
    if generation_model_name:
        models.append({
            "name": "gemma3n:e2b",
            "model": generation_model_name,
            "size": 0,
        })
    if embedding_model_name:
        models.append({
            "name": "embeddinggemma",
            "model": embedding_model_name,
            "size": 0,
        })
        # Backward-compat alias so lookups for the old Ollama model name succeed
        models.append({
            "name": "nomic-embed-text",
            "model": embedding_model_name,
            "size": 0,
        })
    return jsonify({"models": models})


@app.route("/api/generate", methods=["POST"])
def api_generate():
    """Ollama-compatible text generation."""
    if generation_model is None:
        return jsonify({"error": "Generation model not loaded"}), 503

    from mlx_lm import generate as mlx_lm_generate
    from mlx_lm.sample_utils import make_sampler

    data = request.get_json(force=True)
    prompt = data.get("prompt", "")
    options = data.get("options", {})
    temperature = options.get("temperature", 0.7)
    max_tokens = options.get("num_predict", 512)

    sampler = make_sampler(temp=temperature)

    with _gpu_lock:
        start = time.time()
        text = mlx_lm_generate(
            generation_model,
            generation_tokenizer,
            prompt=prompt,
            max_tokens=max_tokens,
            sampler=sampler,
        )
        elapsed = time.time() - start

        # Rough token counts
        prompt_tokens = len(generation_tokenizer.encode(prompt))
        completion_tokens = len(generation_tokenizer.encode(text))

    return jsonify({
        "response": text,
        "done": True,
        "model": "gemma3n:e2b",
        "eval_count": completion_tokens,
        "prompt_eval_count": prompt_tokens,
        "total_duration": int(elapsed * 1e9),
    })


@app.route("/api/embeddings", methods=["POST"])
def api_embeddings():
    """Ollama-compatible embedding generation."""
    if embedding_model is None:
        return jsonify({"error": "Embedding model not loaded"}), 503

    data = request.get_json(force=True)
    prompt = data.get("prompt", "")

    # Prepend retrieval task prefix for better embedding quality
    prefixed = f"task: search result | query: {prompt}"

    # mlx-embeddings wraps the tokenizer; use the inner HF tokenizer for encoding
    hf_tokenizer = getattr(embedding_tokenizer, "_tokenizer", embedding_tokenizer)
    inputs = hf_tokenizer(prefixed, return_tensors="np", padding=True, truncation=True)

    # Convert to mlx arrays
    input_ids = mx.array(inputs["input_ids"])
    attention_mask = mx.array(inputs["attention_mask"])

    with _gpu_lock:
        output = embedding_model(inputs=input_ids, attention_mask=attention_mask)

        # Extract text embeddings - shape is (batch, dim)
        embeds = output.text_embeds
        vec = embeds[0].tolist()

    return jsonify({"embedding": vec})


# ---------------------------------------------------------------------------
# UMAP Dimensionality Reduction Routes
# ---------------------------------------------------------------------------

@app.route("/reduce", methods=["POST"])
def reduce_embeddings():
    """
    Reduce high-dimensional embeddings to 3D for visualization.

    Input: { embeddings: [[...768 floats...], ...], ids: [...], metadata: [...] }
    Output: { points: [{ id, x, y, z, metadata }, ...], hash, count }
    """
    global umap_reduction_cache

    data = request.get_json(force=True)
    if not data or "embeddings" not in data:
        return jsonify({"error": "Missing embeddings field"}), 400

    embeddings = np.array(data["embeddings"], dtype=np.float32)
    ids = data.get("ids", [str(i) for i in range(len(embeddings))])
    metadata = data.get("metadata", [{}] * len(embeddings))

    if len(embeddings) < 5:
        return jsonify({"error": "Need at least 5 embeddings for UMAP", "points": []}), 400

    # Hash for cache key
    content_hash = hashlib.sha256(embeddings.tobytes()).hexdigest()[:16]

    if content_hash in umap_reduction_cache:
        _log(f"[UMAP] Cache hit for hash {content_hash}")
        return jsonify(umap_reduction_cache[content_hash])

    # Acquire GPU lock to prevent Metal command buffer races with
    # concurrent /api/embeddings or /api/generate calls
    with _gpu_lock:
        method_used = "umap"
        try:
            # Lazy import umap to avoid startup delay if not used
            import umap

            # Fit UMAP reducer with appropriate n_neighbors
            n_neighbors = min(15, max(2, len(embeddings) - 1))
            reducer = umap.UMAP(
                n_components=3,
                n_neighbors=n_neighbors,
                min_dist=0.1,
                metric="cosine",
                random_state=42,
                n_jobs=1,  # Single-threaded to avoid crashes on Python 3.13 + Apple Silicon
                low_memory=True,
            )

            _log(f"[UMAP] Reducing {len(embeddings)} embeddings to 3D...")
            coords_3d = reducer.fit_transform(embeddings)
        except Exception as e:
            # Fallback to PCA if UMAP crashes (common on Python 3.13 + Apple Silicon)
            _log(f"[UMAP] UMAP failed ({e}), falling back to PCA")
            method_used = "pca"
            from sklearn.decomposition import PCA
            reducer = PCA(n_components=3, random_state=42)
            coords_3d = reducer.fit_transform(embeddings)

    # Normalize to [-1, 1] range for Three.js
    mins = coords_3d.min(axis=0)
    maxs = coords_3d.max(axis=0)
    ranges = maxs - mins + 1e-8  # Avoid division by zero
    coords_3d = (coords_3d - mins) / ranges
    coords_3d = coords_3d * 2 - 1

    points = [
        {
            "id": ids[i],
            "x": float(coords_3d[i, 0]),
            "y": float(coords_3d[i, 1]),
            "z": float(coords_3d[i, 2]),
            "metadata": metadata[i],
        }
        for i in range(len(coords_3d))
    ]

    result = {"points": points, "hash": content_hash, "count": len(points), "method": method_used}
    umap_reduction_cache[content_hash] = result
    _log(f"[UMAP] Reduction complete ({method_used}): {len(points)} points, cached as {content_hash}")

    return jsonify(result)


@app.route("/clear-cache", methods=["POST"])
def clear_umap_cache():
    """Clear the UMAP reduction cache."""
    global umap_reduction_cache
    count = len(umap_reduction_cache)
    umap_reduction_cache = {}
    _log(f"[UMAP] Cache cleared: {count} entries removed")
    return jsonify({"cleared": count})


# ---------------------------------------------------------------------------
# CLI entry-point
# ---------------------------------------------------------------------------

def main():
    global LOAD_GENERATION, LOAD_EMBEDDING
    parser = argparse.ArgumentParser(description="MLX-LM Sidecar Server")
    parser.add_argument(
        "--generation-model",
        default="mlx-community/gemma-3n-E2B-it-lm-4bit",
        help="HuggingFace model ID for text generation",
    )
    parser.add_argument(
        "--embedding-model",
        default="mlx-community/embeddinggemma-300m-4bit",
        help="HuggingFace model ID for embeddings",
    )
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--port", type=int, default=5002)
    parser.add_argument(
        "--skip-generation",
        action="store_true",
        help="Skip loading the generation model (embeddings only)",
    )
    parser.add_argument(
        "--skip-embeddings",
        action="store_true",
        help="Skip loading the embedding model (generation only)",
    )
    args = parser.parse_args()

    LOAD_GENERATION = not args.skip_generation
    LOAD_EMBEDDING = not args.skip_embeddings

    # Bind immediately so /health is reachable (returns 503 until models load)
    def run_server():
        # threaded=False ensures requests are handled sequentially,
        # preventing Metal command buffer races between concurrent GPU ops
        app.run(host=args.host, port=args.port, debug=False, use_reloader=False, threaded=False)

    server_thread = threading.Thread(target=run_server, daemon=False)
    server_thread.start()
    time.sleep(1)

    if not args.skip_generation:
        load_generation_model(args.generation_model)
    if not args.skip_embeddings:
        load_embedding_model(args.embedding_model)

    _log(f"\nMLX-LM sidecar ready on http://{args.host}:{args.port}")
    server_thread.join()


if __name__ == "__main__":
    main()
