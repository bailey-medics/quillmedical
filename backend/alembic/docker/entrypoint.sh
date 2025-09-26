#!/usr/bin/env sh
set -e
if [ "$RUN_DB_MIGRATIONS" = "1" ]; then
  echo "Running Alembic migrations..."
  alembic upgrade head || echo "WARNING: migrations failed"
fi
exec "$@"
