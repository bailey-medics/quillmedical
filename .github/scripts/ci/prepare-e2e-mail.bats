#!/usr/bin/env bats
# Tests for prepare-e2e-mail.sh

# shellcheck disable=SC2329

setup() {
  source "${BATS_TEST_DIRNAME}/prepare-e2e-mail.sh"
  FOLDER="${BATS_TEST_TMPDIR}/mail"
}

@test "makes the folder when it is missing" {
  run prepare_mail_folder "$FOLDER"

  [ "$status" -eq 0 ]
  [ -d "$FOLDER" ]
  [[ "$output" == *"Ready at ${FOLDER}"* ]]
}

@test "leaves the folder writable by every user" {
  prepare_mail_folder "$FOLDER"

  # The backend writes as its own user, not as whoever ran this
  [ "$(stat -c '%a' "$FOLDER" 2>/dev/null || stat -f '%Lp' "$FOLDER")" = "777" ]
}

@test "clears emails an earlier run left" {
  mkdir -p "$FOLDER"
  echo '{}' >"$FOLDER/1-old.json"

  prepare_mail_folder "$FOLDER"

  [ ! -e "$FOLDER/1-old.json" ]
}

@test "leaves anything that is not an email alone" {
  mkdir -p "$FOLDER"
  echo "keep" >"$FOLDER/notes.txt"

  prepare_mail_folder "$FOLDER"

  [ -f "$FOLDER/notes.txt" ]
}

@test "is safe to run twice" {
  prepare_mail_folder "$FOLDER"
  run prepare_mail_folder "$FOLDER"

  [ "$status" -eq 0 ]
}
