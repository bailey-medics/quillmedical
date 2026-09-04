#!/usr/bin/env bats
# Tests for stale-incidents.sh
#
# Ordered to follow main(): the environment guard first, then the filtering,
# which is the part that has to be right. The live API returns no open
# incidents most of the time, so detection can only be proven with fixtures.

# shellcheck disable=SC2329,SC2030,SC2031

setup() {
  source "${BATS_TEST_DIRNAME}/stale-incidents.sh"
  FIXTURE="${BATS_TEST_TMPDIR}/incidents.json"
  export INCIDENTS_JSON="$FIXTURE"
  export GCP_PROJECT="test-project"
}

# Writes an incidents fixture with one entry, `hours_ago` old.
write_fixture() {
  local state="$1"
  local hours_ago="$2"
  local policy="${3:-Uptime failure (test)}"
  local opened
  opened="$(date -u -d "@$(( $(date -u +%s) - hours_ago * 3600 ))" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
    || date -u -r "$(( $(date -u +%s) - hours_ago * 3600 ))" +%Y-%m-%dT%H:%M:%SZ)"
  cat >"$FIXTURE" <<JSON
{"alerts":[{"state":"${state}","openTime":"${opened}",
  "policy":{"displayName":"${policy}"},
  "resource":{"labels":{"host":"example.com"}}}]}
JSON
}

@test "errors when GCP_PROJECT is unset" {
  unset GCP_PROJECT

  run main

  [ "$status" -eq 1 ]
  [[ "$output" == *"GCP_PROJECT is not set"* ]]
}

@test "reports nothing when there are no incidents at all" {
  echo '{"alerts":[]}' >"$FIXTURE"

  run main

  [ "$status" -eq 0 ]
  [[ "$output" == *"No incident open for 24h or more (0 open)"* ]]
}

@test "ignores a closed incident however old" {
  write_fixture CLOSED 5000

  run main

  [ "$status" -eq 0 ]
}

@test "ignores an open incident younger than the threshold" {
  write_fixture OPEN 2

  run main

  [ "$status" -eq 0 ]
  [[ "$output" == *"(1 open)"* ]]
}

@test "reports an open incident older than the threshold" {
  write_fixture OPEN 30 "Uptime failure (teaching)"

  run main

  [ "$status" -eq 0 ]
  [[ "$output" == *"Uptime failure (teaching)"* ]]
  [[ "$output" == *"1d 6h"* ]]
  [[ "$output" == *"example.com"* ]]
}

@test "reports the 124-day case that prompted this script" {
  write_fixture OPEN 2996 "Uptime failure (teaching)"

  run main

  [ "$status" -eq 0 ]
  [[ "$output" == *"124d"* ]]
}

@test "honours a custom threshold" {
  write_fixture OPEN 2

  STALE_HOURS=1 run main

  [ "$status" -eq 0 ]
  [[ "$output" == *"open 2h"* ]]
}

# ---------- format_incident, now testable on its own ----------

@test "formats an age under a day as plain hours" {
  run format_incident 6 "Server errors" "quill-backend"

  [ "$output" = "- Server errors — open 6h (quill-backend)" ]
}

@test "formats exactly one day as 1d 0h" {
  run format_incident 24 "Uptime failure" "example.com"

  [ "$output" = "- Uptime failure — open 1d 0h (example.com)" ]
}

@test "formats the 124-day case readably" {
  run format_incident 2996 "Uptime failure (teaching)" "quill-medical.com"

  [ "$output" = "- Uptime failure (teaching) — open 124d 20h (quill-medical.com)" ]
}

@test "omits the brackets when there is no location" {
  run format_incident 30 "Some policy" ""

  [ "$output" = "- Some policy — open 1d 6h" ]
}

# ---------- the new helpers, each testable on its own ----------

@test "to_epoch parses an ISO-8601 timestamp" {
  run to_epoch "2026-04-30T14:54:00Z"

  [ "$output" = "1777560840" ]
}

@test "hours_since counts whole hours" {
  local three_hours_ago
  three_hours_ago="$(date -u -d "@$(($(date -u +%s) - 10800))" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
    || date -u -r "$(($(date -u +%s) - 10800))" +%Y-%m-%dT%H:%M:%SZ)"

  run hours_since "$three_hours_ago"

  [ "$output" = "3" ]
}

