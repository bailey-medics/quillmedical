#!/usr/bin/env bats
# Tests for set-ci-speed.sh
#
# gh is stubbed onto PATH. The stub keeps the variables as files in a
# directory, so `get`, `set` and `delete` behave as the real ones do,
# including failing on a variable that is not set.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/set-ci-speed.sh"
  STUBS="${BATS_TEST_TMPDIR}/stubs"
  VARS="${BATS_TEST_TMPDIR}/vars"
  mkdir -p "$STUBS" "$VARS"

  cat > "${STUBS}/gh" <<EOF
#!/usr/bin/env bash
[ "\$1" = "variable" ] || exit 64
case "\$2" in
  get)    [ -f "${VARS}/\$3" ] && cat "${VARS}/\$3" ;;
  set)    echo "\$5" > "${VARS}/\$3" ;;
  delete) [ -f "${VARS}/\$3" ] && rm "${VARS}/\$3" ;;
  *)      exit 64 ;;
esac
EOF

  chmod +x "${STUBS}/gh"
  PATH="${STUBS}:${PATH}"
}

@test "level 1 moves every job to the eight core runner" {
  run bash "$SCRIPT" 1

  [ "$status" -eq 0 ]
  [ "$(cat "${VARS}/CI_RUNNER_PYTHON_UNIT")" = "ubuntu-24.04-8core" ]
  [ "$(cat "${VARS}/CI_RUNNER_FRONTEND_UNIT")" = "ubuntu-24.04-8core" ]
  [ "$(cat "${VARS}/CI_RUNNER_STORYBOOK")" = "ubuntu-24.04-8core" ]
  [ "$(cat "${VARS}/CI_RUNNER_E2E_BUILD")" = "ubuntu-24.04-8core" ]
  [ "$(cat "${VARS}/CI_RUNNER_E2E")" = "ubuntu-24.04-8core" ]
}

@test "level 2 names the sixteen core runner" {
  run bash "$SCRIPT" 2

  [ "$status" -eq 0 ]
  [ "$(cat "${VARS}/CI_RUNNER_STORYBOOK")" = "ubuntu-24.04-16core" ]
}

@test "a level that costs money says so" {
  run bash "$SCRIPT" 1 storybook

  [ "$status" -eq 0 ]
  [[ "$output" == *"billed per minute"* ]]
}

@test "naming a job changes that job alone" {
  run bash "$SCRIPT" 1 storybook

  [ "$status" -eq 0 ]
  [ "$(cat "${VARS}/CI_RUNNER_STORYBOOK")" = "ubuntu-24.04-8core" ]
  [ ! -f "${VARS}/CI_RUNNER_PYTHON_UNIT" ]
  [ ! -f "${VARS}/CI_RUNNER_E2E" ]
}

@test "level 0 clears every variable, back to the free runner" {
  bash "$SCRIPT" 2

  run bash "$SCRIPT" 0

  [ "$status" -eq 0 ]
  [ -z "$(ls "$VARS")" ]
}

@test "level 0 succeeds when nothing was set" {
  run bash "$SCRIPT" 0

  [ "$status" -eq 0 ]
  [ -z "$(ls "$VARS")" ]
}

@test "level 0 for one job leaves the others set" {
  bash "$SCRIPT" 1

  run bash "$SCRIPT" 0 e2e

  [ "$status" -eq 0 ]
  [ ! -f "${VARS}/CI_RUNNER_E2E" ]
  [ "$(cat "${VARS}/CI_RUNNER_E2E_BUILD")" = "ubuntu-24.04-8core" ]
}

@test "show lists each job, set or free" {
  bash "$SCRIPT" 1 frontend-unit

  run bash "$SCRIPT" show

  [ "$status" -eq 0 ]
  [[ "$output" == *"frontend-unit: ubuntu-24.04-8core"* ]]
  [[ "$output" == *"python-unit: ubuntu-24.04 (free)"* ]]
}

@test "show changes nothing" {
  run bash "$SCRIPT" show

  [ "$status" -eq 0 ]
  [ -z "$(ls "$VARS")" ]
}

@test "an unknown job is refused, and nothing is set" {
  run bash "$SCRIPT" 1 everything

  [ "$status" -eq 1 ]
  [[ "$output" == *"Unknown job 'everything'"* ]]
  [ -z "$(ls "$VARS")" ]
}

@test "an unknown level is refused, and nothing is set" {
  run bash "$SCRIPT" 3

  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage"* ]]
  [ -z "$(ls "$VARS")" ]
}

@test "no level is refused" {
  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage"* ]]
}
