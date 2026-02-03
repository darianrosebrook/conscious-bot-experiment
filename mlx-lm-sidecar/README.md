# MLX-LM Sidecar Server

Ollama-compatible REST API for text generation and embeddings using MLX on Apple Silicon. Drop-in replacement so existing TypeScript consumers (LLMInterface, EmbeddingService) need zero API changes.

Also includes UMAP dimensionality reduction for embedding visualization (consolidated from the standalone umap-service).

## Setup

```bash
cd mlx-lm-sidecar
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Running

```bash
source venv/bin/activate
python mlx_server.py
```

The server runs on port **5002** by default.

### CLI Options

```
--host              Host to bind to (default: localhost)
--port              Port to run on (default: 5002)
--generation-model  HuggingFace model ID for text generation
--embedding-model   HuggingFace model ID for embeddings
--skip-generation   Skip loading the generation model (embeddings only)
--skip-embeddings   Skip loading the embedding model (generation only)
```

## API Endpoints

### Health Check
```
GET /health
```
Returns service status and loaded models. Returns 503 while models are loading, 200 when ready.

### Model Tags (Ollama-compatible)
```
GET /api/tags
```
Lists available models in Ollama-compatible format.

### Text Generation (Ollama-compatible)
```
POST /api/generate
Content-Type: application/json

{
  "prompt": "Your prompt here",
  "options": {
    "temperature": 0.7,
    "num_predict": 512
  }
}
```

### Embedding Generation (Ollama-compatible)
```
POST /api/embeddings
Content-Type: application/json

{
  "prompt": "Text to embed"
}
```

Returns:
```json
{
  "embedding": [0.1, 0.2, ...]
}
```

### UMAP Reduction (for visualization)
```
POST /reduce
Content-Type: application/json

{
  "embeddings": [[...768 floats...], ...],
  "ids": ["id1", "id2", ...],
  "metadata": [{type: "episodic", importance: 0.8, content: "..."}, ...]
}
```

Returns 3D coordinates for Three.js visualization:
```json
{
  "points": [
    { "id": "id1", "x": 0.5, "y": -0.3, "z": 0.1, "metadata": {...} },
    ...
  ],
  "hash": "abc123...",
  "count": 100
}
```

### Clear UMAP Cache
```
POST /clear-cache
```
Clears the UMAP reduction cache.

## Environment Variables

Used by consumers (memory service) to connect:

- `MLX_SIDECAR_HOST`: Host address (default: `localhost`)
- `MLX_SIDECAR_PORT`: Port number (default: `5002`)

Legacy variables still supported for backward compatibility:
- `UMAP_SERVICE_HOST`: Falls back to this if MLX_SIDECAR_HOST not set
- `UMAP_SERVICE_PORT`: Falls back to this if MLX_SIDECAR_PORT not set

## Default Models

- **Generation**: `mlx-community/gemma-3n-E2B-it-lm-4bit`
- **Embedding**: `mlx-community/embeddinggemma-300m-4bit`

## Notes

- Requires Apple Silicon Mac for MLX acceleration
- GPU operations are serialized to prevent Metal command buffer races
- UMAP requires at least 5 embeddings to work
- UMAP results are cached by content hash for performance
- UMAP uses cosine distance metric (ideal for normalized embeddings)
