#!/usr/bin/env bash
# Validates that a requested Slack channel is known and has a webhook configured.
#
# Usage: CHANNEL=<name> CHANNEL_WEBHOOKS=<json> validate-channel.sh
#
# Environment:
#   CHANNEL           Requested channel name, e.g. "teaching".
#   CHANNEL_WEBHOOKS  JSON object mapping channel name -> webhook secret, e.g.
#                     '{"teaching":"https://hooks.slack.com/..."}'. A missing key
#                     means the channel is unknown; an empty value means the
#                     channel's webhook secret is not configured.
#
# Reports two distinct failures separately so misconfiguration is easy to
# diagnose: (1) unknown channel, (2) known channel with no webhook secret.

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "validate-channel"

# Validate a channel against the webhook dict. Pure (reads no env, never emits
# the secret) so it can be unit-tested. Args: <webhooks-json> <channel>.
validate_channel() {
  local webhooks="$1" channel="$2"

  if [ -z "$channel" ]; then
    error "No channel provided"
    return 1
  fi

  if ! jq -e --arg c "$channel" 'has($c)' <<<"$webhooks" >/dev/null 2>&1; then
    error "Unknown Slack channel '$channel'"
    return 1
  fi

  if [ -z "$(jq -r --arg c "$channel" '.[$c]' <<<"$webhooks")" ]; then
    error "No webhook secret configured for Slack channel '$channel'"
    return 1
  fi
}

main() {
  set -euo pipefail
  validate_channel "${CHANNEL_WEBHOOKS:-}" "${CHANNEL:-}"
  log "Slack channel '${CHANNEL:-}' is valid"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
