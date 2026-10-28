#!/usr/bin/env bats
# Tests for use-mirrored-base-images.sh
#
# With a stand-in for docker on PATH that says which images the registry
# holds, so nothing is asked of a real one.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/use-mirrored-base-images.sh"
  ROOT="${BATS_TEST_DIRNAME}/../../.."
  BIN="${BATS_TEST_TMPDIR}/bin"
  HELD="${BATS_TEST_TMPDIR}/held"
  BACKEND="${BATS_TEST_TMPDIR}/backend.Dockerfile"
  FRONTEND="${BATS_TEST_TMPDIR}/frontend.Dockerfile"
  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/github_output"
  mkdir -p "$BIN"
  : > "$HELD"
  : > "$GITHUB_OUTPUT"

  cat > "$BACKEND" <<'DOCKERFILE'
ARG PYTHON_IMAGE=public.ecr.aws/docker/library/python:3.14-slim@sha256:abc123
FROM ${PYTHON_IMAGE} AS base
DOCKERFILE

  cat > "$FRONTEND" <<'DOCKERFILE'
ARG NODE_IMAGE=public.ecr.aws/docker/library/node:24-slim@sha256:def456
ARG CADDY_IMAGE=public.ecr.aws/docker/library/caddy:2-alpine
FROM ${NODE_IMAGE} AS deps
FROM ${CADDY_IMAGE} AS prod
DOCKERFILE

  # `docker manifest inspect <ref>` succeeds only for a line in $HELD.
  cat > "${BIN}/docker" <<STUB
#!/usr/bin/env bash
grep -qxF "\$3" "${HELD}"
STUB
  chmod +x "${BIN}/docker"

  PATH="${BIN}:${PATH}"
}

# Prints the lines of the `build_args` output.
build_args() {
  sed -n '/^build_args<<END_OF_BUILD_ARGS$/,/^END_OF_BUILD_ARGS$/p' "$GITHUB_OUTPUT" \
    | sed '1d;$d'
}

@test "hands the build the copy when the mirror holds the image" {
  echo "ghcr.io/bailey-medics/mirror/python@sha256:abc123" > "$HELD"

  run bash "$SCRIPT" bailey-medics "$BACKEND"

  [ "$status" -eq 0 ]
  [ "$(build_args)" = "PYTHON_IMAGE=ghcr.io/bailey-medics/mirror/python@sha256:abc123" ]
}

@test "a pinned image is not pointed at a copy held only under its tag" {
  # The tag may have moved on. Only the very same image will do.
  echo "ghcr.io/bailey-medics/mirror/python:3.14-slim" > "$HELD"

  run bash "$SCRIPT" bailey-medics "$BACKEND"

  [ "$status" -eq 0 ]
  [ -z "$(build_args)" ]
}

@test "an image with no digest is pointed at the copy by its tag" {
  echo "ghcr.io/bailey-medics/mirror/caddy:2-alpine" > "$HELD"

  run bash "$SCRIPT" bailey-medics "$FRONTEND"

  [ "$status" -eq 0 ]
  [ "$(build_args)" = "CADDY_IMAGE=ghcr.io/bailey-medics/mirror/caddy:2-alpine" ]
}

@test "gives no argument for an image the mirror lacks, and says so" {
  run bash "$SCRIPT" bailey-medics "$BACKEND"

  [ "$status" -eq 0 ]
  [ -z "$(build_args)" ]
  [[ "$output" == *"the mirror does not hold"* ]]
  [[ "$output" == *"staying on public.ecr.aws/docker/library/python:3.14-slim@sha256:abc123"* ]]
}

@test "each image is decided on its own" {
  echo "ghcr.io/bailey-medics/mirror/node@sha256:def456" > "$HELD"

  run bash "$SCRIPT" bailey-medics "$FRONTEND"

  [ "$status" -eq 0 ]
  [ "$(build_args)" = "NODE_IMAGE=ghcr.io/bailey-medics/mirror/node@sha256:def456" ]
  grep -qx "fell_back=public.ecr.aws/docker/library/caddy:2-alpine" "$GITHUB_OUTPUT"
}

@test "takes several Dockerfiles and gives every argument once" {
  cp "$BACKEND" "${BATS_TEST_TMPDIR}/caption.Dockerfile"
  echo "ghcr.io/bailey-medics/mirror/python@sha256:abc123" > "$HELD"
  echo "ghcr.io/bailey-medics/mirror/node@sha256:def456" >> "$HELD"
  echo "ghcr.io/bailey-medics/mirror/caddy:2-alpine" >> "$HELD"

  run bash "$SCRIPT" bailey-medics "$BACKEND" "${BATS_TEST_TMPDIR}/caption.Dockerfile" "$FRONTEND"

  [ "$status" -eq 0 ]
  [ "$(build_args | wc -l | tr -d ' ')" -eq 3 ]
  [ "$(build_args | grep -c '^PYTHON_IMAGE=')" -eq 1 ]
}

@test "hands on every image left on the public registry, for the Slack message" {
  run bash "$SCRIPT" bailey-medics "$FRONTEND"

  [ "$status" -eq 0 ]
  grep -qx "fell_back=public.ecr.aws/docker/library/caddy:2-alpine, public.ecr.aws/docker/library/node:24-slim@sha256:def456" "$GITHUB_OUTPUT"
}

@test "hands on nothing as fallen back when every image came from the mirror" {
  echo "ghcr.io/bailey-medics/mirror/python@sha256:abc123" > "$HELD"

  run bash "$SCRIPT" bailey-medics "$BACKEND"

  [ "$status" -eq 0 ]
  ! grep -q "^fell_back=" "$GITHUB_OUTPUT"
}

