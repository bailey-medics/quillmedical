#!/usr/bin/env bats
# Tests for use-mirrored-images.sh
#
# With a stand-in for docker on PATH that says which images the registry
# holds, so nothing is asked of a real one.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/use-mirrored-images.sh"
  BIN="${BATS_TEST_TMPDIR}/bin"
  HELD="${BATS_TEST_TMPDIR}/held"
  COMPOSE="${BATS_TEST_TMPDIR}/compose.ci.yml"
  export GITHUB_ENV="${BATS_TEST_TMPDIR}/github_env"
  mkdir -p "$BIN"
  : > "$HELD"
  : > "$GITHUB_ENV"

  cat > "$COMPOSE" <<'COMPOSE'
services:
  postgres-core:
    image: ${CI_POSTGRES_IMAGE:-public.ecr.aws/docker/library/postgres:18-alpine}
  caddy:
    image: ${CI_CADDY_IMAGE:-public.ecr.aws/docker/library/caddy:2-alpine@sha256:abc123}
  backend:
    image: quillmedical-ci_backend:latest
COMPOSE

  # `docker manifest inspect <ref>` succeeds only for a line in $HELD.
  cat > "${BIN}/docker" <<STUB
#!/usr/bin/env bash
grep -qxF "\$3" "${HELD}"
STUB
  chmod +x "${BIN}/docker"

  PATH="${BIN}:${PATH}"
}

@test "points a variable at the mirror when the mirror holds the image" {
  echo "ghcr.io/bailey-medics/mirror/postgres:18-alpine" > "$HELD"

  run bash "$SCRIPT" bailey-medics "$COMPOSE" CI_POSTGRES_IMAGE

  [ "$status" -eq 0 ]
  [ "$(cat "$GITHUB_ENV")" = "CI_POSTGRES_IMAGE=ghcr.io/bailey-medics/mirror/postgres:18-alpine" ]
}

@test "a pinned image is pointed at the mirror by its digest" {
  echo "ghcr.io/bailey-medics/mirror/caddy@sha256:abc123" > "$HELD"

  run bash "$SCRIPT" bailey-medics "$COMPOSE" CI_CADDY_IMAGE

  [ "$status" -eq 0 ]
  [ "$(cat "$GITHUB_ENV")" = "CI_CADDY_IMAGE=ghcr.io/bailey-medics/mirror/caddy@sha256:abc123" ]
}

@test "a pinned image is not pointed at a copy held only under its tag" {
  # The tag may have moved since the digest was pinned, so the tag being
  # there does not mean the pinned image is.
  echo "ghcr.io/bailey-medics/mirror/caddy:2-alpine" > "$HELD"

  run bash "$SCRIPT" bailey-medics "$COMPOSE" CI_CADDY_IMAGE

  [ "$status" -eq 0 ]
  [ ! -s "$GITHUB_ENV" ]
}

@test "leaves a variable alone when the mirror does not hold the image, and says so" {
  run bash "$SCRIPT" bailey-medics "$COMPOSE" CI_POSTGRES_IMAGE

  [ "$status" -eq 0 ]
  [ ! -s "$GITHUB_ENV" ]
  [[ "$output" == *"staying on public.ecr.aws/docker/library/postgres:18-alpine"* ]]
}

@test "each variable is decided on its own" {
  echo "ghcr.io/bailey-medics/mirror/caddy@sha256:abc123" > "$HELD"

  run bash "$SCRIPT" bailey-medics "$COMPOSE" CI_POSTGRES_IMAGE CI_CADDY_IMAGE

  [ "$status" -eq 0 ]
  [ "$(cat "$GITHUB_ENV")" = "CI_CADDY_IMAGE=ghcr.io/bailey-medics/mirror/caddy@sha256:abc123" ]
}

@test "fails on a variable the compose file does not read an image from" {
  # A name the file does not use, a misspelling say, would otherwise leave
  # the job on the public image for ever with nothing to show for it.
  run bash "$SCRIPT" bailey-medics "$COMPOSE" CI_REDIS_IMAGE

  [ "$status" -eq 1 ]
  [[ "$output" == *"CI_REDIS_IMAGE"* ]]
}

@test "fails with no variable named" {
  run bash "$SCRIPT" bailey-medics "$COMPOSE"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage"* ]]
}

@test "fails when there is nowhere to hand the choice on" {
  unset GITHUB_ENV

  run bash "$SCRIPT" bailey-medics "$COMPOSE" CI_POSTGRES_IMAGE

  [ "$status" -eq 1 ]
  [[ "$output" == *"GITHUB_ENV"* ]]
}

@test "the variables the workflow names are ones the real compose file reads" {
  # The workflow step and compose.ci.yml are edited apart, so pin them
  # together here.
  root="${BATS_TEST_DIRNAME}/../../.."
  named="$(grep -o 'use-mirrored-images.sh.*' "${root}/.github/workflows/ci.yml" | grep -o 'CI_[A-Z_]*_IMAGE')"

  [ -n "$named" ]

  for variable in $named; do
    grep -q "\${${variable}:-" "${root}/compose.ci.yml"
  done
}
