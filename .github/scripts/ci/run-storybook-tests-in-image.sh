#!/usr/bin/env bash
# Runs the Storybook interaction tests in a Playwright image, against a
# Storybook built and served on the runner.
#
# Usage: run-storybook-tests-in-image.sh <image> [shard]
#
# <image> is Microsoft's Playwright image for the installed Playwright
# version, which carries the browser and its system packages. [shard] is
# "<index>/<count>", passed to the test runner as --shard; left out, every
# story runs.
#
# Run from the repository root. Only the test runner and its browser go into
# the container. Storybook itself stays on the runner, where Yarn 4 and
# node_modules already are, and the container reaches it over the host
# network.
#
# The tests run against a static build, not `storybook dev`. The dev server
# compiles each story the first time a test asks for it, so the tests waited
# on Vite as well as on the browser; a build does that work once, up front.
# A failed build stops the script before anything is served.
#
# Exits with the test runner's status. The server is stopped on the way out,
# pass or fail, and its log is printed if it never came up.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "run-storybook-tests-in-image"

STORYBOOK_PORT=6006
STORYBOOK_URL="http://127.0.0.1:${STORYBOOK_PORT}"
STORYBOOK_WAIT_MS=30000

# How long a server asked to stop is given before it is killed outright.
# Read from the environment only so the tests need not wait five seconds.
STORYBOOK_STOP_GRACE_SECONDS="${STORYBOOK_STOP_GRACE_SECONDS:-5}"

# Where `storybook:build` in frontend/package.json writes, seen from frontend.
STORYBOOK_BUILD_DIR="../docs/docs/code/storybook"

# Set by serve_storybook and read by the exit trap, so not local.
SERVER_PID=""

# In a session of its own, so the exit trap can stop the whole process group
# and nothing is left holding the port.
serve_storybook() {
  local log_file="$1"

  setsid python3 -m http.server "$STORYBOOK_PORT" \
    --bind 127.0.0.1 \
    --directory "$STORYBOOK_BUILD_DIR" >"$log_file" 2>&1 &
  SERVER_PID=$!
}

# Stops the server and does not return until it has gone.
#
# A signal only asks. Without the wait, this returned while the server was
# still on its way out, and a caller that looked straight afterwards
# sometimes found it there: two of this script's own tests did, on CI.
# The wait also collects the dead process, which otherwise still answers
# to its number until something does.
#
# A server that ignores the request is killed outright after the grace
# period, so the wait cannot hang the job.
stop_storybook() {
  if [ -z "$SERVER_PID" ]; then
    return 0
  fi

  kill -- "-${SERVER_PID}" 2>/dev/null || true

  # Its output goes nowhere, so nothing reading ours waits on its sleep.
  (
    sleep "$STORYBOOK_STOP_GRACE_SECONDS"
    kill -KILL -- "-${SERVER_PID}" 2>/dev/null || true
  ) >/dev/null 2>&1 &
  local killer=$!

  wait "$SERVER_PID" 2>/dev/null || true
  kill "$killer" 2>/dev/null || true
  wait "$killer" 2>/dev/null || true
}

run_tests() {
  local image="$1"
  local shard="$2"
  local shard_args=()

  if [ -n "$shard" ]; then
    shard_args=("--shard=${shard}")
  fi

  # --network host so 127.0.0.1 is the Storybook on the runner. The runner's
  # own user, with HOME somewhere that user may write, as heavy_e2e does.
  docker run --rm --network host --ipc host \
    --user "$(id -u):$(id -g)" \
    -e CI -e HOME=/tmp \
    -v "$PWD:/work" -w /work \
    "$image" \
    npx test-storybook --url "$STORYBOOK_URL" --testTimeout 60000 "${shard_args[@]}"
}

main() {
  local image="${1:-}"
  local shard="${2:-}"
  local log_file

  if [ -z "$image" ]; then
    error "No image provided. Usage: run-storybook-tests-in-image.sh <image> [shard]"
    exit 1
  fi

  cd frontend
  log_file="$(mktemp)"

  log "Building Storybook"
  yarn storybook:build

  trap stop_storybook EXIT
  log "Serving the build on ${STORYBOOK_URL}"
  serve_storybook "$log_file"

  if ! npx wait-on "http-get://127.0.0.1:${STORYBOOK_PORT}/index.json" -t "$STORYBOOK_WAIT_MS"; then
    error "The Storybook build was not served. The server's log follows."
    cat "$log_file" >&2
    exit 1
  fi

  log "Running the tests in ${image}${shard:+, shard ${shard}}"
  run_tests "$image" "$shard"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
