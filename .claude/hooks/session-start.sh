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

# Install pre-commit so commits made in this session run the same checks as CI.
# Without it a web session commits unchecked and the first failure only shows
# up in the CI run. Warnings here are deliberately non-fatal: a session that
# cannot lint is still worth having.
if ! command -v pre-commit >/dev/null 2>&1; then
    python3 -m pip install --quiet --disable-pip-version-check pre-commit \
        || echo "warning: could not install pre-commit; commits will not be checked locally" >&2
fi

if command -v pre-commit >/dev/null 2>&1; then
    pre-commit install >/dev/null \
        || echo "warning: could not install the git pre-commit hook" >&2

    # Build the hook environments now rather than making the session's first
    # commit wait several minutes for them. The container is snapshotted after
    # this hook completes, so later sessions reuse what is built here.
    pre-commit install-hooks >/dev/null 2>&1 \
        || echo "warning: could not pre-build the pre-commit environments" >&2
fi

# Install bats so the shell suites under .github/scripts/ can be run here the
# same way CI runs them (bash .github/scripts/ci/run-shell-tests.sh).
if ! command -v bats >/dev/null 2>&1; then
    npm install -g bats --silent \
        || echo "warning: could not install bats; shell tests will not run locally" >&2
fi

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
