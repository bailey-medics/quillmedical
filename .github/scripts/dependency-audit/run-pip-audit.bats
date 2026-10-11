#!/usr/bin/env bats
# Tests for run-pip-audit.sh
#
# Against reports written here, and a stand-in for pip-audit on PATH, so
# the suite needs no pip-audit and asks nothing of the advisory lists.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/run-pip-audit.sh"
  source "$SCRIPT"

  IGNORE="${BATS_TEST_TMPDIR}/ignore"
  VENV="${BATS_TEST_TMPDIR}/venv"
  CALLS="${BATS_TEST_TMPDIR}/calls"
  mkdir -p "${VENV}/lib/python3.14/site-packages" "$CALLS" "${BATS_TEST_TMPDIR}/bin"
  : > "$IGNORE"

  JOSE='{"name": "python-jose", "version": "3.5.0", "vulns": [{"id": "CVE-2026-1", "aliases": ["GHSA-aaaa"], "fix_versions": []}]}'
  MULTIDICT='{"name": "multidict", "version": "6.9.0", "vulns": [{"id": "CVE-2026-2", "aliases": [], "fix_versions": ["6.9.1"]}]}'
}

# report <clean packages> [vulnerable packages as JSON objects...]
report() {
  local clean="$1"
  shift
  local vulnerable="[]"

  if [ "$#" -gt 0 ]; then
    vulnerable="$(printf '%s\n' "$@" | jq -s '.')"
  fi

  jq -n \
    --argjson clean "$clean" \
    --argjson vulnerable "$vulnerable" \
    '{dependencies: ([range(0; $clean) | {name: "package\(.)", version: "1.0", vulns: []}] + $vulnerable)}'
}

# Puts a pip-audit on PATH that records how it was called, prints the
# report it was given and exits as told.
stub_pip_audit() {
  local exit_code="$1"
  local output="$2"

  printf '%s' "$output" > "${CALLS}/pip-audit.out"

  cat > "${BATS_TEST_TMPDIR}/bin/pip-audit" <<STUB
#!/usr/bin/env bash
echo "\$*" > "${CALLS}/pip-audit.args"
cat "${CALLS}/pip-audit.out"
exit ${exit_code}
STUB
  chmod +x "${BATS_TEST_TMPDIR}/bin/pip-audit"
  PATH="${BATS_TEST_TMPDIR}/bin:${PATH}"
}

@test "passes when no package has a known vulnerability" {
  run check_report "$IGNORE" 50 <<<"$(report 91)"

  [ "$status" -eq 0 ]
  [[ "$output" == *"looked at 91 packages and found nothing"* ]]
}

@test "fails on a vulnerability, and says the package, the advisory and the fix" {
  run check_report "$IGNORE" 50 <<<"$(report 90 "$MULTIDICT")"

  [ "$status" -eq 1 ]
  [[ "$output" == *"multidict 6.9.0 has a known vulnerability: CVE-2026-2. Fixed in: 6.9.1"* ]]
}

@test "says so when no version fixes it yet" {
  run check_report "$IGNORE" 50 <<<"$(report 90 "$JOSE")"

  [ "$status" -eq 1 ]
  [[ "$output" == *"python-jose 3.5.0"*"Fixed in: no version yet"* ]]
}

@test "passes a vulnerability the ignore file excuses with a reason" {
  echo "CVE-2026-1 Tokens here are signed with a shared secret." > "$IGNORE"

  run check_report "$IGNORE" 50 <<<"$(report 90 "$JOSE")"

  [ "$status" -eq 0 ]
  [[ "$output" == *"Excused: python-jose 3.5.0"* ]]
}

@test "an advisory is excused under any name it goes by" {
  echo "GHSA-aaaa Tokens here are signed with a shared secret." > "$IGNORE"

  run check_report "$IGNORE" 50 <<<"$(report 90 "$JOSE")"

  [ "$status" -eq 0 ]
}

@test "excusing one vulnerability does not excuse another" {
  echo "CVE-2026-1 Tokens here are signed with a shared secret." > "$IGNORE"

  run check_report "$IGNORE" 50 <<<"$(report 89 "$JOSE" "$MULTIDICT")"

  [ "$status" -eq 1 ]
  [[ "$output" == *"multidict 6.9.0 has a known vulnerability"* ]]
  [[ "$output" != *"python-jose 3.5.0 has a known vulnerability"* ]]
}

@test "an id that only starts the same is not an excuse" {
  echo "CVE-2026-10 Some other advisory." > "$IGNORE"

  run check_report "$IGNORE" 50 <<<"$(report 90 "$JOSE")"

  [ "$status" -eq 1 ]
  [[ "$output" == *"python-jose 3.5.0 has a known vulnerability"* ]]
}

