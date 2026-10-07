#!/usr/bin/env bats
# Tests for send-reminder.sh. Nothing is sent: DRY_RUN prints the request.

# shellcheck disable=SC2329,SC2030,SC2031

setup() {
  source "${BATS_TEST_DIRNAME}/send-reminder.sh"
  export DRY_RUN="true"
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
  ARGS=("mark@quill-medical.com" "info@quill-medical.com" "25 September 2026" "25 September 2027")
}

@test "addresses the reminder to the recipient, from the sender" {
  run main "${ARGS[@]}"

  [ "$status" -eq 0 ]
  [[ "$output" == *'"ToAddresses": ['*'"mark@quill-medical.com"'* ]]
  [[ "$output" == *'"FromEmailAddress": "info@quill-medical.com"'* ]]
}

@test "puts the due date in the subject" {
  run main "${ARGS[@]}"

  [[ "$output" == *'"Data": "Accessibility statement review due by 25 September 2027"'* ]]
}

@test "links the statement and says how to stop the reminders" {
  run body "25 September 2026" "25 September 2027"

  [[ "$output" == *"https://quill-medical.com/accessibility-statement"* ]]
  [[ "$output" == *"Move the REVIEWED date"* ]]
  [[ "$output" == *"last reviewed on 25 September 2026"* ]]
}

@test "the request is one the AWS tool accepts" {
  run main "${ARGS[@]}"

  # Drop the log line: what is left is the request itself.
  request="$(echo "$output" | sed -n '/^{/,$p')"
  [ "$(echo "$request" | jq -r '.Content.Simple.Body.Text.Data' | head -1)" = \
    "The accessibility statement is due its yearly review by 25 September 2027. It was last reviewed on 25 September 2026." ]
  [ "$(echo "$request" | jq -r '.Destination.ToAddresses | length')" = "1" ]
}

@test "refuses to send without the access key" {
  export DRY_RUN="false"

  run main "${ARGS[@]}"

  [ "$status" -eq 1 ]
  [[ "$output" == *"AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY"* ]]
}

@test "refuses to send with only half of the access key" {
  export DRY_RUN="false"
  export AWS_ACCESS_KEY_ID="an-id"

  run main "${ARGS[@]}"

  [ "$status" -eq 1 ]
  [[ "$output" == *"are not both set"* ]]
}

@test "sends through SES in London, and says so when it works" {
  export DRY_RUN="false"
  export AWS_ACCESS_KEY_ID="an-id" AWS_SECRET_ACCESS_KEY="a-secret"
  aws() { echo "$*" >"${BATS_TEST_TMPDIR}/aws-args"; }

  run main "${ARGS[@]}"

  [ "$status" -eq 0 ]
  [[ "$output" == *"reminder sent to mark@quill-medical.com"* ]]
  [[ "$(cat "${BATS_TEST_TMPDIR}/aws-args")" == "sesv2 send-email --region eu-west-2 "* ]]
  # The key goes by the environment, never by the arguments.
  [[ "$(cat "${BATS_TEST_TMPDIR}/aws-args")" != *"a-secret"* ]]
}

@test "fails when SES refuses the email" {
  export DRY_RUN="false"
  export AWS_ACCESS_KEY_ID="an-id" AWS_SECRET_ACCESS_KEY="a-secret"
  aws() { return 254; }

  run main "${ARGS[@]}"

  [ "$status" -eq 1 ]
  [[ "$output" == *"SES refused the email"* ]]
}

@test "refuses to send without every argument" {
  run main "mark@quill-medical.com" "info@quill-medical.com"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage: send-reminder.sh"* ]]
}
