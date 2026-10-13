#!/usr/bin/env bats
# Tests for run-bandit.sh
#
# Against reports written here, so the suite needs no Bandit. What the
# real scan finds is what the pre-commit hook finds out.

setup() {
  source "${BATS_TEST_DIRNAME}/run-bandit.sh"
}

clean_report() {
  local lines_read="$1"

  cat <<REPORT
Run metrics:
	Total issues (by severity):
		Undefined: 0
	Total lines of code: $lines_read
	Total lines skipped (#nosec): 0
REPORT
}

@test "passes a scan of the whole backend that found nothing" {
  run check_report 0 <<<"$(clean_report 45782)"

  [ "$status" -eq 0 ]
  [[ "$output" == *"Bandit scanned 45782 lines and found nothing"* ]]
}

@test "fails a scan that covered no lines, though Bandit passed it" {
  # What the hook did for a year: "r" for "-r", so no file was opened.
  run check_report 0 <<<"$(clean_report 0)"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Bandit scanned 0 lines"* ]]
  [[ "$output" == *"looked in the wrong place"* ]]
}

@test "fails a scan that covered only a corner of the backend" {
  run check_report 0 <<<"$(clean_report 312)"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Bandit scanned 312 lines"* ]]
}

@test "fails when the report does not say how many lines were scanned" {
  run check_report 0 <<<"bandit: command not found"

  [ "$status" -eq 1 ]
  [[ "$output" == *"did not say how many lines"* ]]
  [[ "$output" == *"bandit: command not found"* ]]
}

@test "fails when Bandit found an issue, and shows its report" {
  run check_report 1 <<<">> Issue: [B113:request_without_timeout] Call to requests without timeout
   Location: backend/app/ehrbase_client.py:91:15
$(clean_report 45782)"

  [ "$status" -eq 1 ]
  [[ "$output" == *"B113:request_without_timeout"* ]]
  [[ "$output" == *"Bandit found issues in 45782 lines"* ]]
}

@test "reads the line count out of a report" {
  run lines_scanned <<<"$(clean_report 45782)"

  [ "$output" = "45782" ]
}

@test "leaves out the tests, the fixtures and the merged migrations" {
  [[ "$EXCLUDE" == *"backend/tests"* ]]
  [[ "$EXCLUDE" == *"backend/conftest.py"* ]]
  [[ "$EXCLUDE" == *"*_test.py"* ]]
  [[ "$EXCLUDE" == *"backend/alembic/versions"* ]]
}

# A report of a scan that covered the backend and left files out.
report_with_skipped_files() {
  cat <<REPORT
Run metrics:
	Total issues (by severity):
		Undefined: 0
	Total lines of code: 52483
	Total lines skipped (#nosec): 0
Files skipped (2):
	backend/app/deps.py (syntax error while parsing AST from file)
	backend/app/security.py (syntax error while parsing AST from file)
REPORT
}

@test "fails a scan that could not read some files, though Bandit passed it" {
  # What an older Python does with code written for a newer one: Bandit
  # leaves the file out and passes, well above the line floor.
  run check_report 0 <<<"$(report_with_skipped_files)"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Bandit could not read 2 files"* ]]
  [[ "$output" == *"backend/app/security.py (syntax error while parsing AST from file)"* ]]
}

@test "passes a scan that says it skipped no files" {
  run check_report 0 <<<"$(clean_report 45782)
Files skipped (0):"

  [ "$status" -eq 0 ]
  [[ "$output" == *"found nothing"* ]]
}

@test "reads the number of skipped files out of a report" {
  run files_skipped <<<"$(report_with_skipped_files)"

  [ "$output" = "2" ]
}
