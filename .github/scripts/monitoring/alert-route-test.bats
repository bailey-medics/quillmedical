#!/usr/bin/env bats
# Tests for alert-route-test.sh
#
# The schedule guards are the part that has to be right: a wrong one either
# fires a phone call on the wrong Thursday or silently never tests at all.
# gcloud is stubbed and records what it was asked, so "nothing was written"
# is asserted rather than assumed.

bats_require_minimum_version 1.5.0

setup() {
  source "${BATS_TEST_DIRNAME}/alert-route-test.sh"

  STUB_DIR="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$STUB_DIR"
  PATH="$STUB_DIR:$PATH"

  GCLOUD_LOG="$BATS_TEST_TMPDIR/gcloud.log"
  cat >"$STUB_DIR/gcloud" <<STUB
#!/usr/bin/env bash
echo "\$*" >>"$GCLOUD_LOG"
STUB
  chmod +x "$STUB_DIR/gcloud"

  export GCP_PROJECT="test-project"
  unset FORCE SCHEDULE TODAY LONDON_OFFSET
}

@test "the anchor date is a test week" {
  run is_test_week "2026-10-01"

  [ "$status" -eq 0 ]
}

@test "every fourth Thursday after the anchor is a test week" {
  run is_test_week "2026-10-29"
  [ "$status" -eq 0 ]

  run is_test_week "2027-01-21"
  [ "$status" -eq 0 ]
}

@test "the three Thursdays in between are not" {
  run ! is_test_week "2026-10-08"
  run ! is_test_week "2026-10-15"
  run ! is_test_week "2026-10-22"
}

@test "a date before the anchor is never a test week" {
  # Four weeks before the anchor divides by four too; it must not count.
  run ! is_test_week "2026-09-03"
}

@test "the cycle holds across the new year" {
  # 2026-12-24 is the fourth run. Counting from a fixed date rather than
  # the ISO week number keeps the next one exactly 28 days later.
  run is_test_week "2026-12-24"
  [ "$status" -eq 0 ]

  run ! is_test_week "2026-12-31"
  run is_test_week "2027-01-21"
  [ "$status" -eq 0 ]
}

@test "1pm in London is 12:00 UTC in summer and 13:00 UTC in winter" {
  run utc_hour_for_london_one_pm "+0100"
  [ "$output" = "12" ]

  run utc_hour_for_london_one_pm "+0000"
  [ "$output" = "13" ]
}

@test "cron_hour reads the hour field" {
  run cron_hour "15 12 * * 4"

  [ "$output" = "12" ]
}

@test "the summer run fires in a test week" {
  export TODAY="2026-10-01" LONDON_OFFSET="+0100" SCHEDULE="15 12 * * 4"

  run main

  [ "$status" -eq 0 ]
  grep -q "logging write alert-route-test" "$GCLOUD_LOG"
  grep -q -- "--project=test-project" "$GCLOUD_LOG"
}

@test "the winter run fires in a test week" {
  export TODAY="2026-11-26" LONDON_OFFSET="+0000" SCHEDULE="15 13 * * 4"

  run main

  [ "$status" -eq 0 ]
  grep -q "logging write alert-route-test" "$GCLOUD_LOG"
}

@test "the other run of the pair writes nothing" {
  # In summer the 13:15 UTC run is 2:15pm in London.
  export TODAY="2026-10-01" LONDON_OFFSET="+0100" SCHEDULE="15 13 * * 4"

  run main

  [ "$status" -eq 0 ]
  [ ! -e "$GCLOUD_LOG" ]
}

@test "a Thursday outside the cycle writes nothing" {
  export TODAY="2026-10-08" LONDON_OFFSET="+0100" SCHEDULE="15 12 * * 4"

  run main

  [ "$status" -eq 0 ]
  [ ! -e "$GCLOUD_LOG" ]
}

@test "a forced run fires whatever the date and schedule" {
  export FORCE="true" TODAY="2026-10-08" SCHEDULE="15 13 * * 4"

  run main

  [ "$status" -eq 0 ]
  grep -q "logging write alert-route-test" "$GCLOUD_LOG"
}

@test "errors when GCP_PROJECT is unset" {
  unset GCP_PROJECT

  run main

  [ "$status" -eq 1 ]
  [[ "$output" == *"GCP_PROJECT is not set"* ]]
}

@test "errors rather than guessing when a scheduled run has no SCHEDULE" {
  export TODAY="2026-10-01" LONDON_OFFSET="+0100"

  run main

  [ "$status" -eq 1 ]
  [ ! -e "$GCLOUD_LOG" ]
}
