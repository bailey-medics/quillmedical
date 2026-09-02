#!/bin/bash
set -euo pipefail

# Session setup for Claude Code on the web.
#
# The work here splits into two kinds. Provisioning — installing toolchains and
# pulling images — belongs in the cloud environment's setup script, because its
# filesystem is snapshotted and reused by later sessions. Starting things is
# what this hook is for: a snapshot keeps files but not running processes, so
# the Docker daemon and the dev stack have to be brought up again every session.
#
# Nothing below is allowed to abort the session. A session that cannot lint, or
# cannot run containers, is still worth having, so every step that can fail
# warns and carries on. See .claude/hooks/README.md for the environment
# settings this hook depends on.

# Only run in Claude Code Web — local sessions already have these set up.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
    exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Overridable only so the bats suite can capture the logs somewhere harmless.
readonly LOG_DIR="${SESSION_START_LOG_DIR:-/tmp}"
readonly DOCKER_LOG="$LOG_DIR/dockerd.log"
readonly STACK_LOG="$LOG_DIR/compose-up.log"
readonly COMPOSE_FILE=compose.dev.yml
readonly STACK_TIMEOUT=300

warn() {
    echo "warning: $*" >&2
}

# .env files are git-ignored; materialise the dev defaults from the
# committed samples if they aren't already present (e.g. from a cached
# environment snapshot).
[ -f .env ] || cp .env-sample .env
[ -f backend/.env ] || cp backend/.env-sample backend/.env
[ -f frontend/.env ] || cp frontend/.env-sample frontend/.env

# Install pre-commit so commits made in this session run the same checks as CI.
# Without it a web session commits unchecked and the first failure only shows
# up in the CI run.
if ! command -v pre-commit >/dev/null 2>&1; then
    python3 -m pip install --quiet --disable-pip-version-check pre-commit \
        || warn "could not install pre-commit; commits will not be checked locally"
fi

if command -v pre-commit >/dev/null 2>&1; then
    pre-commit install >/dev/null \
        || warn "could not install the git pre-commit hook"

    # Build the hook environments now rather than making the session's first
    # commit wait several minutes for them. The container is snapshotted after
    # this hook completes, so later sessions reuse what is built here.
    pre-commit install-hooks >/dev/null 2>&1 \
        || warn "could not pre-build the pre-commit environments"
fi

# Install bats so the shell suites under .github/scripts/ and .claude/hooks/
# can be run here the same way CI runs them
# (bash .github/scripts/ci/run-shell-tests.sh).
if ! command -v bats >/dev/null 2>&1; then
    npm install -g bats --silent \
        || warn "could not install bats; shell tests will not run locally"
fi

# Every command in CLAUDE.md is a just recipe, so without just none of the
# documented workflow runs. Install it from PyPI rather than from its GitHub
# release: the session's GitHub proxy only serves release assets for
# repositories attached to the session, so the upstream installer gets a 403.
if ! command -v just >/dev/null 2>&1; then
    python3 -m pip install --quiet --disable-pip-version-check rust-just \
        || warn "could not install just; the documented recipes will not run"
fi

# Start the Docker daemon. There is no init system in the session container, so
# nothing starts dockerd for us and `just dds` only knows how to drive Docker
# Desktop on a Mac.
#
# dockerd inherits HTTPS_PROXY and the session's CA bundle from this script's
# environment, which is how registry traffic reaches the egress proxy. Don't
# unset either: pulls fail outright without them.
start_docker_daemon() {
    if docker info >/dev/null 2>&1; then
        return 0
    fi

    if ! command -v dockerd >/dev/null 2>&1; then
        warn "dockerd is not installed; the dev stack cannot be started"
        return 1
    fi

    dockerd >"$DOCKER_LOG" 2>&1 &

    for _ in $(seq 1 30); do
        if docker info >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
    done

    warn "the Docker daemon did not come up within 30s; see $DOCKER_LOG"
    return 1
}

# Explain a failed bring-up in terms of the thing that actually needs changing,
# rather than leaving several hundred lines of signed CDN URLs in the log as the
# only clue.
diagnose_stack_failure() {
    warn "could not start the dev stack; see $STACK_LOG"

    if grep -qE 'cloudfront\.docker\.com|: Forbidden' "$STACK_LOG" 2>/dev/null; then
        cat >&2 <<'BLOCKED'
warning: image pulls were refused by this session's egress policy.
         Docker Hub serves image blobs from production.cloudfront.docker.com,
         which the default "Trusted" network access level does not allow — its
         list still names the older production.cloudflare.docker.com. Until that
         host is allowed, no image can be pulled and no container can start.
         .claude/hooks/README.md has the environment settings that fix this.
BLOCKED
    fi
}

# Bring up the dev stack. The `clinical` profile services (HAPI FHIR, EHRbase
# and their databases) are deliberately left out: the unit tests reach for
# quill_backend and quill_frontend only, and the clinical images are the
# slowest part of the pull by a wide margin. Start them by hand with
# COMPOSE_PROFILES=clinical when a task actually needs them.
start_dev_stack() {
    if docker compose -f "$COMPOSE_FILE" up -d --wait \
        --wait-timeout "$STACK_TIMEOUT" >"$STACK_LOG" 2>&1; then
        echo "dev stack is up: $(docker compose -f "$COMPOSE_FILE" ps \
            --services --status running | tr '\n' ' ')"
        return 0
    fi

    diagnose_stack_failure
    return 1
}

if start_docker_daemon; then
    start_dev_stack || true
fi

exit 0
