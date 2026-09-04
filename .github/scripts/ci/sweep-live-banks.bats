#!/usr/bin/env bats
# Tests for sweep-live-banks.sh
#
# gcloud and the validator are both stubbed: what matters here is the
# script's own decisions — whether it fails when published content would be
# rejected, and whether the report survives to be read — not that gcloud
# downloads or that the validator validates, both of which have their own
# tests.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/sweep-live-banks.sh"
  STUB_DIR="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "${STUB_DIR}"
  PATH="${STUB_DIR}:${PATH}"

  # Both stubs read what they should do from files rather than the
  # environment, so a test states its setup plainly and nothing has to be
  # exported out of the test body.
  FIXTURES="${BATS_TEST_TMPDIR}/fixtures"
  mkdir -p "$FIXTURES"

  # gcloud stub: creates the modules/ tree the script expects.
  cat > "${STUB_DIR}/gcloud" <<EOF
#!/usr/bin/env bash
dest=""
for arg in "\$@"; do dest="\$arg"; done
[ -e "${FIXTURES}/gcloud-fails" ] && exit 1
if [ -e "${FIXTURES}/gcloud-empty" ]; then mkdir -p "\$dest"; exit 0; fi
mkdir -p "\${dest}/modules/bank-one" "\${dest}/modules/bank-two"
EOF
  chmod +x "${STUB_DIR}/gcloud"

  # The script runs the validator via `cd backend && python -m ...`, so the
  # stub stands in for python itself.
  printf 'Checked 2 module(s).\nAll valid.\n' > "${FIXTURES}/validator-output"
  echo 0 > "${FIXTURES}/validator-status"
  cat > "${STUB_DIR}/python" <<EOF
#!/usr/bin/env bash
cat "${FIXTURES}/validator-output"
exit "\$(cat "${FIXTURES}/validator-status")"
EOF
  chmod +x "${STUB_DIR}/python"

  mkdir -p "${BATS_TEST_TMPDIR}/repo/backend"
  cd "${BATS_TEST_TMPDIR}/repo" || return 1
}

@test "fails without a bucket" {
  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No bucket provided"* ]]
}

@test "passes when every published bank still validates" {
  run bash "$SCRIPT" my-bucket

  [ "$status" -eq 0 ]
  [[ "$output" == *"Every published bank still passes"* ]]
}

@test "fails when published content would be rejected today" {
  # The reason this exists: a tightening that breaks live content should be
  # visible before it merges, not after it deploys.
  echo 1 > "${FIXTURES}/validator-status"
  printf '%s\n' "1 error(s) found:" \
    "ERROR [modules/bank-one/assessment]: missing question_type" \
    > "${FIXTURES}/validator-output"

  run bash "$SCRIPT" my-bucket

  [ "$status" -eq 1 ]
  [[ "$output" == *"would fail today's validator"* ]]
}

@test "the failing bank and rule reach the output" {
  # A sweep that only said "something broke" would send the reader to the
  # logs of a job they did not run.
  echo 1 > "${FIXTURES}/validator-status"
  echo "ERROR [modules/bank-one/assessment]: missing question_type" \
    > "${FIXTURES}/validator-output"

  run bash "$SCRIPT" my-bucket

  [[ "$output" == *"bank-one"* ]]
  [[ "$output" == *"missing question_type"* ]]
}

@test "an unwritable report path fails before the slow work" {
  # The download and validation take a minute; a typo in the path should
  # not be discovered at the end of it.
  run bash "$SCRIPT" my-bucket "${BATS_TEST_TMPDIR}/no-such-dir/report.txt"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Cannot write the report"* ]]
  [[ "$output" != *"Validating"* ]]
}

@test "no output path is not an error, the report still reaches the log" {
  # It is optional by design: run it by hand and just read the output.
  run bash "$SCRIPT" my-bucket

  [ "$status" -eq 0 ]
  [[ "$output" == *"All valid"* ]]
}

@test "the report can be written to a file for a pull request comment" {
  run bash "$SCRIPT" my-bucket "${BATS_TEST_TMPDIR}/report.txt"

  [ "$status" -eq 0 ]
  grep -q "All valid" "${BATS_TEST_TMPDIR}/report.txt"
}

@test "the report is still written when the sweep fails" {
  echo 1 > "${FIXTURES}/validator-status"
  echo "ERROR [x]: boom" > "${FIXTURES}/validator-output"

  run bash "$SCRIPT" my-bucket "${BATS_TEST_TMPDIR}/report.txt"

  [ "$status" -eq 1 ]
  grep -q "boom" "${BATS_TEST_TMPDIR}/report.txt"
}

@test "fails when the bucket cannot be read" {
  touch "${FIXTURES}/gcloud-fails"

  run bash "$SCRIPT" my-bucket

  [ "$status" -eq 1 ]
  [[ "$output" == *"Could not read"* ]]
}

@test "fails when the bucket has no modules prefix" {
  # Not the same as everything passing: an empty download would otherwise
  # validate nothing and report success.
  touch "${FIXTURES}/gcloud-empty"

  run bash "$SCRIPT" my-bucket

  [ "$status" -eq 1 ]
  [[ "$output" == *"No modules/ prefix"* ]]
}

@test "it counts what it is about to validate" {
  run bash "$SCRIPT" my-bucket

  [[ "$output" == *"Validating 2 published module(s)"* ]]
}

@test "version lock is skipped, having no meaning for published content" {
  # It compares a branch against origin/main; there is no branch here.
  grep -q -- "--skip-version-lock" "$SCRIPT"
}
