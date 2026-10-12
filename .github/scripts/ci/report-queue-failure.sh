#!/usr/bin/env bash
# Says why a merge queue run failed: the code, or something outside it.
#
# Usage: report-queue-failure.sh <repository> <run-id> <merge-group-ref>
#
# The merge queue removes a pull request when any check fails, and says
# nothing. A check that failed because a registry refused a pull looks the
# same as one that failed on a test. This reads the log of each failed job
# in the run, decides which of the two it was, and writes a Slack message
# naming the pull request and the reason.
#
# It reports. It puts nothing back in the queue. A pull request added to
# the queue with the workflow's own token gets no checks run on it and
# sits there for good, so re-queueing needs an identity this repository
# does not have yet: see the CI that holds under load plan.
#
# How it decides. It looks only at the thirty lines leading up to a job's
# first "##[error]" line, and calls the failure outside the code when
# those lines carry the mark of a service that refused or could not be
# reached. Only those lines, because a test's own output may well mention
# a 504. It is a reading of a log and can be wrong, so the message says
# "looks like", and links the run.
#
# Writes to $GITHUB_OUTPUT:
#   verdict  outside, code or mixed
#   text     the Slack message
#
# Needs GH_TOKEN, with read access to Actions.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "report-queue-failure"

readonly WINDOW_LINES=30

# Prints "<id><TAB><name>" for each failed job of the run. Its own
# function so the tests can stand in for GitHub.
failed_jobs() {
  local repository="$1"
  local run_id="$2"

  gh api "repos/${repository}/actions/runs/${run_id}/jobs?per_page=100" \
    --paginate \
    --jq '.jobs[] | select(.conclusion == "failure") | "\(.id)\t\(.name)"'
}

# Prints one job's log. Its own function for the same reason.
job_log() {
  local repository="$1"
  local job_id="$2"

  gh api "repos/${repository}/actions/jobs/${job_id}/logs"
}

# Prints the lines leading up to the first error in a log, the error line
# included. A log with no error line gives its last lines.
error_window() {
  awk -v keep="$WINDOW_LINES" '
    { lines[NR] = $0 }
    /##\[error\]/ && !found { found = NR }
    END {
      last = found ? found : NR
      first = last - keep
      if (first < 1) first = 1
      for (i = first; i <= last; i++) print lines[i]
    }
  '
}

# Prints what outside service failed, from a job log on stdin. Prints
# nothing when the log shows no sign of one, which is the answer for a
# failed test.
outside_cause() {
  local window=""
  window="$(error_window)"

  if grep -Eq "retry-once\] ERROR: .* failed twice" <<<"$window"; then
    echo "an outside call failed twice in a row"
  elif grep -Eiq "toomanyrequests|429 Too Many Requests|rate limit exceeded" <<<"$window"; then
    echo "a service refused it for too many requests (429)"
  elif grep -Eiq "error: 50[0234]|50[0234] (Internal Server Error|Bad Gateway|Service Unavailable|Gateway Time-?out)|unexpected status code 50[0234]" <<<"$window"; then
    echo "a service answered with a server error (5xx)"
  elif grep -Eiq "no such host|Could not resolve host|Temporary failure in name resolution" <<<"$window"; then
    echo "a service's name could not be looked up"
  elif grep -Eiq "i/o timeout|TLS handshake timeout|Connection timed out|ETIMEDOUT|ECONNRESET|connection reset by peer" <<<"$window"; then
    echo "a connection timed out or was dropped"
  elif grep -Eiq "runner has received a shutdown signal|lost communication with the server" <<<"$window"; then
    echo "the runner was lost"
  fi
}

# Prints the pull request number a merge group's ref was made for, such as
# refs/heads/gh-readonly-queue/main/pr-1830-<sha>. Nothing when it is not
# such a ref.
pull_request_of() {
  local ref="$1"

  if [[ "$ref" =~ gh-readonly-queue/.*/pr-([0-9]+)- ]]; then
    echo "${BASH_REMATCH[1]}"
  fi
}

main() {
  local repository="${1:-}"
  local run_id="${2:-}"
  local ref="${3:-}"

  if [ -z "$repository" ] || [ -z "$run_id" ] || [ -z "$ref" ]; then
    error "Usage: report-queue-failure.sh <repository> <run-id> <merge-group-ref>"
    exit 1
  fi

  if [[ ! "$run_id" =~ ^[0-9]+$ ]]; then
    error "The run id must be a number, and '${run_id}' is not"
    exit 1
  fi

  local pull_request=""
  pull_request="$(pull_request_of "$ref")"

  if [ -z "$pull_request" ]; then
    error "'${ref}' is not a merge group's ref, so there is no pull request to name"
    exit 1
  fi

  local jobs=""
  jobs="$(failed_jobs "$repository" "$run_id")"

  if [ -z "$jobs" ]; then
    error "Run ${run_id} has no failed job, so there is nothing to report"
    exit 1
  fi

  local outside=0
  local code=0
  local lines=""
  local job_id=""
  local name=""
  local cause=""

  while IFS=$'\t' read -r job_id name; do
    # A log that cannot be fetched is not evidence of anything outside
    # the code, so that job counts as a code failure.
    cause="$(job_log "$repository" "$job_id" 2>/dev/null | outside_cause || true)"

    if [ -n "$cause" ]; then
      outside=$((outside + 1))
      lines+="• ${name}: looks like ${cause}"$'\n'
    else
      code=$((code + 1))
      lines+="• ${name}: no sign of an outside fault, so read it as a real failure"$'\n'
    fi
  done <<<"$jobs"

  local verdict="mixed"
  local headline="*❌ Merge queue: #${pull_request} was removed, and not only by an outside fault*"
  local advice="Read the failed jobs before queueing it again."

  if [ "$code" -eq 0 ]; then
    verdict="outside"
    headline="*⚠️ Merge queue: #${pull_request} was removed by a fault outside the code*"
    advice="Nothing is wrong with the pull request. Add it to the queue again, and any stacked on it."
  elif [ "$outside" -eq 0 ]; then
    verdict="code"
    headline="*❌ Merge queue: #${pull_request} was removed by a failed check*"
  fi

  local url="https://github.com/${repository}"

  log "Verdict for #${pull_request}: ${verdict}"

  {
    echo "verdict=${verdict}"
    echo "text<<END_OF_QUEUE_REPORT"
    echo "$headline"
    echo
    printf '%s' "$lines"
    echo
    echo "$advice"
    echo
    echo "*Pull request:* <${url}/pull/${pull_request}|#${pull_request}>"
    echo "*Run:* <${url}/actions/runs/${run_id}|View Run>"
    echo "END_OF_QUEUE_REPORT"
  } >> "$GITHUB_OUTPUT"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
