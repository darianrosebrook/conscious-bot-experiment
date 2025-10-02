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

# Run initialization scripts (enables pgvector and creates per-seed DBs)
docker exec -it memory-postgres bash -c "/docker-entrypoint-initdb.d/00_create_databases.sh"
docker exec -it memory-postgres bash -c "WORLD_SEED=1234567890 /docker-entrypoint-initdb.d/01_create_seed_databases.sh"
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

## 🧪 Health Checks

Both services have built-in health checks. Verify status with:

```bash
docker compose ps
docker compose logs postgres
docker compose logs ollama
```
