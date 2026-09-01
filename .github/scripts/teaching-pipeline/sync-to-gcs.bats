#!/usr/bin/env bats
# Tests for sync-to-gcs.sh
#
# gsutil is stubbed and its invocations recorded, because what matters here
# is where each module is sent — not that gsutil itself works.

# `run !` needs this declared, or bats runs in a compatibility mode where
# flags on `run` are not honoured and the negation silently passes.
bats_require_minimum_version 1.5.0

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

@test "a module is mirrored whole to its modules/ prefix" {
  make_module my-bank assessment learning module.yaml

  run bash "$SCRIPT" "$MODULES" my-bucket

  [ "$status" -eq 0 ]
  grep -q "gs://my-bucket/modules/my-bank/" "$CALLS"
}

@test "the bucket keeps the repository's shape" {
  # One rsync of the module directory, not three of its parts. The backend
  # reads the bucket as though it were the repo, so nothing may be renamed
  # or split on the way in.
  make_module my-bank assessment learning module.yaml

  run bash "$SCRIPT" "$MODULES" my-bucket

  [ "$(grep -c . "$CALLS")" -eq 1 ]
  ! grep -q "questions/" "$CALLS"
  ! grep -q "gs://my-bucket/learning/" "$CALLS"
}

@test "assessment content is no longer renamed to questions" {
  # The rename this change removes: assessment/ used to land under
  # questions/<bank_id>/, which is why the backend needed reconstruction.
  make_module my-bank assessment

  run bash "$SCRIPT" "$MODULES" my-bucket

  [ "$status" -eq 0 ]
  run ! grep -q "questions" "$CALLS"
}

@test "a module with no sections still syncs, so deletions propagate" {
  # An emptied module must reach the bucket as an empty prefix rather than
  # being skipped, or removed content would linger.
  make_module empty-bank

  run bash "$SCRIPT" "$MODULES" my-bucket

  [ "$status" -eq 0 ]
  grep -q "gs://my-bucket/modules/empty-bank/" "$CALLS"
}

@test "every module in the directory is synced" {
  make_module bank-one assessment
  make_module bank-two assessment

  run bash "$SCRIPT" "$MODULES" my-bucket

  [ "$status" -eq 0 ]
  grep -q "modules/bank-one/" "$CALLS"
  grep -q "modules/bank-two/" "$CALLS"
}

@test "deletion is propagated so a removed file leaves the bucket" {
  make_module my-bank assessment

  run bash "$SCRIPT" "$MODULES" my-bucket

  [ "$status" -eq 0 ]
  grep -q -- "-d" "$CALLS"
}
