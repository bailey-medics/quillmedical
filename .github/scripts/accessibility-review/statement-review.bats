#!/usr/bin/env bats
# Tests for statement-review.sh
#
# The date arithmetic is what has to be right: too early and the reminder
# nags a statement reviewed last month; too late and the year runs out.

# shellcheck disable=SC2329,SC2030,SC2031

setup() {
  source "${BATS_TEST_DIRNAME}/statement-review.sh"
  export STATEMENT_FILE="${BATS_TEST_TMPDIR}/statement.tsx"
  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/output"
  : >"$GITHUB_OUTPUT"
}

# Writes a statement fixture reviewed on the given date.
write_statement() {
  printf 'const FEEDBACK_EMAIL = "x";\nconst REVIEWED = "%s";\n' "$1" >"$STATEMENT_FILE"
}

@test "reads the REVIEWED date from the statement" {
  write_statement "25 September 2026"

  run read_reviewed "$STATEMENT_FILE"

  [ "$output" = "25 September 2026" ]
}

@test "is not due a month after a review" {
  write_statement "25 September 2026"
  export TODAY="2026-10-26"

  main

  grep -qx "due=false" "$GITHUB_OUTPUT"
}

@test "is not due the day before eleven months" {
  write_statement "25 September 2026"
  export TODAY="2027-08-24"

  main

  grep -qx "due=false" "$GITHUB_OUTPUT"
}

@test "is due from eleven months, a month before the year is up" {
  write_statement "25 September 2026"
  export TODAY="2027-08-25"

  main

  grep -qx "due=true" "$GITHUB_OUTPUT"
}

@test "stays due after the year has run out" {
  write_statement "25 September 2026"
  export TODAY="2027-11-02"

  main

  grep -qx "due=true" "$GITHUB_OUTPUT"
}

@test "gives the date the review is due by, a year on" {
  write_statement "25 September 2026"
  export TODAY="2027-09-06"

  main

  grep -qx "due_by=25 September 2027" "$GITHUB_OUTPUT"
  grep -qx "reviewed=25 September 2026" "$GITHUB_OUTPUT"
}

@test "handles a review on the last day of a longer month" {
  write_statement "31 October 2026"
  export TODAY="2027-09-30"

  main

  grep -qx "due=true" "$GITHUB_OUTPUT"
  grep -qx "due_by=31 October 2027" "$GITHUB_OUTPUT"
}

@test "reports due whatever the date when forced" {
  write_statement "25 September 2026"
  export TODAY="2026-10-01"

  main true

  grep -qx "due=true" "$GITHUB_OUTPUT"
}

@test "fails when the statement is missing" {
  export STATEMENT_FILE="${BATS_TEST_TMPDIR}/nowhere.tsx"

  run main

  [ "$status" -eq 1 ]
  [[ "$output" == *"statement not found"* ]]
}

@test "fails when the statement has no REVIEWED line" {
  printf 'const FEEDBACK_EMAIL = "x";\n' >"$STATEMENT_FILE"

  run main

  [ "$status" -eq 1 ]
  [[ "$output" == *"no 'const REVIEWED"* ]]
}

@test "the real statement carries a REVIEWED date it can read" {
  export STATEMENT_FILE="${BATS_TEST_DIRNAME}/../../../frontend/public_pages/src/pages/accessibility-statement.tsx"

  run read_reviewed "$STATEMENT_FILE"

  [[ "$output" =~ ^[0-9]{1,2}\ [A-Z][a-z]+\ [0-9]{4}$ ]]
}
