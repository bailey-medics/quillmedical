#!/usr/bin/env bash
# Posts the Terraform plan output as a comment on a pull request.
#
# Usage: GH_TOKEN=<token> post-plan-comment.sh <pr-number>
#
# Reads the plan from infra/plan-output.txt (written by the "Terraform plan"
# step), truncates it to stay within GitHub's comment size limit, wraps it in
# markdown, and posts it with the `gh` CLI.
#
# Environment:
#   GH_TOKEN            Token used by `gh` to authenticate. Set by the workflow.
#   GITHUB_SERVER_URL   Base URL, e.g. "https://github.com" (set by the runner).
#   GITHUB_REPOSITORY   "owner/repo" (set by the runner).
#   GITHUB_RUN_ID       Current run id, used to link back to the workflow.

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "post-plan-comment"

# GitHub caps comment bodies at 65536 characters; leave headroom for the
# surrounding markdown (title, code fences, workflow link).
MAX_PLAN_LEN=60000
PLAN_FILE="infra/plan-output.txt"

# Truncate the plan text read from stdin to MAX_PLAN_LEN characters, appending a
# marker when it was cut. Pure (no I/O beyond stdin/stdout) so it can be tested.
truncate_plan() {
  local plan
  plan="$(cat)"
  if [ "${#plan}" -gt "$MAX_PLAN_LEN" ]; then
    printf '%s\n\n... (truncated)' "${plan:0:MAX_PLAN_LEN}"
  else
    printf '%s' "$plan"
  fi
}

# Build the PR comment markdown from the plan text ($1) and the run URL ($2).
build_body() {
  local plan="$1"
  local run_url="$2"

  cat <<EOF
### Terraform Plan: \`teaching\`

\`\`\`
${plan}
\`\`\`

*Workflow:* ${run_url}
EOF
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

  local plan body
  plan="$(truncate_plan <"$PLAN_FILE")"
  body="$(build_body "$plan" "$run_url")"

  log "Posting plan comment to PR #$pr_number"
  printf '%s' "$body" | gh pr comment "$pr_number" --body-file -
}

# Only run when executed directly, so bats can source the pure functions.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  main "$@"
fi
