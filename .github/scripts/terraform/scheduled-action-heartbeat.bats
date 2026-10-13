#!/usr/bin/env bats
# Holds the "scheduled action has not run" alert to the line each action
# really prints.
#
# The alert in infra/modules/monitoring/main.tf counts one line in the log
# for each finished run of every scheduled action, and is raised when it
# has counted none for a time that action sets. If an action's wording
# changed and the alert's did not, the count would stop and the alert
# would be raised every day, or worse, be muted as noise.
#
# Nothing can run Terraform and the Python tests together, so the text is
# held in three places and tied in two steps. Each action's own test has
# it as RUN_FINISHED, and proves a real run prints a matching line once
# and a report never does. This checks that the alert uses that same text.

setup() {
  ROOT="${BATS_TEST_DIRNAME}/../../.."
  ALERT="${ROOT}/infra/modules/monitoring/main.tf"
}

# The text a test file holds as RUN_FINISHED.
run_finished_in() {
  sed -n -E 's/^RUN_FINISHED = r"(.*)"$/\1/p' "${ROOT}/$1"
}

# The text the alert counts for one action.
line_counted_for() {
  awk -v action="$1" '
    $1 == action && $2 == "=" && $3 == "{" { inside = 1; next }
    inside && $1 == "line" { sub(/^[^"]*"/, ""); sub(/"[[:space:]]*$/, ""); print; exit }
    inside && $1 == "}" { exit }
  ' "$ALERT"
}

@test "each test file holds the line its action ends on" {
  # A search that finds nothing would make the two below compare empty
  # with empty, and pass.
  [ -n "$(run_finished_in backend/app/retention_test.py)" ]
  [ -n "$(run_finished_in backend/app/features/teaching/reminders_test.py)" ]
  [ -n "$(run_finished_in backend/tests/teaching_attempts_out_of_time_test.py)" ]
}

@test "the alert counts the line retention's test proves it prints" {
  [ "$(line_counted_for retention)" = "$(run_finished_in backend/app/retention_test.py)" ]
}

@test "the alert counts the line the reminders' test proves they print" {
  [ "$(line_counted_for teaching-reminders)" = "$(run_finished_in backend/app/features/teaching/reminders_test.py)" ]
}

@test "the alert counts the line the out-of-time sweep's test proves it prints" {
  [ "$(line_counted_for exams-out-of-time)" = "$(run_finished_in backend/tests/teaching_attempts_out_of_time_test.py)" ]
}

@test "the alert has one entry for each action the scheduler starts" {
  # An action added to the scheduler with no entry here would run with
  # nothing watching for its silence.
  scheduled="$(sed -n '/scheduled_admin_actions = {/,/^  }/p' "${ROOT}/infra/scheduled-jobs.tf" \
    | sed -n -E 's/^    ([a-z-]+) = \{$/\1/p' | sort)"
  watched="$(sed -n '/scheduled_action_finished = /,/^  }/p' "$ALERT" \
    | sed -n -E 's/^    ([a-z-]+) = \{$/\1/p' | sort)"

  [ -n "$scheduled" ]
  [ "$scheduled" = "$watched" ]
}

@test "a report is not counted as a run" {
  # The lines a report prints must match neither pattern.
  for pattern in "$(line_counted_for retention)" "$(line_counted_for teaching-reminders)"; do
    ! grep -Eq "$pattern" <<<"Would delete 3 marketing answer records"
    ! grep -Eq "$pattern" <<<"Would send 2 renewal notices"
  done
}
