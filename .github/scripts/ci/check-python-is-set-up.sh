#!/usr/bin/env bash
# Checks every CI job that runs Python on the runner sets Python up first.
#
# Usage: check-python-is-set-up.sh <workflows directory>
#
# `.python-version` names the Python this repository is written for, and
# a job gets it by calling the setup-python action. A job that runs Python
# without that step still works: the runner ships a Python of its own, an
# older one, and uses it without saying so. Nothing compared that Python
# with the pinned one, because the job names no version to compare.
#
# That matters once a file uses something the older Python cannot read.
# Black and Ruff format every Python file here for the pinned version, so
# a script that parses on a developer's machine can stop with a syntax
# error in the one job that never set Python up.
#
# So this reads each workflow and fails when a job runs Python on the
# runner and has no setup-python step. A job runs Python when a line of
# it:
#
#   - calls `python` or `python3`, or
#   - names a file ending `.py`, or
#   - calls one of INDIRECT_RUNNERS, below.
#
# A line that runs Python inside a container is left alone, since the
# container brings its own.
#
# It reads the workflows as text, by their indentation, and not as YAML:
# a job is a key two spaces in under `jobs:`. Every workflow here is
# written that way, and actionlint fails one that is not valid.
#
# Exit codes:
#   0  every job that runs Python sets it up
#   1  a job does not, or nothing was found to check
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "check-python-is-set-up"

# Commands that run Python without the workflow line saying so. The
# workflow shows `bash run-shell-tests.sh`, and the Python is one call
# further in, which is how the shell test job came to run on the runner's
# Python unnoticed.
#
# A list, and not a search through every script a job calls: following
# calls from one shell script into the next is where a check like this
# stops being right. When a script under .github/scripts starts running a
# Python file on the runner, add its name here.
readonly INDIRECT_RUNNERS=(
  "run-shell-tests.sh"
  "check-migrations-unmodified.sh"
  "detect-destructive-migrations.sh"
)

# Prints every workflow file in a directory, one to a line.
workflow_files() {
  local directory="$1"

  find "$directory" -maxdepth 1 -type f \( -name '*.yml' -o -name '*.yaml' \) | sort
}

# Prints each line of a workflow's jobs as "<job><TAB><line>".
#
# A command split over several lines with a trailing backslash is joined
# into one, so that `docker compose exec \` and the `python` on the line
# after it are read together.
job_lines() {
  local file="$1"
  local line
  local job=""
  local in_jobs=0
  local pending=""

  while IFS= read -r line || [ -n "$line" ]; do
    if [[ "$line" =~ ^jobs:[[:space:]]*$ ]]; then
      in_jobs=1
      continue
    fi

    if [ "$in_jobs" -eq 0 ]; then
      continue
    fi

    # Another key at the left margin ends the jobs.
    if [[ "$line" =~ ^[^[:space:]#] ]]; then
      in_jobs=0
      continue
    fi

    if [[ "$line" =~ ^\ \ ([A-Za-z0-9_-]+):[[:space:]]*(#.*)?$ ]]; then
      job="${BASH_REMATCH[1]}"
      pending=""
      continue
    fi

    if [ -z "$job" ]; then
      continue
    fi

    if [[ "$line" =~ \\[[:space:]]*$ ]]; then
      pending+="${line%\\*} "
      continue
    fi

    printf '%s\t%s\n' "$job" "${pending}${line}"
    pending=""
  done <"$file"
}

# True when a line is the step that sets Python up: this repository's own
# action, or the one it wraps.
sets_python_up() {
  local line="$1"

  [[ "$line" =~ uses:[[:space:]]*(\./\.github/actions/setup-python|actions/setup-python@) ]]
}

# True when a line says something about a step and runs nothing: a
# comment, a name, the action a step uses, or the condition it runs on.
is_not_a_command() {
  local line="$1"

  [[ "$line" =~ ^[[:space:]]*(#|(-[[:space:]]+)?(name|uses|if):) ]]
}

# True when a line runs its command inside a container.
runs_in_a_container() {
  local line="$1"

  [[ "$line" =~ docker[[:space:]]+(compose|run|exec)([[:space:]]|$) ]]
}

# True when a line calls one of INDIRECT_RUNNERS.
calls_an_indirect_runner() {
  local line="$1"
  local runner

  for runner in "${INDIRECT_RUNNERS[@]}"; do
    if [[ "$line" == *"$runner"* ]]; then
      return 0
    fi
  done

  return 1
}

# True when a line runs Python on the runner.
runs_python() {
  local line="$1"

  if is_not_a_command "$line" || runs_in_a_container "$line"; then
    return 1
  fi

  # `python` or `python3` as a word of its own: not `python-version:`,
  # and not part of a path such as `.venv/bin/python`.
  if [[ "$line" =~ (^|[^[:alnum:]_./-])python3?([[:space:]]|$) ]]; then
    return 0
  fi

  if [[ "$line" =~ \.py([[:space:]\"\'\)\;]|$) ]]; then
    return 0
  fi

  calls_an_indirect_runner "$line"
}

# Prints "<job> <runs> <sets up>" for each job in a workflow, where the
# last two are 1 or 0: whether the job runs Python on the runner, and
# whether it sets Python up.
job_summaries() {
  local file="$1"
  local job
  local line
  local current=""
  local runs=0
  local sets_up=0

  while IFS=$'\t' read -r job line; do
    if [ "$job" != "$current" ]; then
      if [ -n "$current" ]; then
        echo "$current $runs $sets_up"
      fi

      current="$job"
      runs=0
      sets_up=0
    fi

    if sets_python_up "$line"; then
      sets_up=1
    elif runs_python "$line"; then
      runs=1
    fi
  done < <(job_lines "$file")

  if [ -n "$current" ]; then
    echo "$current $runs $sets_up"
  fi
}

main() {
  local directory="${1:-}"

  if [ -z "$directory" ]; then
    error "No workflows directory given. Usage: check-python-is-set-up.sh <workflows directory>"
    return 1
  fi

  if [ ! -d "$directory" ]; then
    error "No such directory: ${directory}"
    return 1
  fi

  local file
  local job
  local runs
  local sets_up
  local files=0
  local jobs_set_up=0
  local fail=0

  while IFS= read -r file; do
    files=$((files + 1))

    while read -r job runs sets_up; do
      if [ "$sets_up" -eq 1 ]; then
        jobs_set_up=$((jobs_set_up + 1))
      elif [ "$runs" -eq 1 ]; then
        error "${file}: job '${job}' runs Python and does not set it up. Add a step that uses ./.github/actions/setup-python, with install-backend-deps: \"false\" if it needs no packages"
        fail=1
      fi
    done < <(job_summaries "$file")
  done < <(workflow_files "$directory")

  # A check that read nothing passes. Both of these mean it is looking in
  # the wrong place, or no longer understands what it is reading.
  if [ "$files" -eq 0 ]; then
    error "No workflow files found in ${directory}, so nothing was checked"
    return 1
  fi

  if [ "$jobs_set_up" -eq 0 ]; then
    error "No job in ${directory} sets Python up. Either none does, or this script no longer recognises the step, so nothing was checked"
    return 1
  fi

  if [ "$fail" -ne 0 ]; then
    return 1
  fi

  log "Read ${files} workflow files. Every job that runs Python sets it up (${jobs_set_up} jobs do)."
}

# Only run when executed, so the tests can source this file.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  main "$@"
fi