@test "refuses an excuse with no reason" {
  echo "CVE-2026-1" > "$IGNORE"

  run check_report "$IGNORE" 50 <<<"$(report 90 "$JOSE")"

  [ "$status" -eq 1 ]
  [[ "$output" == *"excuses CVE-2026-1 without saying why"* ]]
}

@test "fails on an excuse that no installed package matches any more" {
  # Otherwise the list keeps an excuse after the package is fixed, and
  # nobody is told the line can go.
  echo "CVE-2026-1 Tokens here are signed with a shared secret." > "$IGNORE"

  run check_report "$IGNORE" 50 <<<"$(report 91)"

  [ "$status" -eq 1 ]
  [[ "$output" == *"excuses CVE-2026-1, which no installed package has any more"* ]]
}

@test "comments and blank lines in the ignore file are not excuses" {
  printf '# CVE-2026-2 commented out\n\n   # indented comment\nCVE-2026-1 A reason.\n' > "$IGNORE"

  run check_report "$IGNORE" 50 <<<"$(report 89 "$JOSE" "$MULTIDICT")"

  [ "$status" -eq 1 ]
  [[ "$output" == *"multidict 6.9.0 has a known vulnerability"* ]]
  [[ "$output" != *"commented"* ]]
}

@test "fails an audit of too few packages, though nothing was found" {
  run check_report "$IGNORE" 50 <<<"$(report 3)"

  [ "$status" -eq 1 ]
  [[ "$output" == *"looked at 3 packages"* ]]
  [[ "$output" == *"looked in the wrong place"* ]]
}

@test "fails when there is no report to read" {
  run check_report "$IGNORE" 50 <<<"pip-audit: could not reach the advisory service"

  [ "$status" -eq 1 ]
  [[ "$output" == *"did not say how many packages"* ]]
  [[ "$output" == *"could not reach the advisory service"* ]]
}

@test "audits the virtualenv's site-packages, as JSON with aliases" {
  stub_pip_audit 0 "$(report 91)"

  run bash "$SCRIPT" "$VENV" "$IGNORE" 50

  [ "$status" -eq 0 ]
  [[ "$(cat "${CALLS}/pip-audit.args")" == *"--path ${VENV}/lib/python3.14/site-packages"* ]]
  [[ "$(cat "${CALLS}/pip-audit.args")" == *"--format json"* ]]
  [[ "$(cat "${CALLS}/pip-audit.args")" == *"--aliases on"* ]]
}

@test "fails end to end when pip-audit exits 1 with a finding" {
  stub_pip_audit 1 "$(report 90 "$MULTIDICT")"

  run bash "$SCRIPT" "$VENV" "$IGNORE" 50

  [ "$status" -eq 1 ]
  [[ "$output" == *"multidict 6.9.0"* ]]
}

@test "passes end to end when pip-audit exits 1 and every finding is excused" {
  echo "CVE-2026-1 Tokens here are signed with a shared secret." > "$IGNORE"
  stub_pip_audit 1 "$(report 90 "$JOSE")"

  run bash "$SCRIPT" "$VENV" "$IGNORE" 50

  [ "$status" -eq 0 ]
}

@test "fails end to end when pip-audit crashes and prints no report" {
  stub_pip_audit 2 ""

  run bash "$SCRIPT" "$VENV" "$IGNORE" 50

  [ "$status" -eq 1 ]
  [[ "$output" == *"did not say how many packages"* ]]
}

@test "fails when the virtualenv holds nothing installed" {
  run bash "$SCRIPT" "${BATS_TEST_TMPDIR}/no-such-venv" "$IGNORE" 50

  [ "$status" -eq 1 ]
  [[ "$output" == *"nothing installed to audit"* ]]
}

@test "fails when the ignore file is missing" {
  run bash "$SCRIPT" "$VENV" "${BATS_TEST_TMPDIR}/no-such-file" 50

  [ "$status" -eq 1 ]
  [[ "$output" == *"has to exist"* ]]
}

@test "fails without a floor" {
  run bash "$SCRIPT" "$VENV" "$IGNORE"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage"* ]]
}

@test "every excuse in the real ignore file has a reason" {
  real="${BATS_TEST_DIRNAME}/../../../backend/.pip-audit-ignore"

  while IFS=$'\t' read -r id reason; do
    [ -n "$id" ]
    [ -n "$reason" ]
  done <<<"$(ignore_entries "$real")"
}
