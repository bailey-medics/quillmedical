#!/usr/bin/env bash
# Fails unless a deployed URL's response carries the security headers.
#
# Usage: check-security-headers.sh <url>
#
# Checks for X-Content-Type-Options, X-Frame-Options, Content-Security-Policy
# and Strict-Transport-Security, by name only: the values differ between the
# application's pages and the API, and are reviewed where they are set.
#
# The headers are added at the edge - by Caddy for the application's pages and
# by the load balancer for the API - so the deployed site is the only place
# they can be checked. Neither the dev stack nor the E2E stack has a load
# balancer.
#
# Exits 0 when every header is present; exits 1 and names each missing one
# otherwise. A request that fails outright returns no headers, so it fails
# the same way.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "check-security-headers"

REQUIRED_HEADERS=(
  "X-Content-Type-Options"
  "X-Frame-Options"
  "Content-Security-Policy"
  "Strict-Transport-Security"
)

# Fetch the response headers for a URL. Isolated so tests can stub it.
# `|| true` lets a hard curl failure (e.g. DNS) reach the missing-header
# report below rather than aborting with curl's own message.
response_headers() {
  local url="$1"

  curl -s -o /dev/null -D - "$url" || true
}

# Whether a block of response headers includes one by name. Header names are
# case-insensitive, and HTTP/2 sends them in lower case.
has_header() {
  local headers="$1"
  local name="$2"

  grep -qi "^${name}:" <<<"$headers"
}

main() {
  local url="${1:-}"

  if [ -z "$url" ]; then
    error "Usage: check-security-headers.sh <url>"
    exit 1
  fi

  local headers
  local name
  local missing=0

  headers="$(response_headers "$url")"

  for name in "${REQUIRED_HEADERS[@]}"; do
    if ! has_header "$headers" "$name"; then
      error "Missing ${name}: $url"
      missing=1
    fi
  done

  if [ "$missing" -ne 0 ]; then
    exit 1
  fi

  log "Security headers present: $url"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
