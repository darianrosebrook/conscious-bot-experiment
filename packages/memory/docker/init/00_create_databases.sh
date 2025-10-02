#!/usr/bin/env bash
set -euo pipefail

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${POSTGRES_USER:-conscious_bot}"
PGPASSWORD="${POSTGRES_PASSWORD:-secure_password}"
PGDATABASE="postgres"

export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE

psql <<'SQL'
CREATE DATABASE conscious_bot;
CREATE DATABASE conscious_bot_seed_template;
SQL

psql -d conscious_bot -c "CREATE EXTENSION IF NOT EXISTS vector;"
psql -d conscious_bot_seed_template -c "CREATE EXTENSION IF NOT EXISTS vector;"
