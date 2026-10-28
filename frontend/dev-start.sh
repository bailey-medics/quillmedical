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

# This container runs as root, and on a Linux host what it writes into the
# mounted worktree stays root's, so the host's next `yarn generate:types`
# stops at EACCES. Run each step that writes there through the hand-back
# script, which gives it back to HOST_UID. Without the script mounted, or
# on a Mac, the step simply runs.
hand_back_script=/usr/local/bin/hand-back-ownership.sh

hand_back() {
  if [ -f "$hand_back_script" ]; then
    sh "$hand_back_script" /app "$@"
  else
    "$@"
  fi
}

# Generate everything up front, so the servers below write nothing.
echo "Generating types and pages once..."
hand_back yarn generate:types
(cd /app/public_pages && hand_back yarn pages:gen) || true

# Start SPA (root) on 5173. Plain vite, as `yarn dev` would generate again.
(
  cd /app
  echo "Starting SPA (root) on 5173..."
  exec yarn vite --host 0.0.0.0 --port 5173
) &
spa_pid=$!

# Start public pages on 5174
(
  cd /app/public_pages
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
