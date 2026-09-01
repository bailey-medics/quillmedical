#!/usr/bin/env bats
# Tests for check-rulesets.sh
#
# gh is stubbed to return a ruleset count, since the behaviour under test is
# what the script does with that number rather than how GitHub reports it.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/check-rulesets.sh"
  STUB_DIR="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "$STUB_DIR"
}

stub_gh_returning() {
  cat > "${STUB_DIR}/gh" <<EOF
#!/usr/bin/env bash
echo "$1"
EOF

  chmod +x "${STUB_DIR}/gh"
  PATH="${STUB_DIR}:${PATH}"
}

@test "fails without a repository argument" {
  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No repository provided"* ]]
}

@test "fails when the repo has no rulesets" {
  stub_gh_returning 0

  run bash "$SCRIPT" owner/repo

  [ "$status" -eq 1 ]
  [[ "$output" == *"No branch protection rulesets found"* ]]
}

@test "the failure points at where rulesets are defined" {
  stub_gh_returning 0

  run bash "$SCRIPT" owner/repo
  [[ "$output" == *"quillmedical/infra/github/"* ]]
}

@test "passes when rulesets exist" {
  stub_gh_returning 2

  run bash "$SCRIPT" owner/repo

  [ "$status" -eq 0 ]
  [[ "$output" == *"Found 2 active ruleset(s)"* ]]
}

@test "a single ruleset is enough" {
  stub_gh_returning 1

  run bash "$SCRIPT" owner/repo
  [ "$status" -eq 0 ]
}
