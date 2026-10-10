#!/usr/bin/env bats
# Tests for run-mypy.sh
#
# Against reports written here, so the suite needs no mypy and no
# backend. What the real check finds is what the pre-commit hook finds out.

setup() {
  source "${BATS_TEST_DIRNAME}/run-mypy.sh"
}

@test "passes a check of the whole backend that found nothing" {
  run check_report 0 <<<"Success: no issues found in 156 source files"

  [ "$status" -eq 0 ]
  [[ "$output" == *"mypy checked 156 files with strict on and found nothing"* ]]
}

@test "fails a check that covered only a few files, though mypy passed it" {
  run check_report 0 <<<"Success: no issues found in 3 source files"

  [ "$status" -eq 1 ]
  [[ "$output" == *"mypy checked 3 files"* ]]
  [[ "$output" == *"looked in the wrong place"* ]]
}

@test "counts one file in the singular" {
  run check_report 0 <<<"Success: no issues found in 1 source file"

  [ "$status" -eq 1 ]
  [[ "$output" == *"mypy checked 1 files"* ]]
}

@test "fails when the report does not say how many files were checked" {
  # What a broken config looks like: mypy stops before checking anything.
  run check_report 2 <<<'pyproject.toml:1: error: Error importing plugin "sqlalchemy.ext.mypy.plugin": No module named '"'"'sqlalchemy.ext.mypy'"'"'  [misc]'

  [ "$status" -eq 1 ]
  [[ "$output" == *"did not say how many files"* ]]
  [[ "$output" == *"Error importing plugin"* ]]
}

@test "fails on an empty report" {
  run check_report 0 <<<""

  [ "$status" -eq 1 ]
  [[ "$output" == *"did not say how many files"* ]]
}

@test "fails when mypy found a type error, and shows its report" {
  run check_report 1 <<<'app/main.py:12: error: Function is missing a return type annotation  [no-untyped-def]
Found 1 error in 1 file (checked 156 source files)'

  [ "$status" -eq 1 ]
  [[ "$output" == *"app/main.py:12: error: Function is missing a return type annotation"* ]]
  [[ "$output" == *"mypy found type errors in 156 files, with strict on"* ]]
}

@test "reads the count from a report with errors" {
  run files_checked <<<'Found 12 errors in 4 files (checked 156 source files)'

  [ "$output" = "156" ]
}

@test "reads the count from a clean report" {
  run files_checked <<<'Success: no issues found in 156 source files'

  [ "$output" = "156" ]
}
