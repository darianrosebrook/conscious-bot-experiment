# Memory System Infrastructure Setup

This directory contains Docker configuration for standing up the full infrastructure required by the enhanced memory system.

## 🧱 Components

- **PostgreSQL** (`pgvector/pgvector:pg16`) – vector-enabled database for memory storage and knowledge graph
- **Ollama** (`ollama/ollama:latest`) – embedding service for strategic embedding generation

## 🚀 Quick Start

```bash
cd packages/memory/docker

# Start services
docker compose up -d

# The databases and user will be automatically created during container initialization
# If you need to recreate from scratch:
docker compose down -v  # Remove volumes
docker compose up -d    # Fresh start with auto-initialization
```

## 🔧 Configuration

Environment variables can be specified in a `.env` file placed in this directory. Available variables:

```
POSTGRES_USER=conscious_bot
POSTGRES_PASSWORD=secure_password
POSTGRES_DB=conscious_bot
WORLD_SEED=1234567890
```

Ollama is exposed on `11434`, PostgreSQL on `5432`.

## 📂 Volumes

- `postgres_data` – persistent data for PostgreSQL
- `ollama_data` – cached models for Ollama

## 🗄️ Database Schema

The initialization creates:
- **conscious_bot** – Main database for the memory system
- **conscious_bot_seed_template** – Template for per-seed databases
- **conscious_bot_seed_{WORLD_SEED}** – Seed-specific database (created on first use)

All databases have pgvector extension enabled for vector operations.

## 🧪 Health Checks

Both services have built-in health checks. Verify status with:

```bash
docker compose ps
docker compose logs postgres
docker compose logs ollama
```

## 🔌 Connection Details

From the host application, connect using:
- **Host**: `localhost`
- **Port**: `5432`
- **User**: `conscious_bot`
- **Password**: `secure_password`
- **Database**: `conscious_bot` (or seed-specific database)

## 🛠️ Troubleshooting

If connection fails:
1. Ensure containers are running: `docker compose ps`
2. Check logs: `docker compose logs postgres`
3. Verify pgvector is enabled: connect and run `SELECT * FROM pg_extension WHERE extname = 'vector';`
4. If databases are missing, they may have been created with wrong ownership - check with `docker compose down -v && docker compose up -d`
