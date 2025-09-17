#!/bin/sh
# POSIX sh launcher for two dev servers (no sleep, no wait -n)
set -eu

cd /app

spa_pid=0
pages_pid=0

term_handler() {
  echo "dev-start.sh: stopping children..."
  [ "$spa_pid" -ne 0 ] && kill -TERM "$spa_pid" 2>/dev/null || true
  [ "$pages_pid" -ne 0 ] && kill -TERM "$pages_pid" 2>/dev/null || true
  # wait for any leftover children
  [ "$spa_pid" -ne 0 ] && wait "$spa_pid" 2>/dev/null || true
  [ "$pages_pid" -ne 0 ] && wait "$pages_pid" 2>/dev/null || true
  exit 0
}
trap 'term_handler' TERM INT

# Start SPA (root) on 5173
(
  cd /app
  echo "Starting SPA (root) on 5173..."
  exec yarn dev --host 0.0.0.0 --port 5173
) &
spa_pid=$!

# Start public pages on 5174
(
  cd /app/public_pages
  echo "Generating pages once..."
  yarn pages:gen || true
  echo "Starting public pages dev server on 5174..."
  exec yarn vite --host 0.0.0.0 --port 5174
) &
pages_pid=$!

# Two watchers: each waits for one child and kills the other if it exits first.
(
  wait "$spa_pid"
  echo "dev-start.sh: SPA ($spa_pid) exited; shutting pages..."
  kill -TERM "$pages_pid" 2>/dev/null || true
) &

(
  wait "$pages_pid"
  echo "dev-start.sh: Pages ($pages_pid) exited; shutting SPA..."
  kill -TERM "$spa_pid" 2>/dev/null || true
) &

# Wait for the watcher processes (they will exit after forwarding shutdown).
# This `wait` waits for all background jobs started in this script.
wait
# When wait returns, both watchers are done and children have been shut down.