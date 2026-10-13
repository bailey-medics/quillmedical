#!/usr/bin/env bats
# Tests for label-pr.sh
#
# `gh` is a stub on PATH. It records every call, answers `gh pr list` with
# the number in $PR_NUMBER, and fails `gh label create` when
# $LABEL_EXISTS is set, as GitHub does for a label that is already there.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/label-pr.sh"
  STUB="${BATS_TEST_TMPDIR}/bin"
  export CALLS="${BATS_TEST_TMPDIR}/calls"
  mkdir -p "$STUB"
  : > "$CALLS"

  cat > "${STUB}/gh" <<'GH'
#!/usr/bin/env bash
echo "$*" >> "$CALLS"
case "$1 $2" in
  "pr list") echo "${PR_NUMBER:-}" ;;
  "label create") [ -z "${LABEL_EXISTS:-}" ] || exit 1 ;;
esac
GH
  chmod +x "${STUB}/gh"
  PATH="${STUB}:${PATH}"
}

@test "a feature branch's pull request is labelled Feature" {
  PR_NUMBER=42 run bash "$SCRIPT" feature/add-a-thing

  [ "$status" -eq 0 ]
  grep -q "^pr edit 42 --add-label Feature$" "$CALLS"
  [[ "$output" == *"Added label 'Feature' to pull request #42"* ]]
}

@test "a hotfix branch's pull request is labelled Hotfix" {
  PR_NUMBER=7 run bash "$SCRIPT" hotfix/sec-patch

  [ "$status" -eq 0 ]
  grep -q "^pr edit 7 --add-label Hotfix$" "$CALLS"
}

@test "it looks for the open pull request of that branch" {
  PR_NUMBER=42 run bash "$SCRIPT" feature/add-a-thing

  grep -q "^pr list --head feature/add-a-thing --state open " "$CALLS"
}

@test "the label is made first, in case it is not there yet" {
  PR_NUMBER=42 run bash "$SCRIPT" feature/add-a-thing

  [ "$(sed -n 2p "$CALLS" | cut -d' ' -f1-3)" = "label create Feature" ]
  [ "$(sed -n 3p "$CALLS" | cut -d' ' -f1-2)" = "pr edit" ]
}

@test "a label that already exists does not stop the pull request being labelled" {
  PR_NUMBER=42 LABEL_EXISTS=1 run bash "$SCRIPT" feature/add-a-thing

  [ "$status" -eq 0 ]
  grep -q "^pr edit 42 --add-label Feature$" "$CALLS"
}

@test "a branch with any other prefix is left alone, and GitHub is not asked" {
  PR_NUMBER=42 run bash "$SCRIPT" renovate/all-minor

  [ "$status" -eq 0 ]
  [[ "$output" == *"No label defined"* ]]
  [ ! -s "$CALLS" ]
}

@test "a branch with no open pull request is skipped, not failed" {
  PR_NUMBER="" run bash "$SCRIPT" feature/add-a-thing

  [ "$status" -eq 0 ]
  [[ "$output" == *"No open pull request found"* ]]
  [ "$(grep -c "^pr edit" "$CALLS")" = "0" ]
  [ "$(grep -c "^label create" "$CALLS")" = "0" ]
}

@test "fails with no branch given" {
  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No branch name provided"* ]]
  [ ! -s "$CALLS" ]
}
