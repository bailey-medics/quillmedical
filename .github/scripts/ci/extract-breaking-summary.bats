#!/usr/bin/env bats
# Tests for extract-breaking-summary.sh
#
# Ordered to follow main(): the argument and environment guards first, then the
# extraction. The line format matters beyond looking tidy - it is what
# new_compat_decision.py asks to be pasted in, so a change to it silently
# breaks the copy-paste path from Slack message to decision file.

# shellcheck disable=SC2329,SC2030,SC2031

setup() {
  source "${BATS_TEST_DIRNAME}/extract-breaking-summary.sh"
  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/github_output"
  : >"$GITHUB_OUTPUT"
  REPORT="${BATS_TEST_TMPDIR}/oasdiff.json"
}

@test "errors when no report is given" {
  run main

  [ "$status" -eq 1 ]
  [[ "$output" == *"No oasdiff report provided"* ]]
}

@test "errors when the report file does not exist" {
  run main "${BATS_TEST_TMPDIR}/missing.json"

  [ "$status" -eq 1 ]
  [[ "$output" == *"not found"* ]]
}

@test "errors when GITHUB_OUTPUT is not set" {
  echo '[]' >"$REPORT"
  unset GITHUB_OUTPUT

  run main "$REPORT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"GITHUB_OUTPUT not set"* ]]
}

@test "extract_change_lines produces the decision-file line format" {
  # This exact shape is what new_compat_decision.py expects pasted in, and what
  # validate-compat-files.sh matches on: id, operation, path, text.
  cat >"$REPORT" <<'EOF'
[{"id":"response-required-property-removed",
  "operation":"GET",
  "path":"/api/test/breaking-api",
  "text":"removed the required property `message` from the response with the `200` status"}]
EOF

  run extract_change_lines "$REPORT"

  [ "$status" -eq 0 ]
  [ "$output" = "response-required-property-removed GET /api/test/breaking-api removed the required property \`message\` from the response with the \`200\` status" ]
}

@test "extract_change_lines returns one line per change" {
  cat >"$REPORT" <<'EOF'
[{"id":"a","operation":"GET","path":"/one","text":"first"},
 {"id":"b","operation":"POST","path":"/two","text":"second"}]
EOF

  run extract_change_lines "$REPORT"

  [ "$status" -eq 0 ]
  [ "${#lines[@]}" -eq 2 ]
  [ "${lines[0]}" = "a GET /one first" ]
  [ "${lines[1]}" = "b POST /two second" ]
}

@test "extract_change_lines skips null and empty fields" {
  # oasdiff omits operation and path for spec-level changes; the line should
  # close up rather than carry blanks.
  cat >"$REPORT" <<'EOF'
[{"id":"api-removed","operation":null,"path":"","text":"an endpoint went away"}]
EOF

  run extract_change_lines "$REPORT"

  [ "$status" -eq 0 ]
  [ "$output" = "api-removed an endpoint went away" ]
}

@test "extract_change_lines prints nothing for an empty report" {
  echo '[]' >"$REPORT"

  run extract_change_lines "$REPORT"

  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "extract_change_lines prints nothing for an unparseable report" {
  # oasdiff writing garbage must not take the job down - the gate message just
  # carries no summary.
  echo 'not json at all' >"$REPORT"

  run extract_change_lines "$REPORT"

  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "refuses a report carrying the output delimiter on its own line" {
  # Otherwise change text could close the heredoc early and write arbitrary
  # step outputs of its own.
  cat >"$REPORT" <<'EOF'
[{"id":"x","operation":"GET","path":"/p","text":"harmless\nBREAKING_SUMMARY_EOF\ninjected=true"}]
EOF

  run main "$REPORT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"refusing to write it"* ]]
}

@test "writes breaking_summary to GITHUB_OUTPUT as a multi-line value" {
  cat >"$REPORT" <<'EOF'
[{"id":"a","operation":"GET","path":"/one","text":"first"},
 {"id":"b","operation":"POST","path":"/two","text":"second"}]
EOF

  main "$REPORT"

  run cat "$GITHUB_OUTPUT"

  [[ "$output" == *"breaking_summary<<BREAKING_SUMMARY_EOF"* ]]
  [[ "$output" == *"a GET /one first"* ]]
  [[ "$output" == *"b POST /two second"* ]]
  [[ "$output" == *$'\nBREAKING_SUMMARY_EOF' ]]
}
