#!/usr/bin/env bats
# Tests for replace-argument.sh - the `replace` input of a terraform.yml
# dispatch, turned into a `-replace=` argument or refused.
#
# replace_argument is pure (arguments in, stdout out) and is tested directly.
# main is tested for what it writes to GITHUB_OUTPUT.

bats_require_minimum_version 1.5.0

setup() {
  source "${BATS_TEST_DIRNAME}/replace-argument.sh"

  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/github_output"
  : >"$GITHUB_OUTPUT"
}

@test "an empty address adds nothing to the apply" {
  run replace_argument ""

  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "the JWT secret may be regenerated" {
  run replace_argument "random_password.jwt_secret"

  [ "$status" -eq 0 ]
  [ "$output" = "-replace=random_password.jwt_secret" ]
}

@test "a database password may be regenerated through its module" {
  run replace_argument "module.cloud_sql_core.random_password.db_password"

  [ "$status" -eq 0 ]
  [ "$output" = "-replace=module.cloud_sql_core.random_password.db_password" ]
}

@test "the video signing key may be regenerated" {
  run replace_argument "module.teaching_video_pipeline[0].random_bytes.signing_key"

  [ "$status" -eq 0 ]
  [ "$output" = "-replace=module.teaching_video_pipeline[0].random_bytes.signing_key" ]
}

@test "a database instance is refused, and the refusal names what is allowed" {
  run ! replace_argument "module.cloud_sql_core.google_sql_database_instance.instance"

  [[ "$output" == *"Refusing to replace 'module.cloud_sql_core.google_sql_database_instance.instance'"* ]]
  [[ "$output" == *"random_password.jwt_secret"* ]]
}

@test "the VAPID placeholder is refused" {
  run ! replace_argument "random_password.vapid_placeholder"

  [[ "$output" == *"Refusing to replace"* ]]
}

@test "an address that merely contains an allowed one is refused" {
  run ! replace_argument "random_password.jwt_secret,module.load_balancer.google_compute_url_map.main"

  [[ "$output" == *"Refusing to replace"* ]]
}

@test "a refused address prints no argument on stdout" {
  run --separate-stderr ! replace_argument "google_project.project"

  [ -z "$output" ]
}

@test "main writes an empty argument for an ordinary dispatch" {
  run main ""

  [ "$status" -eq 0 ]
  [ "$(cat "$GITHUB_OUTPUT")" = "argument=" ]
}

@test "main writes the replace argument for an allowed address" {
  run main "random_password.jwt_secret"

  [ "$status" -eq 0 ]
  [[ "$output" == *"regenerates random_password.jwt_secret"* ]]
  [ "$(cat "$GITHUB_OUTPUT")" = "argument=-replace=random_password.jwt_secret" ]
}

@test "main fails on a refused address and writes nothing" {
  run ! main "module.cloud_sql_core.google_sql_database_instance.instance"

  [ -z "$(cat "$GITHUB_OUTPUT")" ]
}

@test "main errors when GITHUB_OUTPUT is not set" {
  unset GITHUB_OUTPUT

  run ! main "random_password.jwt_secret"

  [[ "$output" == *"GITHUB_OUTPUT not set"* ]]
}
