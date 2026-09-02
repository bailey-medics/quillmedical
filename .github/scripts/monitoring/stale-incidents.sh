#!/usr/bin/env bash
# Reports Cloud Monitoring incidents that have been open too long.
#
# An alerting policy notifies once, when an incident opens, and then stays
# silent for as long as it remains open. Monitoring will not open a second
# incident while the first is still going. So a condition that never clears
# leaves an incident open forever, and that policy can no longer tell you
# anything at all.
#
# Nothing in Cloud Monitoring watches for it, so this does. projects.alerts is
# the only public API that exposes incidents.
#
# Prints any stale incidents on standard output, and writes them to
# GITHUB_OUTPUT as `stale` when running inside GitHub Actions.
#
# A stale incident is a finding, not a broken job, so it does not fail the
# step. The workflow keys its Slack notification off the `stale` output
# instead. Only being unable to read the incidents is a failure.
#
# Usage: stale-incidents.sh
#
# Environment:
#   GCP_PROJECT     Project to inspect (required).
#   STALE_HOURS     Age beyond which an open incident is reported. Default 24.
#   GITHUB_OUTPUT   Destination for `stale`, when set by the runner.
#   INCIDENTS_JSON  Path to a fixture, used by the tests instead of the API.
#
# Exit codes:
#   0  ran successfully, whether or not anything was stale
#   1  could not read the incidents
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "stale-incidents"

# Delimiter for the heredoc form of GITHUB_OUTPUT, the only way to pass a
# value containing newlines between steps. A report containing this line on
# its own would let it inject arbitrary step outputs, so main refuses that.
readonly OUTPUT_DELIMITER="STALE_INCIDENTS_EOF"

# Reads every incident for the project. Paginates, because a busy project can
# return more than one page and a truncated list would silently under-report —
# the failure mode this script exists to prevent.
fetch_incidents() {
  local project="$1"
  local token
  local url
  local page
  local all='{"alerts":[]}'
  token="$(gcloud auth print-access-token)"
  url="https://monitoring.googleapis.com/v3/projects/${project}/alerts"

  local next=""

  while :; do
    page="$(curl -sf -H "Authorization: Bearer ${token}" \
      "${url}${next:+?pageToken=$next}")" || return 1
    all="$(jq -s '{alerts: (.[0].alerts + (.[1].alerts // []))}' \
      <(echo "$all") <(echo "$page"))"
    next="$(echo "$page" | jq -r '.nextPageToken // empty')"
    [ -n "$next" ] || break
  done

  echo "$all"
}

# Pulls five fields out of each incident, one incident per line, tab separated:
#
#   state <tab> openTime <tab> policy <tab> host <tab> service
#
# Missing fields arrive as empty strings, because @tsv renders null that way.
extract_incidents() {
  jq -r '
    .alerts[]
    | [ .state
      , .openTime
      , .policy.displayName
      , .resource.labels.host
      , .resource.labels.service_name
      ]
    | @tsv
  '
}

# Converts an ISO-8601 timestamp to seconds since the epoch.
#
# GNU date (the CI runners) and BSD date (macOS) disagree on the flags for
# this, so try the GNU form and fall back to the BSD one.
to_epoch() {
  local timestamp="$1"

  date -u -d "$timestamp" +%s 2>/dev/null ||
    date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$timestamp" +%s
}

# Whole hours between a timestamp and now.
hours_since() {
  local timestamp="$1"
  local opened
  local now

  opened="$(to_epoch "$timestamp")"
  now="$(date -u +%s)"

  echo $(((now - opened) / 3600))
}

# Renders one incident as a line for the Slack message, eg:
#
#   - Uptime failure (teaching) — open 124d 20h (quill-medical.com)
format_incident() {
  local hours="$1"
  local policy="$2"
  local location="$3"
  local age

  # Days plus remaining hours, because "124d 20h" is readable where "2996h"
  # is not.
  if [ "$hours" -ge 24 ]; then
    age="$((hours / 24))d $((hours % 24))h"
  else
    age="${hours}h"
  fi

  if [ -n "$location" ]; then
    echo "- ${policy} — open ${age} (${location})"
  else
    echo "- ${policy} — open ${age}"
  fi
}

# Prints how many incidents are currently open, whatever their age.
#
# Only used for the "nothing stale" message, so the log can say what it looked
# at rather than only what it failed to find.
count_open() {
  local incidents="$1"
  local state
  local count=0

  while IFS=$'\t' read -r state _; do
    if [ "$state" = "OPEN" ]; then
      count=$((count + 1))
    fi
  done < <(echo "$incidents" | extract_incidents)

  echo "$count"
}

# Prints one line per stale incident, oldest first, or nothing at all.
#
# Takes what it needs as arguments and returns its result on standard output,
# so the caller reads as a plain assignment. An earlier version wrote into
# variables the caller had declared, which works in bash but hides the
# coupling: nothing in the signature said which variables were written, and
# renaming one in the caller would have silently produced an empty report.
stale_report() {
  local incidents="$1"
  local threshold="$2"
  local state
  local open_time
  local policy
  local host
  local service
  local hours
  local name
  local location

  # Sorted by openTime, column two, so the oldest offender is reported first.
  # ISO-8601 sorts correctly as plain text.
  while IFS=$'\t' read -r state open_time policy host service; do
    if [ "$state" != "OPEN" ]; then
      continue
    fi

    hours="$(hours_since "$open_time")"

    if [ "$hours" -le "$threshold" ]; then
      continue
    fi

    # A policy is always named in practice, but an unnamed one should still
    # produce a readable line rather than a blank.
    if [ -n "$policy" ]; then
      name="$policy"
    else
      name="(unknown policy)"
    fi

    # Uptime checks label the host, Cloud Run labels the service, and neither
    # is guaranteed.
    if [ -n "$host" ]; then
      location="$host"
    else
      location="$service"
    fi

    format_incident "$hours" "$name" "$location"
  done < <(echo "$incidents" | extract_incidents | sort -t "$(printf '\t')" -k2)
}

main() {
  local project="${GCP_PROJECT:-}"
  local threshold="${STALE_HOURS:-24}"

  if [ -z "$project" ]; then
    error "GCP_PROJECT is not set"
    return 1
  fi

  local incidents

  if [ -n "${INCIDENTS_JSON:-}" ]; then
    incidents="$(cat "$INCIDENTS_JSON")"
  elif ! incidents="$(fetch_incidents "$project")"; then
    error "Could not read incidents for ${project}"
    return 1
  fi

  local report
  local open_count

  report="$(stale_report "$incidents" "$threshold")"

  if [ -z "$report" ]; then
    open_count="$(count_open "$incidents")"
    log "No incident open longer than ${threshold}h (${open_count} open)."
  else
    echo "$report"
  fi

  publish_step_output "$report"
}

# Hands the report to the workflow as the `stale` step output, so the Slack
# job can fire on it. Does nothing outside Actions, which is what keeps the
# script runnable by hand.
publish_step_output() {
  local report="$1"

  if [ -z "${GITHUB_OUTPUT:-}" ]; then
    return 0
  fi

  if grep -qxF "$OUTPUT_DELIMITER" <<<"$report"; then
    error "Report contains the output delimiter on a line of its own; refusing to write it."
    return 1
  fi

  {
    echo "stale<<${OUTPUT_DELIMITER}"
    if [ -n "$report" ]; then
      echo "$report"
    fi
    echo "$OUTPUT_DELIMITER"
  } >>"$GITHUB_OUTPUT"
}

# Only run when executed, so the tests can source this file.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  main "$@"
fi
