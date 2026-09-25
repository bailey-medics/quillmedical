#!/usr/bin/env bats
# Tests for send-reminder.sh. Nothing is sent: DRY_RUN prints the request.

# shellcheck disable=SC2329,SC2030,SC2031

setup() {
  source "${BATS_TEST_DIRNAME}/send-reminder.sh"
  export DRY_RUN="true"
  unset RESEND_API_KEY
  ARGS=("mark@quill-medical.com" "info@quill-medical.com" "25 September 2026" "25 September 2027")
}

@test "addresses the reminder to the recipient, from the sender" {
  run main "${ARGS[@]}"

  [ "$status" -eq 0 ]
  [[ "$output" == *'"to": ['*'"mark@quill-medical.com"'* ]]
  [[ "$output" == *'"from": "info@quill-medical.com"'* ]]
}

@test "puts the due date in the subject" {
  run main "${ARGS[@]}"

  [[ "$output" == *'"subject": "Accessibility statement review due by 25 September 2027"'* ]]
}

@test "links the statement and says how to stop the reminders" {
  run body "25 September 2026" "25 September 2027"

  [[ "$output" == *"https://quill-medical.com/accessibility-statement"* ]]
  [[ "$output" == *"Move the REVIEWED date"* ]]
  [[ "$output" == *"last reviewed on 25 September 2026"* ]]
}

@test "refuses to send without the API key" {
  export DRY_RUN="false"

  run main "${ARGS[@]}"

  [ "$status" -eq 1 ]
  [[ "$output" == *"RESEND_API_KEY"* ]]
}

@test "refuses to send without every argument" {
  run main "mark@quill-medical.com" "info@quill-medical.com"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage: send-reminder.sh"* ]]
}