@test "extract_incidents pulls the five fields, nulls becoming empty" {
  run extract_incidents <<<'{"alerts":[{"state":"OPEN","openTime":"2026-04-30T14:54:00Z"}]}'

  # Three trailing tabs: policy, host and service are all absent.
  [ "$output" = "$(printf 'OPEN\t2026-04-30T14:54:00Z\t\t\t')" ]
}

@test "an unnamed policy still reports readably" {
  cat >"$FIXTURE" <<'JSON'
{"alerts":[{"state":"OPEN","openTime":"2020-01-01T00:00:00Z"}]}
JSON
  run main

  [ "$status" -eq 0 ]
  [[ "$output" == *"(unknown policy)"* ]]
}

@test "falls back to the service name when there is no host" {
  cat >"$FIXTURE" <<'JSON'
{"alerts":[{"state":"OPEN","openTime":"2020-01-01T00:00:00Z",
  "policy":{"displayName":"Server errors"},
  "resource":{"labels":{"service_name":"quill-backend-teaching"}}}]}
JSON
  run main

  [ "$status" -eq 0 ]
  [[ "$output" == *"(quill-backend-teaching)"* ]]
}

# ---------- the split-out functions, called directly ----------

@test "stale_report returns its result on standard output" {
  cat >"$FIXTURE" <<'JSON'
{"alerts":[{"state":"OPEN","openTime":"2020-01-01T00:00:00Z",
  "policy":{"displayName":"Old policy"},
  "resource":{"labels":{"host":"example.com"}}}]}
JSON

  run stale_report "$(cat "$FIXTURE")" 24

  [ "$status" -eq 0 ]
  [[ "$output" == *"Old policy"* ]]
}

@test "stale_report prints nothing when everything is fresh" {
  write_fixture OPEN 2

  run stale_report "$(cat "$FIXTURE")" 24

  [ "$output" = "" ]
}

@test "count_open counts open incidents regardless of age" {
  cat >"$FIXTURE" <<'JSON'
{"alerts":[
  {"state":"OPEN","openTime":"2020-01-01T00:00:00Z"},
  {"state":"CLOSED","openTime":"2020-01-01T00:00:00Z"},
  {"state":"OPEN","openTime":"2026-01-01T00:00:00Z"}
]}
JSON

  run count_open "$(cat "$FIXTURE")"

  [ "$output" = "2" ]
}

# ---------- the GitHub Actions step output ----------

@test "publishes the report as the stale step output" {
  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/github_output"
  : >"$GITHUB_OUTPUT"
  write_fixture OPEN 30 "Uptime failure (teaching)"

  run main

  [ "$status" -eq 0 ]

  run cat "$GITHUB_OUTPUT"
  [[ "$output" == *"stale<<STALE_INCIDENTS_EOF"* ]]
  [[ "$output" == *"Uptime failure (teaching)"* ]]
}

@test "publishes an empty stale output when nothing is stale" {
  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/github_output"
  : >"$GITHUB_OUTPUT"
  write_fixture OPEN 2

  run main

  [ "$status" -eq 0 ]

  run cat "$GITHUB_OUTPUT"
  [[ "$output" == *"stale<<STALE_INCIDENTS_EOF"* ]]
  [[ "$output" != *"open 2h"* ]]
}

@test "writes no step output when GITHUB_OUTPUT is unset" {
  write_fixture OPEN 30

  run main

  [ "$status" -eq 0 ]
  [[ "$output" == *"open 1d 6h"* ]]
}

@test "refuses a report containing the output delimiter" {
  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/github_output"
  : >"$GITHUB_OUTPUT"

  run publish_step_output "STALE_INCIDENTS_EOF"

  [ "$status" -eq 1 ]
  [[ "$output" == *"refusing to write it"* ]]
}

# ---------- the threshold boundary ----------

@test "reports an incident open for exactly the threshold" {
  write_fixture OPEN 24 "Uptime failure (teaching)"

  STALE_HOURS=24 run main

  [ "$status" -eq 0 ]
  [[ "$output" == *"1d 0h"* ]]
}

@test "a threshold of zero reports every open incident, however fresh" {
  write_fixture OPEN 0 "Just opened"

  STALE_HOURS=0 run main

  [ "$status" -eq 0 ]
  [[ "$output" == *"Just opened"* ]]
  [[ "$output" == *"open 0h"* ]]
}
