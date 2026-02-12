#!/usr/bin/env bash
set -euo pipefail

# Load environment from .env file if present
if [ -f .env.local ]; then
  export $(grep -v '^#' .env.local | xargs)
elif [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

: "${PG_HOST:=localhost}"
: "${PG_PORT:=5432}"
: "${PG_USER:=conscious_bot}"
: "${PG_PASSWORD:=secure_password}"
: "${PG_DATABASE:=conscious_bot}"
: "${WORLD_SEED:=1234567890}"

export PGHOST="$PG_HOST"
export PGPORT="$PG_PORT"
export PGUSER="$PG_USER"
export PGPASSWORD="$PG_PASSWORD"

BASE_DB="$PG_DATABASE"
TEMPLATE_DB="${BASE_DB}_seed_template"
SEED_DB="${BASE_DB}_seed_${WORLD_SEED}"
GRAPH_DB="${SEED_DB}_graph"
PROV_DB="${SEED_DB}_provenance"

# Create the base database if missing
if psql -tAc "SELECT 1 FROM pg_database WHERE datname = '${BASE_DB}'" | grep -q 1; then
  echo "Database '${BASE_DB}' already exists. Skipping creation."
else
  echo "Creating database '${BASE_DB}'..."
  createdb "$BASE_DB"
  psql -d "$BASE_DB" -c "CREATE EXTENSION IF NOT EXISTS vector;"
fi

# Create the seed template database (with pgvector pre-installed).
# New per-seed databases created at runtime inherit pgvector from this
# template, so the app user doesn't need superuser privileges.
if psql -tAc "SELECT 1 FROM pg_database WHERE datname = '${TEMPLATE_DB}'" | grep -q 1; then
  echo "Template database '${TEMPLATE_DB}' already exists. Skipping creation."
else
  echo "Creating template database '${TEMPLATE_DB}' (with pgvector)..."
  createdb "$TEMPLATE_DB"
  psql -d "$TEMPLATE_DB" -c "CREATE EXTENSION IF NOT EXISTS vector;"
fi

create_seed_db_if_missing() {
  local db_name="$1"
  if psql -tAc "SELECT 1 FROM pg_database WHERE datname = '${db_name}'" | grep -q 1; then
    echo "Database '${db_name}' already exists. Skipping creation."
  else
    echo "Creating database '${db_name}' (from template)..."
    createdb -T "$TEMPLATE_DB" "$db_name"
  fi
}

create_seed_db_if_missing "$SEED_DB"
create_seed_db_if_missing "$GRAPH_DB"
create_seed_db_if_missing "$PROV_DB"

echo "All databases created/verified successfully."
