#!/usr/bin/env bats
# Tests for list-files.sh
#
# `gsutil` is a stub on PATH that records what it was asked for.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/list-files.sh"
  STUB="${BATS_TEST_TMPDIR}/bin"
  export ASKED="${BATS_TEST_TMPDIR}/asked"
  mkdir -p "$STUB"
  : > "$ASKED"

  cat > "${STUB}/gsutil" <<'GSUTIL'
#!/usr/bin/env bash
echo "$*" >> "$ASKED"
[ -z "${GSUTIL_FAILS:-}" ] || exit 1
echo "gs://quill-medical-app-landing-uk/index.html"
GSUTIL
  chmod +x "${STUB}/gsutil"
  PATH="${STUB}:${PATH}"
}

@test "lists the London landing bucket of the project it is given" {
  run bash "$SCRIPT" quill-medical-app

  [ "$status" -eq 0 ]
  [ "$(cat "$ASKED")" = "ls gs://quill-medical-app-landing-uk/" ]
  [[ "$output" == *"gs://quill-medical-app-landing-uk/index.html"* ]]
}

@test "fails with no project given, and asks for nothing" {
  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No GCP project ID provided"* ]]
  [ ! -s "$ASKED" ]
}

@test "fails when the bucket cannot be listed" {
  # A deploy that uploaded nothing must not read as one that did.
  GSUTIL_FAILS=1 run bash "$SCRIPT" quill-medical-app

  [ "$status" -ne 0 ]
}
