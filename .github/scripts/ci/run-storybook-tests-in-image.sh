#!/usr/bin/env bash
# Runs the Storybook interaction tests in a Playwright image, against a
# Storybook started on the runner.
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
# network. Exits with the test runner's status. Storybook is stopped on the
# way out, pass or fail, and its log is printed if it never came up.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "run-storybook-tests-in-image"

STORYBOOK_URL="http-get://127.0.0.1:6006/index.json"
STORYBOOK_WAIT_MS=120000

# Set by start_storybook and read by the exit trap, so not local.
STORYBOOK_PID=""

# In a session of its own, so the whole process group can be stopped: yarn
# starts node as a child, and stopping yarn alone leaves the server running.
start_storybook() {
  local log_file="$1"

  setsid yarn storybook --no-open --quiet --ci >"$log_file" 2>&1 &
  STORYBOOK_PID=$!
}

stop_storybook() {
  if [ -n "$STORYBOOK_PID" ]; then
    kill -- "-${STORYBOOK_PID}" 2>/dev/null || true
  fi
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
    npx test-storybook --testTimeout 60000 "${shard_args[@]}"
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

  trap stop_storybook EXIT
  log "Starting Storybook on the runner"
  start_storybook "$log_file"

  if ! npx wait-on "$STORYBOOK_URL" -t "$STORYBOOK_WAIT_MS"; then
    error "Storybook did not come up. Its log follows."
    cat "$log_file" >&2
    exit 1
  fi

  log "Running the tests in ${image}${shard:+, shard ${shard}}"
  run_tests "$image" "$shard"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
