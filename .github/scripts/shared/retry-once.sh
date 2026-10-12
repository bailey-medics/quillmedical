#!/usr/bin/env bash
# Runs a command, and runs it once more if it fails.
#
# Usage: retry-once.sh <command> [<argument>...]
#
# For a step that reaches an outside service: a registry pull, a package
# install, a tool download. A 504 or a 429 that clears in half a minute
# then costs half a minute, and not the pull request its place in the
# merge queue.
#
# Once, and no more. A service that fails twice in a row is down, and
# waiting longer only reports that later.
#
# Never wrap a test, a linter or a build of our own code in this. Those
# fail because of the code, and a second run of a real failure hides a
# flaky test and doubles the time to the answer.
#
# The wait is RETRY_WAIT_SECONDS, 30 unless set. The second failure's exit
# status is the one returned.
set -uo pipefail

# shellcheck source=logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/logging.sh" "retry-once"

if [ "$#" -eq 0 ]; then
  error "No command given. Usage: retry-once.sh <command> [<argument>...]"
  exit 2
fi

wait_seconds="${RETRY_WAIT_SECONDS:-30}"

# Not `if "$@"`: after an `if` whose test failed, $? reads 0.
"$@"
first_status=$?

if [ "$first_status" -eq 0 ]; then
  exit 0
fi

# An annotation, so a run that needed its second try says so on the
# summary page and does not look like a run where nothing went wrong.
echo "::warning title=Retried an outside call::'$1' failed with status ${first_status}. Trying once more in ${wait_seconds}s."
sleep "$wait_seconds"

"$@"
second_status=$?

if [ "$second_status" -ne 0 ]; then
  error "'$1' failed twice, with status ${first_status} and then ${second_status}."
fi

exit "$second_status"
