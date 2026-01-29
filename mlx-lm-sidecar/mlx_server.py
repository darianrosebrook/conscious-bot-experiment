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
import time
import sys

import mlx.core as mx
from flask import Flask, request, jsonify
from flask_cors import CORS

# ---------------------------------------------------------------------------
# Globals – populated at startup
# ---------------------------------------------------------------------------
app = Flask(__name__)
CORS(app)

generation_model = None
generation_tokenizer = None
generation_model_name = ""

embedding_model = None
embedding_tokenizer = None
embedding_model_name = ""


# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------

def load_generation_model(model_id: str):
    """Load the text-generation model using mlx-lm."""
    global generation_model, generation_tokenizer, generation_model_name
    from mlx_lm import load as mlx_lm_load

    print(f"Loading generation model: {model_id} ...")
    generation_model, generation_tokenizer = mlx_lm_load(model_id)
    generation_model_name = model_id.split("/")[-1]
    print(f"Generation model loaded: {generation_model_name}")


def load_embedding_model(model_id: str):
    """Load the embedding model using mlx-embeddings."""
    global embedding_model, embedding_tokenizer, embedding_model_name
    from mlx_embeddings.utils import load as emb_load

    print(f"Loading embedding model: {model_id} ...")
    embedding_model, embedding_tokenizer = emb_load(model_id)
    embedding_model_name = model_id.split("/")[-1]
    print(f"Embedding model loaded: {embedding_model_name}")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "healthy",
        "generation_model": generation_model_name or None,
        "embedding_model": embedding_model_name or None,
    })


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
    return jsonify({"models": models})


@app.route("/api/generate", methods=["POST"])
def api_generate():
    """Ollama-compatible text generation."""
    if generation_model is None:
        return jsonify({"error": "Generation model not loaded"}), 503

    from mlx_lm import generate as mlx_lm_generate

    data = request.get_json(force=True)
    prompt = data.get("prompt", "")
    options = data.get("options", {})
    temperature = options.get("temperature", 0.7)
    max_tokens = options.get("num_predict", 512)

    start = time.time()
    text = mlx_lm_generate(
        generation_model,
        generation_tokenizer,
        prompt=prompt,
        max_tokens=max_tokens,
        temp=temperature,
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
    inputs = embedding_tokenizer(prefixed, return_tensors="np", padding=True, truncation=True)

    # Convert to mlx arrays
    input_ids = mx.array(inputs["input_ids"])
    attention_mask = mx.array(inputs["attention_mask"])
    token_type_ids = mx.array(inputs.get("token_type_ids", [[0] * input_ids.shape[1]]))

    output = embedding_model(input_ids=input_ids, attention_mask=attention_mask, token_type_ids=token_type_ids)

    # Extract text embeddings - shape is (batch, dim)
    embeds = output.text_embeds
    vec = embeds[0].tolist()

    return jsonify({"embedding": vec})


# ---------------------------------------------------------------------------
# CLI entry-point
# ---------------------------------------------------------------------------

def main():
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

    # Load models before serving
    if not args.skip_generation:
        load_generation_model(args.generation_model)
    if not args.skip_embeddings:
        load_embedding_model(args.embedding_model)

    print(f"\nMLX-LM sidecar listening on http://{args.host}:{args.port}")
    app.run(host=args.host, port=args.port, debug=False)


if __name__ == "__main__":
    main()
