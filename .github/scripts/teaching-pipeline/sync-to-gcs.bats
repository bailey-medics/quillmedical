#!/usr/bin/env bats
# Tests for sync-to-gcs.sh
#
# gsutil is stubbed and its invocations recorded, because what matters here
# is which prefixes each module's sections are sent to and which sections
# are skipped when absent — not that gsutil itself works.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/sync-to-gcs.sh"
  MODULES="${BATS_TEST_TMPDIR}/modules"
  CALLS="${BATS_TEST_TMPDIR}/gsutil-calls"
  mkdir -p "$MODULES"
  : > "$CALLS"

  # Stub gsutil onto PATH, recording each call.
  STUB_DIR="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "$STUB_DIR"
  cat > "${STUB_DIR}/gsutil" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "${CALLS}"
EOF
  chmod +x "${STUB_DIR}/gsutil"
  PATH="${STUB_DIR}:${PATH}"
}

make_module() {
  local name="$1"
  mkdir -p "${MODULES}/${name}"
  shift
  for section in "$@"; do
    case "$section" in
      module.yaml) echo "moduleId: ${name}" > "${MODULES}/${name}/module.yaml" ;;
      *) mkdir -p "${MODULES}/${name}/${section}"
         echo "x" > "${MODULES}/${name}/${section}/file.txt" ;;
    esac
  done
}

@test "fails without a modules directory argument" {
  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No modules directory provided"* ]]
}

@test "fails without a bucket argument" {
  run bash "$SCRIPT" "$MODULES"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No bucket name provided"* ]]
}

@test "fails when the modules directory does not exist" {
  run bash "$SCRIPT" "${BATS_TEST_TMPDIR}/absent" my-bucket

  [ "$status" -eq 1 ]
  [[ "$output" == *"Modules directory not found"* ]]
}

@test "assessment content goes to the questions prefix" {
  make_module my-bank assessment

  run bash "$SCRIPT" "$MODULES" my-bucket

  [ "$status" -eq 0 ]
  grep -q "gs://my-bucket/questions/my-bank/" "$CALLS"
}

@test "learning content goes to the learning prefix" {
  make_module my-bank learning

  run bash "$SCRIPT" "$MODULES" my-bucket

  [ "$status" -eq 0 ]
  grep -q "gs://my-bucket/learning/my-bank/" "$CALLS"
}

@test "module.yaml is copied, not synced" {
  make_module my-bank module.yaml

  run bash "$SCRIPT" "$MODULES" my-bucket

  [ "$status" -eq 0 ]
  grep -q "^cp .*gs://my-bucket/modules/my-bank/module.yaml" "$CALLS"
}

@test "a module with no sections produces no uploads" {
  make_module empty-bank

  run bash "$SCRIPT" "$MODULES" my-bucket

  [ "$status" -eq 0 ]
  [ ! -s "$CALLS" ]
}

@test "an assessment-only module does not touch the learning prefix" {
  make_module my-bank assessment

  run bash "$SCRIPT" "$MODULES" my-bucket

  [ "$status" -eq 0 ]
  run ! grep -q "learning" "$CALLS"
}

@test "every module in the directory is synced" {
  make_module bank-one assessment

  make_module bank-two assessment

  run bash "$SCRIPT" "$MODULES" my-bucket

  [ "$status" -eq 0 ]
  grep -q "questions/bank-one/" "$CALLS"
  grep -q "questions/bank-two/" "$CALLS"
}

@test "deletion is propagated so a removed file leaves the bucket" {
  make_module my-bank assessment

  run bash "$SCRIPT" "$MODULES" my-bucket

  [ "$status" -eq 0 ]
  grep -q -- "-d" "$CALLS"
}
