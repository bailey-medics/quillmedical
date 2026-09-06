#!/usr/bin/env bats
# Tests for create-pr.sh
#
# gh is stubbed and its invocations recorded, because what matters here is the
# arguments the script asks gh for — not that gh itself works. The stub returns
# a scripted sequence of `gh pr list` counts so the concurrent-creation race can
# be exercised.

# `run !` needs this declared, or bats runs in a compatibility mode where flags
# on `run` are not honoured and the negation silently passes.
bats_require_minimum_version 1.5.0

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/create-pr.sh"
  CALLS="${BATS_TEST_TMPDIR}/gh-create-args"
  LIST_RESULTS="${BATS_TEST_TMPDIR}/gh-list-results"
  LIST_COUNTER="${BATS_TEST_TMPDIR}/gh-list-counter"

  : > "$CALLS"
  : > "$LIST_COUNTER"
  set_list_results 0

  STUB_DIR="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "$STUB_DIR"

  # `gh pr list` returns the next scripted count; `gh pr create` records every
  # argument on its own line, so a body containing spaces stays intact.
  cat > "${STUB_DIR}/gh" <<EOF
#!/usr/bin/env bash
if [ "\$2" = "list" ]; then
  call=\$(cat "${LIST_COUNTER}" 2>/dev/null || echo 0)
  call=\$((call + 1))
  echo "\$call" > "${LIST_COUNTER}"
  sed -n "\${call}p" "${LIST_RESULTS}"
  exit 0
fi

printf '%s\n' "\$@" >> "${CALLS}"
exit "\$(cat "${BATS_TEST_TMPDIR}/gh-create-status")"
EOF
  chmod +x "${STUB_DIR}/gh"
  PATH="${STUB_DIR}:${PATH}"

  set_create_status 0
}

# Each argument is the count `gh pr list` returns on successive calls.
set_list_results() {
  printf '%s\n' "$@" > "$LIST_RESULTS"
  : > "$LIST_COUNTER"
}

set_create_status() {
  echo "$1" > "${BATS_TEST_TMPDIR}/gh-create-status"
}

# The value gh was given for a named flag, e.g. arg_after --title.
arg_after() {
  local flag="$1"

  grep -A1 -x -- "$flag" "$CALLS" | sed -n '2p'
}

# The value gh was given for --body, which spans several lines. Recording puts
# one argument per line, so the body runs from just after --body up to the next
# flag gh was passed.
body_arg() {
  awk '
    $0 == "--body" { collecting = 1; next }
    collecting && /^--/ { collecting = 0 }
    collecting { print }
  ' "$CALLS"
}

@test "fails without a branch name argument" {
  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No branch name provided"* ]]
}

@test "skips when a pull request already exists for the branch" {
  set_list_results 1

  run bash "$SCRIPT" feature/already-open

  [ "$status" -eq 0 ]
  [[ "$output" == *"Pull request already exists"* ]]
  [ ! -s "$CALLS" ]
}

@test "creates a draft pull request against main" {
  run bash "$SCRIPT" feature/add-login

  [ "$status" -eq 0 ]
  [ "$(arg_after --title)" = "Feature: Add login" ]
  [ "$(arg_after --base)" = "main" ]
  [ "$(arg_after --head)" = "feature/add-login" ]
  grep -qx -- "--draft" "$CALLS"
}

# The title is built with substring expansion rather than bash 4's `${var^}`,
# so the cases that expansion has to get right are worth pinning: more than one
# hyphen, and nothing at all after the slash.
@test "capitalises only the first word of a multi-word branch name" {
  run bash "$SCRIPT" feature/add-cover-image

  [ "$status" -eq 0 ]
  [ "$(arg_after --title)" = "Feature: Add cover image" ]
}

@test "does not fail when the branch has nothing after the prefix" {
  run bash "$SCRIPT" feature/

  [ "$status" -eq 0 ]
  [ "$(arg_after --title)" = "Feature: " ]
}

@test "uses the placeholder body" {
  run bash "$SCRIPT" feature/add-login

  [ "$status" -eq 0 ]

  body="$(body_arg)"
  [[ "$body" == *"**Placeholder for the PR description**"* ]]
  [[ "$body" == *"VSCode Copilot or Claude Code"* ]]
  [[ "$body" == *"/crp final"* ]]
}

@test "ignores a pull request template in the working directory" {
  # The body was once read from .github/pull_request_template.md, a file this
  # repository does not have. Nothing should reintroduce that dependency.
  cd "$BATS_TEST_TMPDIR"
  mkdir -p .github
  echo "TEMPLATE CONTENT" > .github/pull_request_template.md

  run bash "$SCRIPT" feature/add-login

  [ "$status" -eq 0 ]
  [[ "$(body_arg)" == *"**Placeholder for the PR description**"* ]]
  run ! grep -q "TEMPLATE CONTENT" "$CALLS"
}

@test "exits cleanly when a concurrent run created the pull request" {
  set_list_results 0 1
  set_create_status 1

  run bash "$SCRIPT" feature/racing

  [ "$status" -eq 0 ]
  [[ "$output" == *"created by a concurrent run"* ]]
}

@test "fails when creation fails and no pull request appeared" {
  set_list_results 0 0
  set_create_status 1

  run bash "$SCRIPT" feature/broken

  [ "$status" -eq 1 ]
  [[ "$output" == *"Failed to create pull request"* ]]
}
