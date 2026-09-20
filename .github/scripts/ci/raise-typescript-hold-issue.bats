#!/usr/bin/env bats
# Tests for raise-typescript-hold-issue.sh
#
# The behaviour that matters is not opening the issue — it is not opening it
# twice. The check runs monthly and a liftable hold stays liftable, so a
# script that created an issue each time would bury the signal it exists to
# send.

# shellcheck disable=SC2329,SC2030,SC2031

setup() {
  source "${BATS_TEST_DIRNAME}/raise-typescript-hold-issue.sh"

  STUB_DIR="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "$STUB_DIR"
  PATH="$STUB_DIR:$PATH"
  export PATH

  GH_LOG="${BATS_TEST_TMPDIR}/gh.log"
  export GH_LOG

  export REPORT="typescript-eslint now allows TypeScript 7."
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

@test "errors when the issue search fails" {
  stub_gh "" 1

  run main

  [ "$status" -eq 1 ]
  [[ "$output" == *"Could not search existing issues"* ]]
}

@test "opens an issue when none is open" {
  stub_gh "[]"

  run main

  [ "$status" -eq 0 ]
  [[ "$output" == *"Opened an issue"* ]]
  run cat "$GH_LOG"
  [[ "$output" == *"issue create"* ]]
}

@test "does not open a second issue when one is already open" {
  stub_gh '[{"number":42,"title":"TypeScript hold can be lifted: typescript-eslint now supports TS 7"}]'

  run main

  [ "$status" -eq 0 ]
  [[ "$output" == *"#42 is already open"* ]]
  run cat "$GH_LOG"
  [[ "$output" != *"issue create"* ]]
}

@test "ignores an open issue whose title only loosely matches" {
  # gh --search is a loose match, so a near-miss must not suppress the real
  # issue. Exact-title comparison is what prevents that.
  stub_gh '[{"number":7,"title":"TypeScript hold can be lifted eventually"}]'

  run main

  [ "$status" -eq 0 ]
  run cat "$GH_LOG"
  [[ "$output" == *"issue create"* ]]
}

@test "honours a custom title for both search and create" {
  stub_gh "[]"
  export ISSUE_TITLE="Custom hold title"

  run main

  [ "$status" -eq 0 ]
  run cat "$GH_LOG"
  [[ "$output" == *"Custom hold title"* ]]
}

@test "the body carries the report and the steps to take" {
  run issue_body "typescript-eslint now allows TypeScript 7."

  [ "$status" -eq 0 ]
  [[ "$output" == *"now allows TypeScript 7"* ]]
  [[ "$output" == *"Pending Approval"* ]]
  [[ "$output" == *"dependencyDashboardApproval"* ]]
}
