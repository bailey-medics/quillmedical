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
readonly WEB_COMPOSE_FILE=compose.web.yml
readonly PROXY_CA=/root/.ccr/ca-bundle.crt
readonly STACK_TIMEOUT=300

# Build containers do not trust the session proxy's CA, so image builds cannot
# reach PyPI or the Yarn registry without it. compose.web.yml passes it in as a
# build secret; it is only ever added here, so a local run stays on
# compose.dev.yml alone.
compose_args=(-f "$COMPOSE_FILE")
if [ -f "$PROXY_CA" ]; then
    compose_args+=(-f "$WEB_COMPOSE_FILE")
fi

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

    # A build that cannot verify TLS never reached its registry at all, so say
    # so rather than letting it read as the registry being down.
    if grep -qE 'SELF_SIGNED_CERT_IN_CHAIN|CERTIFICATE_VERIFY_FAILED|self-signed certificate' \
        "$STACK_LOG" 2>/dev/null; then
        cat >&2 <<'UNTRUSTED'
warning: an image build could not verify TLS against its package registry.
         The build container is not trusting the session proxy's CA, which
         compose.web.yml supplies as a build secret. Check that the CA exists
         at /root/.ccr/ca-bundle.crt and that compose.web.yml was applied.
UNTRUSTED
    fi

    # The proxy names the host it refused, which is the one thing needed to fix
    # it, so lift it out of the log rather than making it be searched for.
    local blocked
    blocked=$(grep -oE 'Host not in allowlist: [^ .]*(\.[^ .]+)*' "$STACK_LOG" 2>/dev/null \
        | sed 's/Host not in allowlist: //' | sort -u | tr '\n' ' ')
    if [ -n "$blocked" ]; then
        warn "the egress policy refused these hosts: ${blocked}"
        warn "add them to the environment's allowed domains — see .claude/hooks/README.md"
    fi
}

# Bring up the dev stack. The `clinical` profile services (HAPI FHIR, EHRbase
# and their databases) are deliberately left out: the unit tests reach for
# quill_backend and quill_frontend only, and the clinical images are the
# slowest part of the pull by a wide margin. Start them by hand with
# COMPOSE_PROFILES=clinical when a task actually needs them.
start_dev_stack() {
    if docker compose "${compose_args[@]}" up -d --wait \
        --wait-timeout "$STACK_TIMEOUT" >"$STACK_LOG" 2>&1; then
        echo "dev stack is up: $(docker compose "${compose_args[@]}" ps \
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
