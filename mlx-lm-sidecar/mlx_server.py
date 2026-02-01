#!/usr/bin/env python3
"""
MLX-LM Sidecar Server

Ollama-compatible REST API for text generation and embeddings using MLX
on Apple Silicon. Drop-in replacement so existing TypeScript consumers
(LLMInterface, EmbeddingService) need zero API changes.

Endpoints:
  GET  /health          - Health check
  GET  /api/tags        - List loaded models (Ollama compat)
  POST /api/generate    - Text generation (Ollama compat)
  POST /api/embeddings  - Embedding generation (Ollama compat)
"""

import argparse
import threading
import time

import mlx.core as mx
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
        app.run(host=args.host, port=args.port, debug=False, use_reloader=False)

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
