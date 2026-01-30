#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/venv-mlx"

echo "Setting up MLX-LM sidecar environment..."

# Check for Apple Silicon
if [[ "$(uname -s)" != "Darwin" ]] || [[ "$(uname -m)" != "arm64" ]]; then
  echo "WARNING: MLX requires Apple Silicon (arm64). Skipping setup."
  exit 0
fi

# Create venv if it doesn't exist
if [ ! -d "$VENV_DIR" ]; then
  echo "Creating virtual environment at $VENV_DIR..."
  python3 -m venv "$VENV_DIR"
fi

echo "Installing dependencies..."
"$VENV_DIR/bin/pip" install --upgrade pip
"$VENV_DIR/bin/pip" install -r "$SCRIPT_DIR/requirements.txt"

echo "Verifying model cache..."
"$VENV_DIR/bin/python" -c "
from huggingface_hub import snapshot_download
import os
cache_dir = os.path.expanduser('~/.cache/huggingface/hub')
gen = os.path.join(cache_dir, 'models--mlx-community--gemma-3n-E2B-it-lm-4bit')
emb = os.path.join(cache_dir, 'models--mlx-community--embeddinggemma-300m-4bit')
missing = []
if not os.path.isdir(gen):
    missing.append('mlx-community/gemma-3n-E2B-it-lm-4bit')
if not os.path.isdir(emb):
    missing.append('mlx-community/embeddinggemma-300m-4bit')
if missing:
    print(f'Downloading missing models: {missing}')
    for m in missing:
        snapshot_download(m)
    print('Models downloaded.')
else:
    print('All models cached.')
"

echo "MLX-LM sidecar setup complete."
