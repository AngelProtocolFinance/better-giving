#!/usr/bin/env bash
# sets up the local dev database: role, database, and extensions
# usage: ./scripts/setup-local-pg.sh <stage>
#   e.g. ./scripts/setup-local-pg.sh justin

STAGE=${1:?usage: setup-local-pg.sh <stage>}

psql postgresql://localhost -c "CREATE ROLE $STAGE WITH LOGIN" 2>/dev/null || true
psql postgresql://localhost -c "CREATE DATABASE $STAGE OWNER $STAGE" 2>/dev/null || true
psql postgresql://$STAGE@localhost/$STAGE -c "CREATE EXTENSION IF NOT EXISTS pg_trgm"
