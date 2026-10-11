#!/usr/bin/env bats
# Tests for run-semgrep.sh
#
# Against reports written here, and a stand-in for Semgrep on PATH, so the
# suite needs no Semgrep. What the real scan finds is what the CI job
# finds out.
#
# The script scans twice: the folder's canary file in a scratch folder, to
# prove the rules, and then the folder. The stand-in tells the two apart by
# where it was run, and answers each with its own report.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/run-semgrep.sh"
  source "$SCRIPT"

  FOLDER="${BATS_TEST_TMPDIR}/frontend"
  CALLS="${BATS_TEST_TMPDIR}/calls"
  mkdir -p "$FOLDER" "$CALLS" "${BATS_TEST_TMPDIR}/bin"

  cat > "${FOLDER}/.semgrep.yml" <<'RULES'
rules:
  - id: js.dangerous.eval
    languages: [typescript]
    severity: ERROR
    message: Avoid eval.
    pattern: eval($X)

  - id: js.dom.xss.innerhtml
    languages: [typescript]
    severity: ERROR
    message: Avoid raw HTML.
    pattern: $X.innerHTML = $Y
RULES
  echo 'eval(x); a.innerHTML = b;' > "${FOLDER}/.semgrep-canary.tsx.txt"

  # What a scan of the canary reports when both rules work.
  BOTH_FIRED='[{"path": "canary.tsx", "start": {"line": 1}, "check_id": "js.dangerous.eval", "extra": {"message": "m"}}, {"path": "canary.tsx", "start": {"line": 1}, "check_id": "js.dom.xss.innerhtml", "extra": {"message": "m"}}]'
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

# Puts a semgrep on PATH. Run inside the folder, it records where and how
# it was called, prints the report it was given and exits as told. Run
# anywhere else it is the scan of the canary: it notes the files it was
# given and prints the canary report, which by default says both rules
# fired.
#
# stub_semgrep <exit code> <report> [canary report]
stub_semgrep() {
  local exit_code="$1"
  local output="$2"
  local canary_output="${3:-$(report 1 "$BOTH_FIRED")}"
  local folder=""
  folder="$(cd -P "$FOLDER" && pwd)"

  printf '%s' "$output" > "${CALLS}/semgrep.out"
  printf '%s' "$canary_output" > "${CALLS}/canary.out"

  cat > "${BATS_TEST_TMPDIR}/bin/semgrep" <<STUB
#!/usr/bin/env bash
if [ "\$(pwd -P)" != "${folder}" ]; then
  ls -A > "${CALLS}/canary.files"
  cat "${CALLS}/canary.out"
  exit 1
fi

pwd -P > "${CALLS}/semgrep.cwd"
echo "\$*" > "${CALLS}/semgrep.args"
cat "${CALLS}/semgrep.out"
exit ${exit_code}
STUB
  chmod +x "${BATS_TEST_TMPDIR}/bin/semgrep"
  PATH="${BATS_TEST_TMPDIR}/bin:${PATH}"
}

@test "passes a scan of the whole frontend that found nothing" {
  run check_report 0 500 <<<"$(report 1249)"

  [ "$status" -eq 0 ]
  [[ "$output" == *"Semgrep scanned 1249 files and found nothing"* ]]
}

@test "fails a scan that opened no files, though Semgrep passed it" {
  run check_report 0 500 <<<"$(report 0)"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Semgrep scanned 0 files"* ]]
  [[ "$output" == *"looked in the wrong place"* ]]
}

@test "fails a scan that covered only a corner of the frontend" {
  run check_report 0 500 <<<"$(report 27)"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Semgrep scanned 27 files"* ]]
}

@test "fails when the report does not say how many files were scanned" {
  run check_report 0 500 <<<"semgrep: command not found"

  [ "$status" -eq 1 ]
  [[ "$output" == *"did not say how many files"* ]]
  [[ "$output" == *"semgrep: command not found"* ]]
}

@test "fails on an empty report" {
  run check_report 0 500 <<<""

  [ "$status" -eq 1 ]
  [[ "$output" == *"did not say how many files"* ]]
}

