#!/usr/bin/env bash
set -euo pipefail

WORLD_SEED=${WORLD_SEED:-1234567890}
BASE_DB=${POSTGRES_DB:-conscious_bot}
SEED_DB="${BASE_DB}_seed_${WORLD_SEED}"
GRAPH_DB="${SEED_DB}_graph"
PROV_DB="${SEED_DB}_provenance"

create_db_if_missing() {
  local db_name="$1"
  if psql -tAc "SELECT 1 FROM pg_database WHERE datname = '${db_name}'" | grep -q 1; then
    echo "Database '${db_name}' already exists. Skipping creation."
  else
    echo "Creating database '${db_name}'..."
    createdb "$db_name"
    psql -d "$db_name" -c "CREATE EXTENSION IF NOT EXISTS vector;"
  fi
}

create_db_if_missing "$SEED_DB"
create_db_if_missing "$GRAPH_DB"
create_db_if_missing "$PROV_DB"
