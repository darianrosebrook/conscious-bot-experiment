# UMAP Dimensionality Reduction Service

This service provides UMAP-based dimensionality reduction for visualizing the 768-dimensional embedding space of memories stored in PostgreSQL/pgvector.

## Setup

```bash
cd umap-service
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Running

```bash
source venv/bin/activate
python umap_server.py
```

The service runs on port **5003** by default.

## API Endpoints

### Health Check
```
GET /health
```
Returns service status.

### Reduce Embeddings
```
POST /reduce
Content-Type: application/json

{
  "embeddings": [[...768 floats...], ...],
  "ids": ["id1", "id2", ...],
  "metadata": [{type: "episodic", importance: 0.8, content: "...", createdAt: "..."}, ...]
}
```

Returns:
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

### Clear Cache
```
POST /clear-cache
```
Clears the reduction cache.

## Environment Variables

- `UMAP_SERVICE_HOST`: Host for memory server to connect (default: `localhost`)
- `UMAP_SERVICE_PORT`: Port to run on (default: `5003`)

## Notes

- Requires at least 5 embeddings for UMAP to work
- Results are cached by content hash for performance
- UMAP uses cosine distance metric (ideal for normalized embeddings)
- Random state is fixed for reproducibility
