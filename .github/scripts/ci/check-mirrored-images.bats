#!/usr/bin/env bats
# Tests for check-mirrored-images.sh
#
# The script reads paths relative to the working directory, so each test
# builds a miniature repository in a temp directory and runs from there.
# The last few read the real files, to hold the repository to it.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/check-mirrored-images.sh"
  ROOT="${BATS_TEST_DIRNAME}/../../.."
  REPO="${BATS_TEST_TMPDIR}/repo"
  mkdir -p "${REPO}/.github/workflows" "${REPO}/.github/actions/setup" "${REPO}/backend"

  cat > "${REPO}/compose.ci.yml" <<'COMPOSE'
services:
  postgres:
    image: ${CI_POSTGRES_IMAGE:-public.ecr.aws/docker/library/postgres:18-alpine@sha256:abc}
  backend:
    image: quillmedical-ci_backend:latest
COMPOSE

  cat > "${REPO}/backend/Dockerfile" <<'DOCKERFILE'
ARG PYTHON_IMAGE=public.ecr.aws/docker/library/python:3.14-slim@sha256:abc
FROM ${PYTHON_IMAGE} AS base
FROM base AS prod
DOCKERFILE

  cat > "${REPO}/.github/workflows/ci.yml" <<'WORKFLOW'
jobs:
  build:
    steps:
      - with:
          driver-opts: image=mirror.gcr.io/moby/buildkit:buildx-stable-1
      - run: gcloud run deploy --image=${{ env.REGISTRY }}/backend:latest
WORKFLOW
}

run_check() {
  cd "$REPO" || return 1
  bash "$SCRIPT" compose.ci.yml backend/Dockerfile
}

@test "passes when every image can come from the mirror" {
  run run_check

  [ "$status" -eq 0 ]
  [[ "$output" == *"can come from the mirror"* ]]
}

@test "fails for a FROM that names an image outright" {
  cat > "${REPO}/backend/Dockerfile" <<'DOCKERFILE'
FROM public.ecr.aws/docker/library/python:3.14-slim AS base
DOCKERFILE

  run run_check

  [ "$status" -eq 1 ]
  [[ "$output" == *"backend/Dockerfile: FROM public.ecr.aws/docker/library/python:3.14-slim names an image outright"* ]]
}

@test "fails for a FROM that names a Docker Hub image by its short name" {
  # No registry in the name at all is Docker Hub, the most limited of them.
  echo "FROM python:3.14-slim" > "${REPO}/backend/Dockerfile"

  run run_check

  [ "$status" -eq 1 ]
  [[ "$output" == *"FROM python:3.14-slim names an image outright"* ]]
}

@test "a later stage may build on an earlier one, and on scratch" {
  cat > "${REPO}/backend/Dockerfile" <<'DOCKERFILE'
ARG PYTHON_IMAGE=public.ecr.aws/docker/library/python:3.14-slim@sha256:abc
FROM ${PYTHON_IMAGE} AS base
FROM base AS build
FROM --platform=linux/amd64 build AS prod
FROM scratch AS export
DOCKERFILE

  run run_check

  [ "$status" -eq 0 ]
}

@test "a stage cannot be built on before it is defined" {
  # `FROM prod` with no earlier stage called prod is an image named prod.
  cat > "${REPO}/backend/Dockerfile" <<'DOCKERFILE'
FROM prod AS base
DOCKERFILE

  run run_check

  [ "$status" -eq 1 ]
}

@test "an argument that does not end _IMAGE is not taken for a base image" {
  # The mirror only copies arguments ending _IMAGE, so one named
  # otherwise would never be copied.
  cat > "${REPO}/backend/Dockerfile" <<'DOCKERFILE'
ARG BASE=public.ecr.aws/docker/library/python:3.14-slim
FROM ${BASE} AS base
DOCKERFILE

  run run_check

  [ "$status" -eq 1 ]
}

@test "fails for a compose image from a registry that is not a variable's default" {
  cat >> "${REPO}/compose.ci.yml" <<'COMPOSE'
  caddy:
    image: public.ecr.aws/docker/library/caddy:2-alpine
COMPOSE

  run run_check

  [ "$status" -eq 1 ]
  [[ "$output" == *"compose.ci.yml: image public.ecr.aws/docker/library/caddy:2-alpine"* ]]
}

@test "fails for a compose image named by tag alone" {
  cat > "${REPO}/compose.ci.yml" <<'COMPOSE'
services:
  postgres:
    image: ${CI_POSTGRES_IMAGE:-public.ecr.aws/docker/library/postgres:18-alpine}
COMPOSE

  run run_check

  [ "$status" -eq 1 ]
  [[ "$output" == *"compose.ci.yml: image public.ecr.aws/docker/library/postgres:18-alpine is named by tag alone"* ]]
}

