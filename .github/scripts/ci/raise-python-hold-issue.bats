#!/usr/bin/env bats
# Tests for raise-python-hold-issue.sh
#
# As for the TypeScript hold, the behaviour that matters is not opening the
# issue but not opening it twice, and giving each minor its own.

# shellcheck disable=SC2329,SC2030,SC2031

setup() {
  source "${BATS_TEST_DIRNAME}/raise-python-hold-issue.sh"

  STUB_DIR="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "$STUB_DIR"
  PATH="$STUB_DIR:$PATH"
  export PATH

  GH_LOG="${BATS_TEST_TMPDIR}/gh.log"
  export GH_LOG

  export REPORT="Every compiled backend dependency now ships a wheel for Python 3.15."
  export MINOR="3.15"
}

# Puts a `gh` on PATH that logs its arguments and answers `gh issue list`
# with the given JSON.
stub_gh() {
  local list_json="$1"
  local status="${2:-0}"

  cat >"$STUB_DIR/gh" <<STUB
#!/usr/bin/env bash
echo "\$@" >>"\$GH_LOG"
if [ "\$2" = "list" ]; then
  printf '%s' '${list_json}'
fi
exit ${status}
STUB
  chmod +x "$STUB_DIR/gh"
}

@test "errors when there is no report to raise" {
  stub_gh "[]"
  unset REPORT

  run main

  [ "$status" -eq 1 ]
  [[ "$output" == *"REPORT is empty"* ]]
}

@test "errors when there is no minor to name it by" {
  stub_gh "[]"
  unset MINOR

  run main

  [ "$status" -eq 1 ]
  [[ "$output" == *"MINOR is empty"* ]]
}

@test "errors when the issue search fails" {
  stub_gh "" 1

  run main

  [ "$status" -eq 1 ]
  [[ "$output" == *"Could not search existing issues"* ]]
}

@test "opens an issue named for the minor when none is open" {
  stub_gh "[]"

  run main

  [ "$status" -eq 0 ]
  [[ "$output" == *"Opened an issue"* ]]
  run cat "$GH_LOG"
  [[ "$output" == *"issue create"* ]]
  [[ "$output" == *"Python 3.15 hold can be lifted"* ]]
}

@test "does not open a second issue when one is already open" {
  stub_gh '[{"number":42,"title":"Python 3.15 hold can be lifted: every compiled dependency has a wheel"}]'

  run main

  [ "$status" -eq 0 ]
  [[ "$output" == *"#42 is already open"* ]]
  run cat "$GH_LOG"
  [[ "$output" != *"issue create"* ]]
}

@test "opens a new issue when the open one is for an earlier minor" {
  stub_gh '[{"number":42,"title":"Python 3.15 hold can be lifted: every compiled dependency has a wheel"}]'
  export MINOR="3.16"

  run main

  [ "$status" -eq 0 ]
  run cat "$GH_LOG"
  [[ "$output" == *"issue create"* ]]
}

@test "the body carries the report and the steps to take" {
  run issue_body "$REPORT" 3.15

  [ "$status" -eq 0 ]
  [[ "$output" == *"wheel for Python 3.15"* ]]
  [[ "$output" == *"Pending Approval"* ]]
  [[ "$output" == *"installs Python 3.15"* ]]
  [[ "$output" == *"just vr"* ]]
}
