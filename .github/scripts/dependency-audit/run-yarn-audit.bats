#!/usr/bin/env bats
# Tests for run-yarn-audit.sh
#
# With a stand-in for Yarn on PATH, so nothing is asked of the registry.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/run-yarn-audit.sh"
  source "$SCRIPT"

  FOLDER="${BATS_TEST_TMPDIR}/frontend"
  CALLS="${BATS_TEST_TMPDIR}/calls"
  mkdir -p "$FOLDER" "$CALLS" "${BATS_TEST_TMPDIR}/bin"
  : > "${FOLDER}/yarn.lock"

  ADVISORY='{"value":"some-package","children":{"ID":1,"Issue":"Something is wrong","URL":"https://github.com/advisories/GHSA-aaaa","Severity":"high","Vulnerable Versions":"<2.0.0","Tree Versions":["1.9.0"],"Dependents":["other@npm:1.0.0"]}}'
}

# Puts a yarn on PATH that records where and how it was called, prints
# what it was given and exits as told.
stub_yarn() {
  local exit_code="$1"
  local output="$2"

  printf '%s' "$output" > "${CALLS}/yarn.out"

  cat > "${BATS_TEST_TMPDIR}/bin/yarn" <<STUB
#!/usr/bin/env bash
pwd -P > "${CALLS}/yarn.cwd"
echo "\$*" > "${CALLS}/yarn.args"
cat "${CALLS}/yarn.out"
exit ${exit_code}
STUB
  chmod +x "${BATS_TEST_TMPDIR}/bin/yarn"
  PATH="${BATS_TEST_TMPDIR}/bin:${PATH}"
}

@test "passes when Yarn reports no advisory" {
  run check_report 0 <<<""

  [ "$status" -eq 0 ]
  [[ "$output" == *"found no advisory"* ]]
}

@test "fails on an advisory, and says the package, its version and the address" {
  run check_report 1 <<<"$ADVISORY"

  [ "$status" -eq 1 ]
  [[ "$output" == *"high some-package 1.9.0: Something is wrong https://github.com/advisories/GHSA-aaaa"* ]]
  [[ "$output" == *"1 advisories against packages the frontend ships"* ]]
}

@test "fails on an advisory even if Yarn exited 0" {
  run check_report 0 <<<"$ADVISORY"

  [ "$status" -eq 1 ]
}

@test "counts each advisory" {
  run check_report 1 <<<"$(printf '%s\n%s\n' "$ADVISORY" "$ADVISORY")"

  [ "$status" -eq 1 ]
  [[ "$output" == *"2 advisories"* ]]
}

@test "fails when Yarn failed without naming an advisory" {
  # The registry being out of reach must not read as a clean audit.
  run check_report 1 <<<"YN0035: The remote server failed to provide the requested resource"

  [ "$status" -eq 1 ]
  [[ "$output" == *"failed without naming an advisory"* ]]
  [[ "$output" == *"YN0035"* ]]
}

@test "audits inside the folder, what ships only, without deprecations" {
  stub_yarn 0 ""

  run bash "$SCRIPT" "$FOLDER"

  [ "$status" -eq 0 ]
  [ "$(cat "${CALLS}/yarn.cwd")" = "$(cd -P "$FOLDER" && pwd)" ]
  [[ "$(cat "${CALLS}/yarn.args")" == "npm audit"* ]]
  [[ "$(cat "${CALLS}/yarn.args")" == *"--all"* ]]
  [[ "$(cat "${CALLS}/yarn.args")" == *"--recursive"* ]]
  [[ "$(cat "${CALLS}/yarn.args")" == *"--environment production"* ]]
  [[ "$(cat "${CALLS}/yarn.args")" == *"--no-deprecations"* ]]
  [[ "$(cat "${CALLS}/yarn.args")" == *"--json"* ]]
}

@test "fails end to end when Yarn exits 1 with an advisory" {
  stub_yarn 1 "$ADVISORY"

  run bash "$SCRIPT" "$FOLDER"

  [ "$status" -eq 1 ]
  [[ "$output" == *"some-package"* ]]
}

@test "fails without a folder" {
  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No folder given"* ]]
}

@test "fails when the folder has no lock file" {
  run bash "$SCRIPT" "${BATS_TEST_TMPDIR}/no-such-folder"

  [ "$status" -eq 1 ]
  [[ "$output" == *"yarn.lock is not there"* ]]
}
