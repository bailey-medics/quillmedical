#!/usr/bin/env bash
# Posts the outcome of a Terraform plan as a comment on a pull request.
#
# Usage: GH_TOKEN=<token> post-plan-comment.sh <pr-number>
#
# The comment is one line: what the plan concluded, or "Failed plan" when it
# concluded nothing. A full plan runs to hundreds of lines of state refreshes
# and attribute-level diff, and a comment nobody reads is worth nothing however
# much it contains. The link at the foot points at the plan job itself, so the
# full output is always one click away.
#
# Reads the plan from infra/plan-output.txt (written by the "Terraform plan"
# step) and posts with the `gh` CLI.
#
# Environment:
#   GH_TOKEN            Token used by `gh` to authenticate. Set by the workflow.
#   GITHUB_SERVER_URL   Base URL, e.g. "https://github.com" (set by the runner).
#   GITHUB_REPOSITORY   "owner/repo" (set by the runner).
#   GITHUB_RUN_ID       Current run id, used to link back to the workflow.
#   GITHUB_RUN_ATTEMPT  Current attempt, so a re-run links to its own logs.
#   JOB_NAME            Display name of the job to link to. Set by the
#                       workflow; see resolve_job_url for what happens when it
#                       does not match.

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "post-plan-comment"

PLAN_FILE="infra/plan-output.txt"

# The lines Terraform uses to conclude a plan: changes to resources, no changes
# at all, or changes to outputs only — the last prints no "Plan:" line, and
# omitting it here would see a healthy plan reported as a failed one. Anchored
# to the start of the line, so the same words quoted inside a resource diff
# cannot match.
#
# A plan containing an `import` block prefixes the line with "N to import,"
# which the original pattern did not allow for, so a perfectly good import
# plan was reported as "Failed plan". The prefix is optional because it only
# appears when something is being imported.
SUMMARY_PATTERN='^(Plan: ([0-9]+ to import, )?[0-9]+ to add, [0-9]+ to change, [0-9]+ to destroy\.|No changes\.|Changes to Outputs:)'

# Stands in for the summary when Terraform printed none. Short by design: the
# job log holds the reason, and a wall of error text in the comment trains
# people to skim past every plan comment, including the ones that matter.
NO_SUMMARY_TEXT="Failed plan"

# Extract Terraform's concluding line from the plan text on stdin, or print
# nothing if there is none. Takes the last match: a plan that reports on
# several workspaces ends with the one that counts.
plan_summary() {
  local summary

  summary="$(grep -E "$SUMMARY_PATTERN" | tail -n 1)" || true

  # "Changes to Outputs:" ends in a colon because the list of them follows it
  # in the log. Only the line itself reaches the comment, so the colon would
  # dangle, promising a list that is not there.
  printf '%s' "${summary%:}"
}

# Build the PR comment markdown from the summary ($1), the job URL ($2) and
# the environment ($3).
#
# An empty summary means Terraform reached no conclusion — almost always a
# failed plan. That is reported as a single line too: the failure needs to be
# visible, not verbose, and the reason is in the job log the link points at.
#
# The environment was hardcoded to "teaching" until 2026-09-23, from before
# the workflow ran a matrix. Every `Plan (app)` comment since then has been
# headed `teaching`, which a green check never reveals.
build_body() {
  local summary="$1"
  local job_url="$2"
  local environment="${3:-unknown}"

  if [ -z "$summary" ]; then
    summary="$NO_SUMMARY_TEXT"
  fi

  cat <<EOF
### Terraform Plan: \`${environment}\`

\`\`\`
${summary}
\`\`\`

See the plan job for full details: ${job_url}
EOF
}

# Resolve the URL of this run's plan job, so the link opens the log itself
# rather than the run's list of jobs.
#
# The job id is only available from the API — the runner exposes the job's
# config key in GITHUB_JOB, not its display name or id — so this matches on the
# display name passed in JOB_NAME. Any failure to resolve it falls back to the
# run URL given in $1: a link one click coarser is not worth failing the
# comment over, and it is why JOB_NAME drifting from the workflow degrades the
# link rather than breaking the step.
resolve_job_url() {
  local run_url="$1"
  local job_name="${JOB_NAME:-}"
  local jobs_url="repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/attempts/${GITHUB_RUN_ATTEMPT:-1}/jobs"
  local url=""

  # Reads the name from the environment rather than interpolating it into the
  # program, so a job name containing a quote cannot break out of the string.
  # shellcheck disable=SC2016  # $ENV is jq syntax, not a shell expansion
  local jq_program='first(.jobs[] | select(.name == $ENV.JOB_NAME) | .html_url)'

  if [ -n "$job_name" ]; then
    url="$(
      JOB_NAME="$job_name" gh api "$jobs_url" --paginate --jq "$jq_program" 2>/dev/null |
        head -n 1
    )" || url=""
  fi

  if [ -n "$url" ]; then
    printf '%s' "$url"
    return 0
  fi

  # To stderr: this function's stdout is its return value, so a diagnostic
  # written to stdout would be captured and spliced into the comment body.
  log "Could not resolve the job URL; linking to the run instead" >&2
  printf '%s' "$run_url"
}

# The environment this plan covers, read from JOB_NAME ("Plan (app)" gives
# "app"). The runner exposes the job's config key rather than its display
# name, so JOB_NAME is what the workflow passes and what the job link is
# resolved by; taking the environment from the same place keeps the heading
# and the link describing one job.
plan_environment() {
  local job_name="${JOB_NAME:-}"
  local environment=""

  # The pattern lives in a variable: a backslash inside [[ =~ ]] is taken
  # literally by bash, so an inline \( would not mean a bracket.
  local pattern='\(([^)]+)\)'

  if [[ "$job_name" =~ $pattern ]]; then
    environment="${BASH_REMATCH[1]}"
  fi

  printf '%s' "${environment:-unknown}"
}

main() {
  set -euo pipefail

  local pr_number="${1:-}"

  if [ -z "$pr_number" ]; then
    error "No pull request number provided"
    return 1
  fi

  if [ -z "${GH_TOKEN:-}" ]; then
    error "GH_TOKEN is not set; cannot authenticate with the GitHub CLI"
    return 1
  fi

  if [ ! -s "$PLAN_FILE" ]; then
    error "Plan file '$PLAN_FILE' is missing or empty"
    return 1
  fi

  local run_url="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"

  local summary
  local job_url
  local body

  summary="$(plan_summary <"$PLAN_FILE")"
  job_url="$(resolve_job_url "$run_url")"

  body="$(build_body "$summary" "$job_url" "$(plan_environment)")"

  log "Posting plan comment to PR #$pr_number"

  # A failed post does not fail the job. The comment is a convenience: the
  # plan has already run and its result is in the log the comment would have
  # linked to. GitHub returned a 502 here on 2026-09-23, after a clean plan,
  # and took the whole check red with it, which is a poor trade for a
  # courtesy comment.
  if ! printf '%s' "$body" | gh pr comment "$pr_number" --body-file -; then
    log "Could not post the plan comment; the plan itself is unaffected" >&2
  fi
}

# Only run when executed directly, so bats can source the pure functions.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  main "$@"
fi
