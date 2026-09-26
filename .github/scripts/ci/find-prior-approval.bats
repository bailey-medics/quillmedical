#!/usr/bin/env bats
# Tests for find-prior-approval.sh.
#
# `gh` is stubbed. Each test describes the earlier runs GitHub would report:
# their approvals and the fingerprint artifact each recorded. What is checked
# is the decision: an earlier approval counts only when a person approved the
# right environment for this same change.

# shellcheck disable=SC2329,SC2030,SC2031

setup() {
  source "${BATS_TEST_DIRNAME}/find-prior-approval.sh"

  export GH_TOKEN="fake"
  export GITHUB_REPOSITORY="owner/repo"
  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/github_output"
  : >"$GITHUB_OUTPUT"

  FIXTURES="${BATS_TEST_TMPDIR}/fixtures"
  mkdir -p "$FIXTURES"
  export FIXTURES

  STUB_DIR="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "$STUB_DIR"
  # The stub answers from $FIXTURES: runs.json for the run list,
  # approvals-<id>.json for each run's approvals, and fingerprint-<id>.txt for
  # each run's artifact. A missing file behaves like GitHub having nothing.
  cat >"${STUB_DIR}/gh" <<'STUB'
#!/usr/bin/env bash
if [ "$1" = "api" ]; then
  case "$2" in
    */actions/workflows/*/runs*) cat "$FIXTURES/runs.json" ;;
    */actions/runs/*/approvals)
      id="${2%/approvals}"; id="${id##*/}"
      cat "$FIXTURES/approvals-${id}.json" 2>/dev/null || echo '[]' ;;
  esac
  exit 0
fi
if [ "$1" = "run" ] && [ "$2" = "download" ]; then
  run_id="$3"; dir=""
  shift 3
  while [ $# -gt 0 ]; do
    [ "$1" = "--dir" ] && dir="$2"
    shift
  done
  [ -f "$FIXTURES/fingerprint-${run_id}.txt" ] || exit 1
  cp "$FIXTURES/fingerprint-${run_id}.txt" "$dir/fingerprint.txt"
  exit 0
fi
exit 1
STUB
  chmod +x "${STUB_DIR}/gh"
  PATH="${STUB_DIR}:${PATH}"
}

ENV_NAME="api-breaking-change-review"
ARGS=(42 feature/x gate-breaking.yml "$ENV_NAME" api-change-fingerprint abc123 999)

runs() {
  # Each argument is "<run-id>:<created-at>", all for PR 42
  local items=()
  local entry
  for entry in "$@"; do
    items+=("{\"id\": ${entry%%:*}, \"created_at\": \"${entry#*:}\", \"pull_requests\": [{\"number\": 42}]}")
  done
  local joined
  joined="$(IFS=,; echo "${items[*]}")"
  echo "{\"workflow_runs\": [${joined}]}" >"$FIXTURES/runs.json"
}

approved_by() {
  # approved_by <run-id> <login> <user-type> <environment>
  cat >"$FIXTURES/approvals-$1.json" <<JSON
[{"state": "approved", "user": {"login": "$2", "type": "$3"}, "environments": [{"name": "$4"}]}]
JSON
}

@test "an earlier human approval of the same change is found" {
  runs "101:2026-09-25T10:00:00Z"
  approved_by 101 markbailey User "$ENV_NAME"
  echo abc123 >"$FIXTURES/fingerprint-101.txt"

  run main "${ARGS[@]}"

  [ "$status" -eq 0 ]
  grep -q '^approved=true$' "$GITHUB_OUTPUT"
  grep -q '^approved_by=markbailey$' "$GITHUB_OUTPUT"
  grep -q '^approved_run=101$' "$GITHUB_OUTPUT"
}

@test "an approval of a different change does not count" {
  runs "101:2026-09-25T10:00:00Z"
  approved_by 101 markbailey User "$ENV_NAME"
  echo different >"$FIXTURES/fingerprint-101.txt"

  run main "${ARGS[@]}"

  [ "$status" -eq 0 ]
  grep -q '^approved=false$' "$GITHUB_OUTPUT"
}

@test "an approval of the other gate's environment does not count" {
  runs "101:2026-09-25T10:00:00Z"
  approved_by 101 markbailey User db-destructive-migration-review
  echo abc123 >"$FIXTURES/fingerprint-101.txt"

  run main "${ARGS[@]}"

  grep -q '^approved=false$' "$GITHUB_OUTPUT"
}

@test "a bot's approval does not count" {
  runs "101:2026-09-25T10:00:00Z"
  approved_by 101 "github-actions[bot]" Bot "$ENV_NAME"
  echo abc123 >"$FIXTURES/fingerprint-101.txt"

  run main "${ARGS[@]}"

  grep -q '^approved=false$' "$GITHUB_OUTPUT"
}

@test "a run nobody approved does not count, however its change matches" {
  runs "101:2026-09-25T10:00:00Z"
  echo abc123 >"$FIXTURES/fingerprint-101.txt"

  run main "${ARGS[@]}"

  grep -q '^approved=false$' "$GITHUB_OUTPUT"
}

@test "a run whose fingerprint cannot be read does not count" {
  # An expired artifact: the approval exists, the evidence of what it covered
  # does not, so ask again.
  runs "101:2026-09-25T10:00:00Z"
  approved_by 101 markbailey User "$ENV_NAME"

  run main "${ARGS[@]}"

  grep -q '^approved=false$' "$GITHUB_OUTPUT"
}

@test "the current run is never counted as its own earlier approval" {
  runs "999:2026-09-25T10:00:00Z"
  approved_by 999 markbailey User "$ENV_NAME"
  echo abc123 >"$FIXTURES/fingerprint-999.txt"

  run main "${ARGS[@]}"

  grep -q '^approved=false$' "$GITHUB_OUTPUT"
}

@test "an older matching approval is found behind a newer unapproved run" {
  runs "102:2026-09-25T11:00:00Z" "101:2026-09-25T10:00:00Z"
  approved_by 101 markbailey User "$ENV_NAME"
  echo abc123 >"$FIXTURES/fingerprint-101.txt"
  echo abc123 >"$FIXTURES/fingerprint-102.txt"

  run main "${ARGS[@]}"

  grep -q '^approved_run=101$' "$GITHUB_OUTPUT"
}

@test "an empty change is never matched" {
  runs "101:2026-09-25T10:00:00Z"
  approved_by 101 markbailey User "$ENV_NAME"
  echo empty >"$FIXTURES/fingerprint-101.txt"

  run main 42 feature/x gate-breaking.yml "$ENV_NAME" api-change-fingerprint empty 999

  grep -q '^approved=false$' "$GITHUB_OUTPUT"
}

@test "refuses to run without all seven arguments" {
  run main 42 feature/x

  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage"* ]]
}
