#!/usr/bin/env bash
# Shows or sets which runner the slow CI jobs use, through repository
# variables that ci.yml reads.
#
# Usage: set-ci-speed.sh <show|0|1|2> [job]
#
#   show  list the variables that are set
#   0     the free standard runner: the variables are deleted
#   1     eight cores
#   2     sixteen cores
#
# [job] is one of python-unit, frontend-unit, storybook, e2e-build or e2e,
# and limits the change to that job, so each can be measured on its own.
# Left out, every job moves together.
#
# Run by hand through `just ci-speed`, not from a workflow. It needs `gh`
# signed in with permission to change the repository's variables.
#
# Levels 1 and 2 cost money on every run, even on a public repository, and
# take effect on the next run with no commit. The runners they name must
# exist first: larger runners called ubuntu-24.04-8core and
# ubuntu-24.04-16core, in a runner group that allows public repositories.
# A variable that names a runner which does not exist leaves its job
# waiting for one, so check a run after changing level.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "set-ci-speed"

RUNNER_LEVEL_1="ubuntu-24.04-8core"
RUNNER_LEVEL_2="ubuntu-24.04-16core"

# Job name, then the variable ci.yml reads for it.
JOBS=(
  "python-unit=CI_RUNNER_PYTHON_UNIT"
  "frontend-unit=CI_RUNNER_FRONTEND_UNIT"
  "storybook=CI_RUNNER_STORYBOOK"
  "e2e-build=CI_RUNNER_E2E_BUILD"
  "e2e=CI_RUNNER_E2E"
)

usage() {
  error "Usage: set-ci-speed.sh <show|0|1|2> [python-unit|frontend-unit|storybook|e2e-build|e2e]"
}

# Prints the variable for one job, or every variable when no job is given.
variables_for() {
  local job="$1"
  local entry
  local found=0

  for entry in "${JOBS[@]}"; do
    if [ -z "$job" ] || [ "${entry%%=*}" = "$job" ]; then
      echo "${entry#*=}"
      found=1
    fi
  done

  [ "$found" -eq 1 ]
}

show() {
  local entry
  local variable
  local value

  for entry in "${JOBS[@]}"; do
    variable="${entry#*=}"

    if value="$(gh variable get "$variable" 2>/dev/null)"; then
      log "${entry%%=*}: ${value}"
    else
      log "${entry%%=*}: ubuntu-24.04 (free)"
    fi
  done
}

# Deleting a variable that is not set is an error to gh, and not to us.
delete_variable() {
  local variable="$1"

  if gh variable get "$variable" >/dev/null 2>&1; then
    gh variable delete "$variable"
  fi
}

main() {
  local level="${1:-}"
  local job="${2:-}"
  local runner=""
  local variables
  local variable

  case "$level" in
    show)
      show
      return
      ;;
    0) ;;
    1) runner="$RUNNER_LEVEL_1" ;;
    2) runner="$RUNNER_LEVEL_2" ;;
    *)
      usage
      exit 1
      ;;
  esac

  if ! variables="$(variables_for "$job")"; then
    error "Unknown job '${job}'"
    usage
    exit 1
  fi

  for variable in $variables; do
    if [ -z "$runner" ]; then
      delete_variable "$variable"
      log "${variable} cleared: the free runner"
    else
      gh variable set "$variable" --body "$runner"
      log "${variable} set to ${runner}: this is billed per minute"
    fi
  done
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
