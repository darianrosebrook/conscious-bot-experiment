#!/usr/bin/env bash
set -euo pipefail

# During initialization, use socket connection
if [ -S "/var/run/postgresql/.s.PGSQL.5432" ]; then
  export PGHOST="/var/run/postgresql"
  unset PGPORT
else
  # Fallback to TCP for manual runs
  PGHOST="${PGHOST:-localhost}"
  PGPORT="${PGPORT:-5432}"
fi

PGUSER="${POSTGRES_USER:-conscious_bot}"
PGPASSWORD="${POSTGRES_PASSWORD:-secure_password}"
PGDATABASE="postgres"

export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE

echo "Connecting with PGHOST=$PGHOST, PGUSER=$PGUSER"

# Create user if it doesn't exist
if psql -t -c "SELECT 1 FROM pg_roles WHERE rolname = '$PGUSER';" | grep -q 1; then
  echo "User $PGUSER already exists"
else
  echo "Creating user $PGUSER"
  psql -c "CREATE USER $PGUSER WITH PASSWORD '$PGPASSWORD';"
  psql -c "ALTER USER $PGUSER CREATEDB;"
fi

# Check if databases already exist
if psql -t -c "SELECT 1 FROM pg_database WHERE datname = 'conscious_bot';" | grep -q 1; then
  echo "Database conscious_bot already exists"
else
  echo "Creating database conscious_bot"
  psql -c "CREATE DATABASE conscious_bot OWNER $PGUSER;"
fi

if psql -t -c "SELECT 1 FROM pg_database WHERE datname = 'conscious_bot_seed_template';" | grep -q 1; then
  echo "Database conscious_bot_seed_template already exists"
else
  echo "Creating database conscious_bot_seed_template"
  psql -c "CREATE DATABASE conscious_bot_seed_template OWNER $PGUSER;"
fi

echo "Enabling pgvector extension in conscious_bot..."
psql -d conscious_bot -c "CREATE EXTENSION IF NOT EXISTS vector;"

echo "Enabling pgvector extension in conscious_bot_seed_template..."
psql -d conscious_bot_seed_template -c "CREATE EXTENSION IF NOT EXISTS vector;"
