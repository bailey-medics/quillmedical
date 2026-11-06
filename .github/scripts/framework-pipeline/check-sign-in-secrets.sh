#!/usr/bin/env bash
# Refuse to start the framework sync when the caller passed no way to sign in.
#
# Usage: check-sign-in-secrets.sh <workload-identity-provider> <service-account>
#
# The framework pipeline's secrets are optional, so a repository that never
# starts the sync, such as the testing repository with start_sync: false,
# passes none. A repository that does start it needs both. Without this
# check a missing secret fails later, inside the Google sign-in step, with
# a message that does not say which secret is missing or how to fix it.
# Prints only the names of the missing secrets, never a value.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "check-sign-in-secrets"

# The names of the secrets that are empty, one per line.
missing_secrets() {
  local provider="$1"
  local account="$2"

  if [ -z "$provider" ]; then
    echo "GCP_WORKLOAD_IDENTITY_PROVIDER"
  fi

  if [ -z "$account" ]; then
    echo "GCP_SERVICE_ACCOUNT"
  fi
}

main() {
  local provider="${1:-}"
  local account="${2:-}"
  local missing

  missing="$(missing_secrets "$provider" "$account")"

  if [ -n "$missing" ]; then
    error "The sync cannot start: the caller passed no $(echo "$missing" | paste -sd ' ' - | sed 's/ / or /')."
    error "Set the secret in this repository and pass it in its framework.yml, or set start_sync: false if this repository never starts the sync."
    exit 1
  fi

  log "Both sign-in secrets were passed."
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
