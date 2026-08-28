#!/bin/bash
set -euo pipefail

# Only run in Claude Code Web — local sessions already have these set up.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
    exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# .env files are git-ignored; materialise the dev defaults from the
# committed samples if they aren't already present (e.g. from a cached
# environment snapshot).
[ -f .env ] || cp .env-sample .env
[ -f backend/.env ] || cp backend/.env-sample backend/.env
[ -f frontend/.env ] || cp frontend/.env-sample frontend/.env

# Make sure the Docker daemon is actually up before Compose needs it.
if ! docker info >/dev/null 2>&1; then
    dockerd >/tmp/dockerd.log 2>&1 &
    for _ in $(seq 1 30); do
        docker info >/dev/null 2>&1 && break
        sleep 1
    done
fi

# Bring up the dev stack. If the environment's setup script already built/
# pulled the images, this is fast; otherwise Compose builds/pulls them now.
docker compose -f compose.dev.yml up -d --wait
