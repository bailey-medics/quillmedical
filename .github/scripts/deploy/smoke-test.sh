#!/usr/bin/env bash
# Polls a deployed service's health endpoint until it returns HTTP 200,
# failing the step if it never becomes healthy.
#
# Usage: smoke-test.sh <url> [retries] [interval-seconds]
#
# Exits 0 as soon as the endpoint returns 200; exits 1 once all attempts fail.
# Retries default to 5, interval to 10s.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "smoke-test"

# Fetch the HTTP status code for a URL. Isolated so tests can stub it.
# `|| true` prevents a hard curl failure (e.g. DNS) from aborting the retry loop.
http_status() {
  local url="$1"

  curl -s -o /dev/null -w "%{http_code}" "$url" || true
}

main() {
  local url="${1:-}"
  local retries="${2:-5}"
  local interval="${3:-10}"

  if [ -z "$url" ]; then
    error "Usage: smoke-test.sh <url> [retries] [interval-seconds]"
    exit 1
  fi

  local attempt status

  for ((attempt = 1; attempt <= retries; attempt++)); do
    status="$(http_status "$url")"

    if [ "$status" = "200" ]; then
      log "Health check passed: $url"
      exit 0
    fi

    log "Attempt $attempt/$retries: got $status"

    if [ "$attempt" -lt "$retries" ]; then
      sleep "$interval"
    fi
  done

  error "Health check failed after $retries attempts: $url"
  exit 1
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
