#!/usr/bin/env bats
# Tests for prepare-e2e-job-key.sh
#
# cspell:words pubout

# shellcheck disable=SC2329

setup() {
  source "${BATS_TEST_DIRNAME}/prepare-e2e-job-key.sh"
  FOLDER="${BATS_TEST_TMPDIR}/job-key"
}

@test "makes a private key and its public half" {
  run make_job_key "$FOLDER"

  [ "$status" -eq 0 ]
  [[ "$output" == *"Ready at ${FOLDER}"* ]]
  grep -q "BEGIN PRIVATE KEY" "$FOLDER/private.pem"
  grep -q "BEGIN PUBLIC KEY" "$FOLDER/public.pem"
}

@test "the public key is the private key's own half" {
  make_job_key "$FOLDER"

  [ "$(openssl pkey -in "$FOLDER/private.pem" -pubout)" = "$(cat "$FOLDER/public.pem")" ]
}

@test "makes a new pair every run" {
  make_job_key "$FOLDER"
  first="$(cat "$FOLDER/public.pem")"

  make_job_key "$FOLDER"

  [ "$(cat "$FOLDER/public.pem")" != "$first" ]
}

@test "leaves both halves readable by every user" {
  make_job_key "$FOLDER"

  # The backend reads the public half as its own user
  [ "$(stat -c '%a' "$FOLDER/public.pem" 2>/dev/null || stat -f '%Lp' "$FOLDER/public.pem")" = "644" ]
  [ "$(stat -c '%a' "$FOLDER" 2>/dev/null || stat -f '%Lp' "$FOLDER")" = "755" ]
}