@test "fails when Semgrep found an issue, and says where" {
  local results='[{"path": "src/lib/render.ts", "start": {"line": 14}, "check_id": "js.dangerous.eval", "extra": {"message": "Avoid eval/new Function."}}]'

  run check_report 1 500 <<<"$(report 1249 "$results")"

  [ "$status" -eq 1 ]
  [[ "$output" == *"src/lib/render.ts:14 js.dangerous.eval Avoid eval/new Function."* ]]
  [[ "$output" == *"Semgrep found issues in 1249 files"* ]]
}

@test "a scan that is too small fails for that, even with findings" {
  local results='[{"path": "a.ts", "start": {"line": 1}, "check_id": "r", "extra": {"message": "m"}}]'

  run check_report 1 500 <<<"$(report 3 "$results")"

  [ "$status" -eq 1 ]
  [[ "$output" == *"looked in the wrong place"* ]]
}

@test "says how many files could not be read all the way through" {
  local errors='[{"path": "src/a.test.tsx"}, {"path": "src/a.test.tsx"}, {"path": "src/b.test.tsx"}]'

  run check_report 0 500 <<<"$(report 1249 "[]" "$errors")"

  [ "$status" -eq 0 ]
  [[ "$output" == *"could not read 2 of them all the way through"* ]]
}

@test "says none when every file was read through" {
  run check_report 0 500 <<<"$(report 1249)"

  [[ "$output" == *"could not read 0 of them all the way through"* ]]
}

@test "runs Semgrep inside the folder, with that folder's rules, as JSON" {
  stub_semgrep 0 "$(report 1249)"

  run bash "$SCRIPT" "$FOLDER" 500

  [ "$status" -eq 0 ]
  [ "$(cat "${CALLS}/semgrep.cwd")" = "$(cd -P "$FOLDER" && pwd)" ]
  [[ "$(cat "${CALLS}/semgrep.args")" == *"--config .semgrep.yml"* ]]
  [[ "$(cat "${CALLS}/semgrep.args")" == *"--error"* ]]
  [[ "$(cat "${CALLS}/semgrep.args")" == *"--json"* ]]
}

@test "fails end to end when Semgrep exits 1 with a finding" {
  local results='[{"path": "src/x.ts", "start": {"line": 2}, "check_id": "js.dangerous.eval", "extra": {"message": "Avoid eval."}}]'
  stub_semgrep 1 "$(report 1249 "$results")"

  run bash "$SCRIPT" "$FOLDER" 500

  [ "$status" -eq 1 ]
  [[ "$output" == *"src/x.ts:2 js.dangerous.eval"* ]]
}

@test "fails end to end when Semgrep crashes and prints no report" {
  stub_semgrep 2 ""

  run bash "$SCRIPT" "$FOLDER" 500

  [ "$status" -eq 1 ]
  [[ "$output" == *"did not say how many files"* ]]
}

@test "the floor is the one given, so a small folder can have a low one" {
  run check_report 0 100 <<<"$(report 158)"

  [ "$status" -eq 0 ]

  run check_report 0 100 <<<"$(report 99)"

  [ "$status" -eq 1 ]
  [[ "$output" == *"more than 100"* ]]
}

@test "names the source files that could not be read through, and not the tests" {
  local errors='[{"path": "src/a.test.tsx"}, {"path": "src/Button.stories.tsx"}, {"path": "app/thing_test.py"}, {"path": "src/components/Pay.tsx"}]'

  run check_report 0 500 <<<"$(report 1249 "[]" "$errors")"

  [ "$status" -eq 0 ]
  [[ "$output" == *"could not read 4 of them"* ]]
  [[ "$output" == *"these are source"*"src/components/Pay.tsx"* ]]
  [[ "$output" != *"these are source"*"a.test.tsx"* ]]
  [[ "$output" != *"these are source"*"Button.stories.tsx"* ]]
  [[ "$output" != *"these are source"*"thing_test.py"* ]]
}

@test "says nothing about source files when only tests were partly read" {
  local errors='[{"path": "src/a.test.tsx"}]'

  run check_report 0 500 <<<"$(report 1249 "[]" "$errors")"

  [[ "$output" != *"these are source"* ]]
}

