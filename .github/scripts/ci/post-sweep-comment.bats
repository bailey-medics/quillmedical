#!/usr/bin/env bats
# Tests for post-sweep-comment.sh
#
# build_body is pure, so most of this needs no pull request at all. The
# `gh` calls are stubbed for the few tests that reach them.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/post-sweep-comment.sh"
  REPORT="${BATS_TEST_TMPDIR}/report.txt"
  BODY="${BATS_TEST_TMPDIR}/body"

  STUB_DIR="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "${STUB_DIR}"
  cat > "${STUB_DIR}/gh" <<EOF
#!/usr/bin/env bash
cat > "${BODY}"
EOF
  chmod +x "${STUB_DIR}/gh"
  PATH="${STUB_DIR}:${PATH}"
  export GH_TOKEN="fake"

  # shellcheck source=./post-sweep-comment.sh
  source "$SCRIPT"
}

@test "the body names the banks the change would reject" {
  run build_body "ERROR [modules/bank-one/assessment]: missing question_type" "http://run"
  [[ "$output" == *"bank-one"* ]]
  [[ "$output" == *"missing question_type"* ]]
}

@test "the body says the failure may be intended" {
  # Rejecting live content can be the point of a tightening; the comment
  # should not read as an accusation that the change is wrong.
  run build_body "ERROR" "http://run"
  [[ "$output" == *"may be intentional"* ]]
}

@test "the body links the run" {
  run build_body "ERROR" "http://run/42"
  [[ "$output" == *"http://run/42"* ]]
}

@test "fails without a pull request number" {
  # Each argument is checked on its own, so the message names the one that
  # is missing rather than restating the whole signature.
  run bash "$SCRIPT" "" "$REPORT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"No pull request number provided"* ]]
}

@test "fails without a report file" {
  run bash "$SCRIPT" 7
  [ "$status" -eq 1 ]
  [[ "$output" == *"No report file provided"* ]]
}

@test "fails when the report is missing" {
  run bash "$SCRIPT" 7 "${BATS_TEST_TMPDIR}/absent.txt"
  [ "$status" -eq 1 ]
  [[ "$output" == *"missing or empty"* ]]
}

@test "fails when the report is empty" {
  : > "$REPORT"
  run bash "$SCRIPT" 7 "$REPORT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"missing or empty"* ]]
}

@test "fails without a token rather than posting nothing" {
  echo "ERROR" > "$REPORT"
  GH_TOKEN="" run bash "$SCRIPT" 7 "$REPORT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"GH_TOKEN"* ]]
}

@test "posts the report to the pull request" {
  echo "ERROR [modules/bank-one]: boom" > "$REPORT"
  run bash "$SCRIPT" 7 "$REPORT"
  [ "$status" -eq 0 ]
  grep -q "bank-one" "$BODY"
}

@test "a long report is truncated, pointing at the run instead" {
  python3 -c "print('ERROR line\n' * 200)" > "$REPORT"
  run bash "$SCRIPT" 7 "$REPORT"
  [ "$status" -eq 0 ]
  grep -q "truncated" "$BODY"
  [ "$(wc -l < "$BODY")" -lt 60 ]
}
