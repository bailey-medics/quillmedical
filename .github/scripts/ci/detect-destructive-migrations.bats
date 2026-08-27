#!/usr/bin/env bats
# Tests for detect-destructive-migrations.sh - `git` and `python3` are stubbed
# so the file-selection and output-writing logic can be tested without a real
# repository or checker.

# shellcheck disable=SC2329,SC2030,SC2031

setup() {
  source "${BATS_TEST_DIRNAME}/detect-destructive-migrations.sh"
  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/github_output"
  : >"$GITHUB_OUTPUT"
}

@test "no migrations added - logs the reason and writes destructive=false" {
  git() { :; }

  run main origin/main
  [ "$status" -eq 0 ]
  [[ "$output" == *"No migration files added on this PR."* ]]

  expected="destructive=false
report<<DESTRUCTIVE_REPORT_EOF

DESTRUCTIVE_REPORT_EOF"
  [ "$(cat "$GITHUB_OUTPUT")" = "$expected" ]
}

@test "no destructive ops - logs the reason and writes destructive=false" {
  git() { echo "backend/alembic/versions/a.py"; }
  python3() { :; }

  run main origin/main
  [ "$status" -eq 0 ]
  [[ "$output" == *"No destructive operations in the added migration(s)."* ]]

  expected="destructive=false
report<<DESTRUCTIVE_REPORT_EOF

DESTRUCTIVE_REPORT_EOF"
  [ "$(cat "$GITHUB_OUTPUT")" = "$expected" ]
}

@test "drop found - logs the report and writes destructive=true with the report" {
  git() { echo "backend/alembic/versions/a.py"; }
  python3() { echo "a.py abc123 drop_column"; }

  run main origin/main
  [ "$status" -eq 0 ]
  [[ "$output" == *"Destructive operation(s) detected"* ]]
  [[ "$output" == *"a.py abc123 drop_column"* ]]

  expected="destructive=true
report<<DESTRUCTIVE_REPORT_EOF
a.py abc123 drop_column
DESTRUCTIVE_REPORT_EOF"
  [ "$(cat "$GITHUB_OUTPUT")" = "$expected" ]
}

@test "two drops found - logs both and writes both to the report" {
  git() {
    echo "backend/alembic/versions/a.py"
    echo "backend/alembic/versions/b.py"
  }
  python3() {
    echo "a.py abc123 drop_column"
    echo "b.py def456 drop_table"
  }

  run main origin/main
  [ "$status" -eq 0 ]
  [[ "$output" == *"a.py abc123 drop_column"* ]]
  [[ "$output" == *"b.py def456 drop_table"* ]]

  expected="destructive=true
report<<DESTRUCTIVE_REPORT_EOF
a.py abc123 drop_column
b.py def456 drop_table
DESTRUCTIVE_REPORT_EOF"
  [ "$(cat "$GITHUB_OUTPUT")" = "$expected" ]
}

@test "checks all of the files that are passed to python3" {
  git() {
    echo "backend/alembic/versions/a.py"
    echo "backend/alembic/versions/b.py"
  }
  python3() {
    # Echo the file arguments so the test can assert on them. $1 is the
    # checker path and $2 is --report-destructive.
    shift 2
    echo "called-with: $*"
  }

  run main origin/main
  [[ "$output" == *"called-with: backend/alembic/versions/a.py backend/alembic/versions/b.py"* ]]
}

@test "diffs against the given main ref" {
  git() { echo "git $*" >&2; }

  run main custom/ref
  [[ "$output" == *"git diff --name-only --diff-filter=A custom/ref...HEAD -- backend/alembic/versions/*.py"* ]]
}

@test "defaults to origin/main when no ref is given" {
  git() { echo "git $*" >&2; }

  run main
  [[ "$output" == *"git diff --name-only --diff-filter=A origin/main...HEAD -- backend/alembic/versions/*.py"* ]]
}

@test "succeeds without GITHUB_OUTPUT set" {
  git() { echo "backend/alembic/versions/a.py"; }
  python3() { echo "a.py abc123 drop_column"; }
  unset GITHUB_OUTPUT

  run main origin/main
  [ "$status" -eq 0 ]
  [[ "$output" == *"a.py abc123 drop_column"* ]]
}