@test "scans the canary under its real extension, beside a copy of the rules" {
  stub_semgrep 0 "$(report 1249)"

  run bash "$SCRIPT" "$FOLDER" 500

  [ "$status" -eq 0 ]
  [[ "$output" == *"All 2 rules found their line in .semgrep-canary.tsx.txt"* ]]
  grep -qx "canary.tsx" "${CALLS}/canary.files"
  grep -qx ".semgrep.yml" "${CALLS}/canary.files"
}

@test "fails when a rule finds nothing in the canary, and names the rule" {
  local one_fired='[{"path": "canary.tsx", "start": {"line": 1}, "check_id": "js.dangerous.eval", "extra": {"message": "m"}}]'
  stub_semgrep 0 "$(report 1249)" "$(report 1 "$one_fired")"

  run bash "$SCRIPT" "$FOLDER" 500

  [ "$status" -eq 1 ]
  [[ "$output" == *"found nothing in"*"js.dom.xss.innerhtml"* ]]
  [[ "$output" != *"found nothing in"*"js.dangerous.eval,"* ]]
}

@test "a rule that did not fire stops the job before the source is scanned" {
  stub_semgrep 0 "$(report 1249)" "$(report 1)"

  run bash "$SCRIPT" "$FOLDER" 500

  [ "$status" -eq 1 ]
  [ ! -f "${CALLS}/semgrep.cwd" ]
}

@test "fails when the scan of the canary prints no report" {
  stub_semgrep 0 "$(report 1249)" "semgrep: crashed"

  run bash "$SCRIPT" "$FOLDER" 500

  [ "$status" -eq 1 ]
  [[ "$output" == *"found nothing in"* ]]
}

@test "fails when the folder has no canary file" {
  rm "${FOLDER}/.semgrep-canary.tsx.txt"
  stub_semgrep 0 "$(report 1249)"

  run bash "$SCRIPT" "$FOLDER" 500

  [ "$status" -eq 1 ]
  [[ "$output" == *"needs exactly one .semgrep-canary"* ]]
}

@test "fails when the folder has two canary files" {
  cp "${FOLDER}/.semgrep-canary.tsx.txt" "${FOLDER}/.semgrep-canary.ts.txt"
  stub_semgrep 0 "$(report 1249)"

  run bash "$SCRIPT" "$FOLDER" 500

  [ "$status" -eq 1 ]
  [[ "$output" == *"needs exactly one .semgrep-canary"* ]]
}

@test "fails when the rules file holds no rules" {
  echo "rules: []" > "${FOLDER}/.semgrep.yml"
  stub_semgrep 0 "$(report 1249)"

  run bash "$SCRIPT" "$FOLDER" 500

  [ "$status" -eq 1 ]
  [[ "$output" == *"holds no rules"* ]]
}

@test "fails without a floor" {
  run bash "$SCRIPT" "$FOLDER"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No floor given"* ]]
}

@test "fails on a floor of nought, which would pass an empty scan" {
  run bash "$SCRIPT" "$FOLDER" 0

  [ "$status" -eq 1 ]
  [[ "$output" == *"No floor given"* ]]
}

@test "every real rules file has a canary that names each of its rules" {
  # What Semgrep makes of them is for the CI job. This pins the cheaper
  # half: nobody added a rule and forgot its line.
  root="${BATS_TEST_DIRNAME}/../../.."

  for folder in frontend backend; do
    canary="$(canary_file "${root}/${folder}")"

    [ -n "$canary" ]
    [ -n "$(rule_ids "${root}/${folder}/.semgrep.yml")" ]

    while IFS= read -r id; do
      grep -qF "$id" "$canary"
    done <<<"$(rule_ids "${root}/${folder}/.semgrep.yml")"
  done
}

@test "the workflow scans both folders, each with a floor" {
  workflow="${BATS_TEST_DIRNAME}/../../workflows/ci.yml"

  grep -q 'run-semgrep.sh frontend [1-9][0-9]*$' "$workflow"
  grep -q 'run-semgrep.sh backend [1-9][0-9]*$' "$workflow"
}

@test "fails without a folder" {
  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No folder given"* ]]
}

@test "fails when the folder has no rules file" {
  rm "${FOLDER}/.semgrep.yml"

  run bash "$SCRIPT" "$FOLDER" 500

  [ "$status" -eq 1 ]
  [[ "$output" == *".semgrep.yml is not there"* ]]
}
