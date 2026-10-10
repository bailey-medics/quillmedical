#!/usr/bin/env bats
# Tests for run-gitleaks.sh
#
# gitleaks is stubbed onto PATH, so the suite needs no gitleaks. The stub
# records what it was asked and answers as the test tells it: whether the
# planted key was reported, and whether the commits came up clean. What
# the real rules find is what the CI job finds out.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/run-gitleaks.sh"
  REPO="${BATS_TEST_TMPDIR}/repo"
  STUBS="${BATS_TEST_TMPDIR}/stubs"
  CALLS="${BATS_TEST_TMPDIR}/calls"
  mkdir -p "$REPO" "$STUBS" "$CALLS"

  git init -q -b main "$REPO"
  git -C "$REPO" -c user.name=t -c user.email=t@example.com \
    commit -q --allow-empty -m "base"
  git -C "$REPO" switch -q -c feature/x
  git -C "$REPO" -c user.name=t -c user.email=t@example.com \
    commit -q --allow-empty -m "one"
  git -C "$REPO" -c user.name=t -c user.email=t@example.com \
    commit -q --allow-empty -m "two"
  echo 'title = "t"' > "${REPO}/.gitleaks.toml"

  # `gitleaks dir` is the planted key, `gitleaks git` the real scan.
  # Exit 1 is how gitleaks says it found something.
  cat > "${STUBS}/gitleaks" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "${CALLS}/gitleaks.args"

if [ "\$1" = "dir" ]; then
  # Keep what was planted, to check it looked like a key.
  cp "\${@: -1}/settings.ini" "${CALLS}/canary" 2>/dev/null || true
  exit "\${CANARY_EXIT:-1}"
fi

exit "\${SCAN_EXIT:-0}"
EOF
  chmod +x "${STUBS}/gitleaks"
  PATH="${STUBS}:${PATH}"

  cd "$REPO" || return
}

@test "passes when the planted key is reported and the commits are clean" {
  run bash "$SCRIPT" main

  [ "$status" -eq 0 ]
  [[ "$output" == *"its rules are firing"* ]]
  [[ "$output" == *"No secrets found in 2 commit(s)"* ]]
}

@test "fails without scanning when the planted key is not reported" {
  # What the config did for months: no rules, so nothing was ever found.
  CANARY_EXIT=0 run bash "$SCRIPT" main

  [ "$status" -eq 1 ]
  [[ "$output" == *"did not report a planted key"* ]]
  [[ "$output" == *"Nothing was scanned"* ]]
  [ "$(grep -c '^git ' "${CALLS}/gitleaks.args")" -eq 0 ]
}

@test "fails when the commits hold something that looks like a secret" {
  SCAN_EXIT=1 run bash "$SCRIPT" main

  [ "$status" -eq 1 ]
  [[ "$output" == *"looks like a secret"* ]]
  [[ "$output" == *"rotate it"* ]]
}

@test "plants something shaped like an AWS access key" {
  run bash "$SCRIPT" main

  # cspell:disable-next-line
  [[ "$(cat "${CALLS}/canary")" =~ AKIA[A-Z2-7]{16} ]]
}

@test "leaves the planted key nowhere in the checkout" {
  run bash "$SCRIPT" main

  [ -z "$(git status --short --untracked-files=all | grep -v gitleaks.toml)" ]
}

@test "scans the commits the branch adds, with this repository's rules" {
  run bash "$SCRIPT" main

  local scan=""
  scan="$(grep '^git ' "${CALLS}/gitleaks.args")"

  [[ "$scan" == *"--config .gitleaks.toml"* ]]
  [[ "$scan" == *"--log-opts=main..HEAD"* ]]
  [[ "$scan" == *"--redact"* ]]
}

@test "checks the planted key with this repository's rules too" {
  run bash "$SCRIPT" main

  [[ "$(grep '^dir ' "${CALLS}/gitleaks.args")" == *"--config .gitleaks.toml"* ]]
}

@test "fails without a base ref" {
  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No base ref given"* ]]
}

@test "fails when the base ref is not in the checkout" {
  # A shallow checkout has no origin/main to measure against.
  run bash "$SCRIPT" origin/nowhere

  [ "$status" -eq 1 ]
  [[ "$output" == *"fetch-depth: 0"* ]]
  [ ! -f "${CALLS}/gitleaks.args" ]
}

@test "fails when the config file is missing" {
  rm .gitleaks.toml

  run bash "$SCRIPT" main

  [ "$status" -eq 1 ]
  [[ "$output" == *".gitleaks.toml is not there"* ]]
}
