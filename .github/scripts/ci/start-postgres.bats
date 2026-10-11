#!/usr/bin/env bats
# Tests for start-postgres.sh
#
# With a stand-in for docker on PATH that records what it was asked and
# answers from files, so no container is started.

bats_require_minimum_version 1.5.0

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/start-postgres.sh"
  BIN="${BATS_TEST_TMPDIR}/bin"
  ASKED="${BATS_TEST_TMPDIR}/asked"
  IMAGE="${BATS_TEST_TMPDIR}/image"
  HEALTH="${BATS_TEST_TMPDIR}/health"
  mkdir -p "$BIN"
  : > "$ASKED"
  echo "public.ecr.aws/docker/library/postgres:18-alpine" > "$IMAGE"
  echo "healthy" > "$HEALTH"
  export START_POSTGRES_TRIES=2

  # `docker compose ... config` prints the services, `docker inspect`
  # prints the health in $HEALTH, and everything is written to $ASKED.
  cat > "${BIN}/docker" <<STUB
#!/usr/bin/env bash
echo "\$*" >> "${ASKED}"
case "\$1" in
  compose) echo "{\"services\":{\"postgres-core\":{\"image\":\"\$(cat "${IMAGE}")\"}}}" ;;
  inspect) cat "${HEALTH}" ;;
esac
STUB
  chmod +x "${BIN}/docker"

  # No waiting between tries.
  printf '#!/usr/bin/env bash\n' > "${BIN}/sleep"
  chmod +x "${BIN}/sleep"

  PATH="${BIN}:${PATH}"
}

@test "starts the image the compose file names for the service" {
  run bash "$SCRIPT" compose.ci.yml postgres-core quill_core core_user secret

  [ "$status" -eq 0 ]
  grep -q "^run .* public.ecr.aws/docker/library/postgres:18-alpine$" "$ASKED"
}

@test "starts the mirrored image when the compose file has been pointed at it" {
  echo "ghcr.io/bailey-medics/mirror/postgres:18-alpine" > "$IMAGE"

  run bash "$SCRIPT" compose.ci.yml postgres-core quill_core core_user secret

  [ "$status" -eq 0 ]
  grep -q "^run .* ghcr.io/bailey-medics/mirror/postgres:18-alpine$" "$ASKED"
}

@test "gives the database, the user and the password it was handed, on port 5432" {
  run bash "$SCRIPT" compose.ci.yml postgres-core quill_core core_user secret

  [ "$status" -eq 0 ]
  grep -q "POSTGRES_DB=quill_core" "$ASKED"
  grep -q "POSTGRES_USER=core_user" "$ASKED"
  grep -q "POSTGRES_PASSWORD=secret" "$ASKED"
  grep -q -- "--publish 5432:5432" "$ASKED"
}

@test "fails when Postgres never answers" {
  echo "starting" > "$HEALTH"

  run bash "$SCRIPT" compose.ci.yml postgres-core quill_core core_user secret

  [ "$status" -eq 1 ]
  [[ "$output" == *"did not answer within 2 seconds"* ]]
}

@test "fails, and starts nothing, when the compose file has no such service" {
  run bash "$SCRIPT" compose.ci.yml no-such-service quill_core core_user secret

  [ "$status" -eq 1 ]
  [[ "$output" == *"names no image for the service no-such-service"* ]]
  run ! grep -q "^run " "$ASKED"
}

@test "fails with the usage when an argument is missing" {
  run bash "$SCRIPT" compose.ci.yml postgres-core quill_core core_user

  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage: start-postgres.sh"* ]]
  run ! grep -q "^run " "$ASKED"
}