@test "fails for a base image named by tag alone" {
  cat > "${REPO}/backend/Dockerfile" <<'DOCKERFILE'
ARG PYTHON_IMAGE=public.ecr.aws/docker/library/python:3.14-slim
FROM ${PYTHON_IMAGE} AS base
DOCKERFILE

  run run_check

  [ "$status" -eq 1 ]
  [[ "$output" == *"backend/Dockerfile: base image public.ecr.aws/docker/library/python:3.14-slim is named by tag alone"* ]]
}

@test "the mirror runs on no timer, which is what the pins are for" {
  run grep -E '^[[:space:]]*schedule:' "${ROOT}/.github/workflows/mirror-images.yml"

  [ "$status" -eq 1 ]
}

@test "fails for a workflow that names a public image" {
  cat > "${REPO}/.github/workflows/other.yml" <<'WORKFLOW'
jobs:
  a:
    container:
      image: public.ecr.aws/docker/library/node:24
WORKFLOW

  run run_check

  [ "$status" -eq 1 ]
  [[ "$output" == *".github/workflows/other.yml: image public.ecr.aws/docker/library/node:24"* ]]
}

@test "fails for a composite action that names a public image" {
  cat > "${REPO}/.github/actions/setup/action.yml" <<'ACTION'
runs:
  steps:
    - with:
        driver-opts: image=moby/buildkit:latest
ACTION

  run run_check

  [ "$status" -eq 1 ]
  [[ "$output" == *"actions/setup/action.yml: image moby/buildkit:latest"* ]]
}

@test "a workflow may name an image in GitHub's own registry" {
  cat > "${REPO}/.github/workflows/other.yml" <<'WORKFLOW'
jobs:
  a:
    container:
      image: ghcr.io/bailey-medics/mirror/semgrep:latest
WORKFLOW

  run run_check

  [ "$status" -eq 0 ]
}

@test "a job's service container may not come from a public registry, pinned or not" {
  # How the drift check named its Postgres until 12 October 2026, when a
  # refused pull of it took a pull request out of the merge queue. There
  # is no list of exceptions to add one to.
  cat > "${REPO}/.github/workflows/ci.yml" <<'WORKFLOW'
jobs:
  drift:
    services:
      postgres:
        image: public.ecr.aws/docker/library/postgres:18-alpine@sha256:abc
WORKFLOW

  run run_check

  [ "$status" -eq 1 ]
  [[ "$output" == *"ci.yml: image public.ecr.aws/docker/library/postgres:18-alpine@sha256:abc is pulled from a public registry"* ]]
}

@test "every offender is reported, not just the first" {
  echo "FROM python:3.14-slim" > "${REPO}/backend/Dockerfile"
  cat >> "${REPO}/compose.ci.yml" <<'COMPOSE'
  caddy:
    image: public.ecr.aws/docker/library/caddy:2-alpine
COMPOSE

  run run_check

  [ "$status" -eq 1 ]
  [[ "$output" == *"backend/Dockerfile"* ]]
  [[ "$output" == *"compose.ci.yml"* ]]
}

@test "fails for a Dockerfile that is not there" {
  run bash -c "cd '${REPO}' && bash '${SCRIPT}' compose.ci.yml backend/no-such-file"

  [ "$status" -eq 1 ]
  [[ "$output" == *"does not exist"* ]]
}

@test "fails with no Dockerfile named" {
  run bash -c "cd '${REPO}' && bash '${SCRIPT}' compose.ci.yml"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage"* ]]
}

@test "the real repository passes" {
  run bash -c "cd '${ROOT}' && bash '${SCRIPT}' compose.ci.yml backend/Dockerfile backend/Dockerfile.caption frontend/Dockerfile"

  [ "$status" -eq 0 ]
}

@test "every Dockerfile in the repository is checked, or is named as built on a developer's machine only" {
  # The two under .github/ build the image `just ts` runs the shell tests
  # in. CI runs those tests on the runner itself and never builds either.
  local_only=" .github/Dockerfile .github/Dockerfile.coverage "
  checked="$(grep -o 'check-mirrored-images.sh [^"]*' "${ROOT}/.github/workflows/ci.yml" | head -1)"

  while IFS= read -r dockerfile; do
    [[ "$local_only" == *" ${dockerfile} "* ]] && continue

    [[ "$checked" == *"${dockerfile}"* ]] || {
      echo "${dockerfile} is not passed to check-mirrored-images.sh in ci.yml"
      false
    }
  done < <(cd "$ROOT" && git ls-files | grep -E '(^|/)Dockerfile[^/]*$')
}

@test "the mirror copies the same Dockerfiles this checks" {
  # A Dockerfile checked here and not copied there would pass this and
  # then fall back to the public registry on every build.
  checked="$(grep -o 'check-mirrored-images.sh [^"]*' "${ROOT}/.github/workflows/ci.yml" | head -1)"

  for dockerfile in backend/Dockerfile backend/Dockerfile.caption frontend/Dockerfile; do
    [[ "$checked" == *"${dockerfile}"* ]]
    grep -q "$dockerfile" "${ROOT}/.github/workflows/mirror-images.yml"
  done
}