@test "always writes the build arguments, even when there are none" {
  # A step that reads an output nobody wrote gets an empty string, which
  # is the right answer here, but writing it makes that a decision.
  run bash "$SCRIPT" bailey-medics "$BACKEND"

  [ "$status" -eq 0 ]
  grep -qx "build_args<<END_OF_BUILD_ARGS" "$GITHUB_OUTPUT"
  grep -qx "END_OF_BUILD_ARGS" "$GITHUB_OUTPUT"
}

@test "the owner's name is lower-cased, as the registry needs" {
  echo "ghcr.io/bailey-medics/mirror/python@sha256:abc123" > "$HELD"

  run bash "$SCRIPT" Bailey-Medics "$BACKEND"

  [ "$status" -eq 0 ]
  [ "$(build_args)" = "PYTHON_IMAGE=ghcr.io/bailey-medics/mirror/python@sha256:abc123" ]
}

@test "hands the build the syntax image's copy as BUILDKIT_SYNTAX" {
  # The syntax line is read before any ARG, so only this argument changes it.
  sed -i '1i # syntax=mirror.gcr.io/docker/dockerfile:1.27@sha256:fed789' "$BACKEND"
  echo "ghcr.io/bailey-medics/mirror/dockerfile@sha256:fed789" > "$HELD"

  run bash "$SCRIPT" bailey-medics "$BACKEND"

  [ "$status" -eq 0 ]
  [ "$(build_args)" = "BUILDKIT_SYNTAX=ghcr.io/bailey-medics/mirror/dockerfile@sha256:fed789" ]
}

@test "leaves the syntax image on its public name when the mirror lacks it, and says so" {
  sed -i '1i # syntax=mirror.gcr.io/docker/dockerfile:1.27@sha256:fed789' "$BACKEND"
  echo "ghcr.io/bailey-medics/mirror/python@sha256:abc123" > "$HELD"

  run bash "$SCRIPT" bailey-medics "$BACKEND"

  [ "$status" -eq 0 ]
  [ "$(build_args)" = "PYTHON_IMAGE=ghcr.io/bailey-medics/mirror/python@sha256:abc123" ]
  grep -qx "fell_back=mirror.gcr.io/docker/dockerfile:1.27@sha256:fed789" "$GITHUB_OUTPUT"
}

@test "a syntax line below the first is a comment, and gives no argument" {
  sed -i '1a # syntax=mirror.gcr.io/docker/dockerfile:1.27@sha256:fed789' "$BACKEND"
  echo "ghcr.io/bailey-medics/mirror/dockerfile@sha256:fed789" > "$HELD"

  run bash "$SCRIPT" bailey-medics "$BACKEND"

  [ "$status" -eq 0 ]
  [[ "$(build_args)" != *"BUILDKIT_SYNTAX"* ]]
}

@test "fails for a Dockerfile that names no base image in an ARG" {
  echo "FROM public.ecr.aws/docker/library/python:3.14-slim" > "$BACKEND"

  run bash "$SCRIPT" bailey-medics "$BACKEND"

  [ "$status" -eq 1 ]
  [[ "$output" == *"names no base image"* ]]
}

@test "fails for a Dockerfile that is not there" {
  run bash "$SCRIPT" bailey-medics "${BATS_TEST_TMPDIR}/no-such-file"

  [ "$status" -eq 1 ]
  [[ "$output" == *"does not exist"* ]]
}

@test "fails with no Dockerfile named" {
  run bash "$SCRIPT" bailey-medics

  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage"* ]]
}

@test "fails when there is nowhere to hand the arguments on" {
  unset GITHUB_OUTPUT

  run bash "$SCRIPT" bailey-medics "$BACKEND"

  [ "$status" -eq 1 ]
  [[ "$output" == *"GITHUB_OUTPUT"* ]]
}

@test "reads the real Dockerfiles" {
  run bash "$SCRIPT" bailey-medics \
    "${ROOT}/backend/Dockerfile" \
    "${ROOT}/backend/Dockerfile.caption" \
    "${ROOT}/frontend/Dockerfile"

  [ "$status" -eq 0 ]
  [[ "$output" == *"PYTHON_IMAGE"* ]]
  [[ "$output" == *"NODE_IMAGE"* ]]
  [[ "$output" == *"CADDY_IMAGE"* ]]
  [[ "$output" == *"BUILDKIT_SYNTAX"* ]]
}

@test "every workflow that builds an image asks for the mirrored base images first" {
  # A build step with no mirror step before it pulls from the public
  # registry every time, which is the failure this exists to stop.
  for workflow in ci.yml e2e-image-cache.yml deploy.yml; do
    file="${ROOT}/.github/workflows/${workflow}"

    grep -q "use-mirrored-base-images.sh" "$file" || {
      echo "${workflow} builds an image and never calls use-mirrored-base-images.sh"
      false
    }
  done
}

@test "every image build in those workflows passes the mirrored arguments" {
  for workflow in ci.yml e2e-image-cache.yml deploy.yml; do
    file="${ROOT}/.github/workflows/${workflow}"
    builds="$(grep -c "docker/build-push-action@" "$file" || true)"
    passing="$(grep -c "outputs.build_args" "$file" || true)"

    [ "$builds" -eq "$passing" ] || {
      echo "${workflow}: ${builds} image builds, ${passing} pass the mirrored base images"
      false
    }
  done
}
