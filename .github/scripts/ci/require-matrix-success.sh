#!/usr/bin/env bash
# Fails unless a matrix job's combined result is "success".
#
# Usage: require-matrix-success.sh <job-name> <result>
#
# <result> is `needs.<job>.result` for a job that fans out over a matrix:
# "success" only when every leg passed, otherwise "failure", "cancelled" or
# "skipped". It exists for a job that carries a required check's name on
# behalf of the legs. Left to GitHub's default, a failed leg skips the job
# that needs it, and a required check that is skipped counts as passed. So
# the caller runs under `always()` and this decides the outcome.
#
# "skipped" fails here on purpose. The caller keeps the legs' own condition
# in its `if`, so on a draft it never runs at all. Reaching this script with
# skipped legs means the two conditions have drifted apart.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "require-matrix-success"

main() {
  local job_name="${1:-}"
  local result="${2:-}"

  if [ -z "$job_name" ] || [ -z "$result" ]; then
    error "Usage: require-matrix-success.sh <job-name> <result>"
    exit 1
  fi

  if [ "$result" != "success" ]; then
    error "${job_name}: the legs finished as '${result}', not 'success'"
    exit 1
  fi

  log "${job_name}: every leg passed"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
