#!/bin/sh
set -e

MAX_RETRIES=5
RETRY_DELAY=3
for i in $(seq 1 $MAX_RETRIES); do
  echo "Running database migrations (attempt $i/$MAX_RETRIES)..."
  if alembic upgrade head; then
    echo "Migrations complete."
    break
  fi
  if [ "$i" -eq "$MAX_RETRIES" ]; then
    echo "Migrations failed after $MAX_RETRIES attempts. Exiting."
    exit 1
  fi
  echo "Migration failed. Retrying in ${RETRY_DELAY}s..."
  sleep $RETRY_DELAY
done

echo "Starting server..."
exec "$@"
