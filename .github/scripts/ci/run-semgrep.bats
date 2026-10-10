#!/usr/bin/env bats
# Tests for run-semgrep.sh
#
# Against reports written here, and a stand-in for Semgrep on PATH, so the
# suite needs no Semgrep. What the real scan finds is what the CI job
# finds out.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/run-semgrep.sh"
  source "$SCRIPT"

  FOLDER="${BATS_TEST_TMPDIR}/frontend"
  CALLS="${BATS_TEST_TMPDIR}/calls"
  mkdir -p "$FOLDER" "$CALLS" "${BATS_TEST_TMPDIR}/bin"
  echo "rules: []" > "${FOLDER}/.semgrep.yml"
}

# report <files scanned> [results json] [errors json]
report() {
  local scanned="$1"
  local results="${2:-[]}"
  local errors="${3:-[]}"

  jq -n \
    --argjson scanned "$scanned" \
    --argjson results "$results" \
    --argjson errors "$errors" \
    '{paths: {scanned: [range(0; $scanned) | "src/file\(.).tsx"]}, results: $results, errors: $errors}'
}

# Puts a semgrep on PATH that records where and how it was called, prints
# the report it was given and exits as told.
stub_semgrep() {
  local exit_code="$1"
  local output="$2"

  printf '%s' "$output" > "${CALLS}/semgrep.out"

  cat > "${BATS_TEST_TMPDIR}/bin/semgrep" <<STUB
#!/usr/bin/env bash
pwd -P > "${CALLS}/semgrep.cwd"
echo "\$*" > "${CALLS}/semgrep.args"
cat "${CALLS}/semgrep.out"
exit ${exit_code}
STUB
  chmod +x "${BATS_TEST_TMPDIR}/bin/semgrep"
  PATH="${BATS_TEST_TMPDIR}/bin:${PATH}"
}

@test "passes a scan of the whole frontend that found nothing" {
  run check_report 0 <<<"$(report 1249)"

  [ "$status" -eq 0 ]
  [[ "$output" == *"Semgrep scanned 1249 files and found nothing"* ]]
}

@test "fails a scan that opened no files, though Semgrep passed it" {
  run check_report 0 <<<"$(report 0)"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Semgrep scanned 0 files"* ]]
  [[ "$output" == *"looked in the wrong place"* ]]
}

@test "fails a scan that covered only a corner of the frontend" {
  run check_report 0 <<<"$(report 27)"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Semgrep scanned 27 files"* ]]
}

@test "fails when the report does not say how many files were scanned" {
  run check_report 0 <<<"semgrep: command not found"

  [ "$status" -eq 1 ]
  [[ "$output" == *"did not say how many files"* ]]
  [[ "$output" == *"semgrep: command not found"* ]]
}

@test "fails on an empty report" {
  run check_report 0 <<<""

  [ "$status" -eq 1 ]
  [[ "$output" == *"did not say how many files"* ]]
}

@test "fails when Semgrep found an issue, and says where" {
  local results='[{"path": "src/lib/render.ts", "start": {"line": 14}, "check_id": "js.dangerous.eval", "extra": {"message": "Avoid eval/new Function."}}]'

  run check_report 1 <<<"$(report 1249 "$results")"

  [ "$status" -eq 1 ]
  [[ "$output" == *"src/lib/render.ts:14 js.dangerous.eval Avoid eval/new Function."* ]]
  [[ "$output" == *"Semgrep found issues in 1249 files"* ]]
}

@test "a scan that is too small fails for that, even with findings" {
  local results='[{"path": "a.ts", "start": {"line": 1}, "check_id": "r", "extra": {"message": "m"}}]'

  run check_report 1 <<<"$(report 3 "$results")"

  [ "$status" -eq 1 ]
  [[ "$output" == *"looked in the wrong place"* ]]
}

@test "says how many files could not be read all the way through" {
  local errors='[{"path": "src/a.test.tsx"}, {"path": "src/a.test.tsx"}, {"path": "src/b.test.tsx"}]'

  run check_report 0 <<<"$(report 1249 "[]" "$errors")"

  [ "$status" -eq 0 ]
  [[ "$output" == *"could not read 2 of them all the way through"* ]]
}

@test "says none when every file was read through" {
  run check_report 0 <<<"$(report 1249)"

  [[ "$output" == *"could not read 0 of them all the way through"* ]]
}

@test "runs Semgrep inside the folder, with that folder's rules, as JSON" {
  stub_semgrep 0 "$(report 1249)"

  run bash "$SCRIPT" "$FOLDER"

  [ "$status" -eq 0 ]
  [ "$(cat "${CALLS}/semgrep.cwd")" = "$(cd -P "$FOLDER" && pwd)" ]
  [[ "$(cat "${CALLS}/semgrep.args")" == *"--config .semgrep.yml"* ]]
  [[ "$(cat "${CALLS}/semgrep.args")" == *"--error"* ]]
  [[ "$(cat "${CALLS}/semgrep.args")" == *"--json"* ]]
}

@test "fails end to end when Semgrep exits 1 with a finding" {
  local results='[{"path": "src/x.ts", "start": {"line": 2}, "check_id": "js.dangerous.eval", "extra": {"message": "Avoid eval."}}]'
  stub_semgrep 1 "$(report 1249 "$results")"

  run bash "$SCRIPT" "$FOLDER"

  [ "$status" -eq 1 ]
  [[ "$output" == *"src/x.ts:2 js.dangerous.eval"* ]]
}

@test "fails end to end when Semgrep crashes and prints no report" {
  stub_semgrep 2 ""

  run bash "$SCRIPT" "$FOLDER"

  [ "$status" -eq 1 ]
  [[ "$output" == *"did not say how many files"* ]]
}

@test "fails without a folder" {
  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No folder given"* ]]
}

@test "fails when the folder has no rules file" {
  rm "${FOLDER}/.semgrep.yml"

  run bash "$SCRIPT" "$FOLDER"

  [ "$status" -eq 1 ]
  [[ "$output" == *".semgrep.yml is not there"* ]]
}
