"""
UMAP Dimensionality Reduction Service
Reduces 768D embeddings → 3D for visualization
Port: 5003

Note: UMAP + numba can crash on Python 3.13 / Apple Silicon due to threading issues.
We configure single-threaded mode and provide PCA fallback if UMAP fails.
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import hashlib
import os

# Limit threading to avoid crashes on Python 3.13 + Apple Silicon
os.environ['NUMBA_NUM_THREADS'] = '1'
os.environ['OMP_NUM_THREADS'] = '1'
os.environ['OPENBLAS_NUM_THREADS'] = '1'
os.environ['MKL_NUM_THREADS'] = '1'

import umap
from sklearn.decomposition import PCA

app = Flask(__name__)
CORS(app)

# Cache for reduced embeddings (keyed by content hash)
reduction_cache = {}


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'umap-reducer'})


@app.route('/reduce', methods=['POST'])
def reduce_embeddings():
    """
    Reduce high-dimensional embeddings to 3D.

    Input: { embeddings: [[...768 floats...], ...], ids: [...], metadata: [...] }
    Output: { points: [{ id, x, y, z, metadata }, ...] }
    """
    global reduction_cache

    data = request.json
    if not data or 'embeddings' not in data:
        return jsonify({'error': 'Missing embeddings field'}), 400

    embeddings = np.array(data['embeddings'], dtype=np.float32)
    ids = data.get('ids', [str(i) for i in range(len(embeddings))])
    metadata = data.get('metadata', [{}] * len(embeddings))

    if len(embeddings) < 5:
        return jsonify({'error': 'Need at least 5 embeddings for UMAP', 'points': []}), 400

    # Hash for cache key
    content_hash = hashlib.sha256(embeddings.tobytes()).hexdigest()[:16]

    if content_hash in reduction_cache:
        return jsonify(reduction_cache[content_hash])

    # Try UMAP first, fall back to PCA if it crashes (common on Python 3.13 + Apple Silicon)
    n_neighbors = min(15, max(2, len(embeddings) - 1))
    method_used = 'umap'

    try:
        reducer = umap.UMAP(
            n_components=3,
            n_neighbors=n_neighbors,
            min_dist=0.1,
            metric='cosine',
            random_state=42,
            n_jobs=1,  # Single-threaded to avoid crashes
            low_memory=True  # Reduce memory pressure
        )
        coords_3d = reducer.fit_transform(embeddings)
    except Exception as e:
        # Fallback to PCA if UMAP crashes
        print(f'UMAP failed ({e}), falling back to PCA')
        method_used = 'pca'
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
            'id': ids[i],
            'x': float(coords_3d[i, 0]),
            'y': float(coords_3d[i, 1]),
            'z': float(coords_3d[i, 2]),
            'metadata': metadata[i]
        }
        for i in range(len(coords_3d))
    ]

    result = {'points': points, 'hash': content_hash, 'count': len(points), 'method': method_used}
    reduction_cache[content_hash] = result

    return jsonify(result)


@app.route('/clear-cache', methods=['POST'])
def clear_cache():
    """Clear the reduction cache."""
    global reduction_cache
    count = len(reduction_cache)
    reduction_cache = {}
    return jsonify({'cleared': count})


if __name__ == '__main__':
    print('Starting UMAP reduction service on port 5003...')
    app.run(host='0.0.0.0', port=5003, debug=False)
