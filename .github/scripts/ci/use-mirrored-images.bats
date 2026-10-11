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
  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/github_output"
  mkdir -p "$BIN"
  : > "$HELD"
  : > "$GITHUB_ENV"
  : > "$GITHUB_OUTPUT"

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

@test "hands on the images left on the public registry, for the Slack message" {
  run bash "$SCRIPT" bailey-medics "$COMPOSE" CI_POSTGRES_IMAGE CI_CADDY_IMAGE

  [ "$status" -eq 0 ]
  [ "$(cat "$GITHUB_OUTPUT")" = "fell_back=public.ecr.aws/docker/library/postgres:18-alpine, public.ecr.aws/docker/library/caddy:2-alpine@sha256:abc123" ]
}

@test "hands on only the image that was left behind" {
  echo "ghcr.io/bailey-medics/mirror/caddy@sha256:abc123" > "$HELD"

  run bash "$SCRIPT" bailey-medics "$COMPOSE" CI_POSTGRES_IMAGE CI_CADDY_IMAGE

  [ "$(cat "$GITHUB_OUTPUT")" = "fell_back=public.ecr.aws/docker/library/postgres:18-alpine" ]
}

@test "hands on nothing when every image came from the mirror" {
  # An empty output is what keeps the Slack job from running.
  printf '%s\n' \
    "ghcr.io/bailey-medics/mirror/postgres:18-alpine" \
    "ghcr.io/bailey-medics/mirror/caddy@sha256:abc123" > "$HELD"

  run bash "$SCRIPT" bailey-medics "$COMPOSE" CI_POSTGRES_IMAGE CI_CADDY_IMAGE

  [ "$status" -eq 0 ]
  [ ! -s "$GITHUB_OUTPUT" ]
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

@test "the variables each workflow names are ones the real compose file reads" {
  # The workflow steps and compose.ci.yml are edited apart, so pin them
  # together here.
  root="${BATS_TEST_DIRNAME}/../../.."
  named="$(grep -h -o 'use-mirrored-images.sh.*' "${root}"/.github/workflows/*.yml | grep -o 'CI_[A-Z_]*_IMAGE' | sort -u)"

  [ -n "$named" ]

  for variable in $named; do
    grep -q "\${${variable}:-" "${root}/compose.ci.yml"
  done
}

@test "every image variable in the compose file is named by each workflow that uses the mirror" {
  root="${BATS_TEST_DIRNAME}/../../.."
  # A workflow that runs the script, not one that only mentions it.
  wanted="$(grep -o '\${CI_[A-Z_]*_IMAGE:-' "${root}/compose.ci.yml" | grep -o 'CI_[A-Z_]*_IMAGE' | sort -u)"

  [ -n "$wanted" ]

  for workflow in $(grep -l 'run: bash .*use-mirrored-images.sh' "${root}"/.github/workflows/*.yml); do
    for variable in $wanted; do
      grep 'use-mirrored-images.sh' "$workflow" | grep -q "$variable"
    done
  done
}

@test "every workflow that starts the CI stack points it at the mirror first" {
  # The end-to-end job had the step and the guide screenshots did not,
  # and were refused by the public registry on 11 October 2026.
  root="${BATS_TEST_DIRNAME}/../../.."
  starters="$(grep -l 'compose.ci.yml up' "${root}"/.github/workflows/*.yml)"

  [ "$(wc -l <<<"$starters")" -ge 2 ]

  for workflow in $starters; do
    mirror_line="$(grep -n 'use-mirrored-images.sh' "$workflow" | head -n 1 | cut -d: -f1)"
    login_line="$(grep -n 'registry: ghcr.io' "$workflow" | head -n 1 | cut -d: -f1)"
    up_line="$(grep -n 'compose.ci.yml up' "$workflow" | head -n 1 | cut -d: -f1)"

    [ -n "$mirror_line" ]
    [ -n "$login_line" ]
    [ "$login_line" -lt "$mirror_line" ]
    [ "$mirror_line" -lt "$up_line" ]
  done
}
