#!/usr/bin/env bats
# Tests for check-renovate-tracks-images.sh
#
# Against a small repository and a report written here, in the form
# Renovate writes one. Whether the real Renovate still reads the real
# files is what the CI job finds out.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/check-renovate-tracks-images.sh"
  REPO="${BATS_TEST_TMPDIR}/repo"
  REPORT="${BATS_TEST_TMPDIR}/report.json"
  mkdir -p "${REPO}/backend"

  cat > "${REPO}/compose.ci.yml" <<'COMPOSE'
services:
  postgres:
    image: ${CI_POSTGRES_IMAGE:-public.ecr.aws/docker/library/postgres:18-alpine@sha256:aaa}
  backend:
    image: quillmedical-ci_backend:latest
COMPOSE

  cat > "${REPO}/backend/Dockerfile" <<'DOCKERFILE'
ARG PYTHON_IMAGE=public.ecr.aws/docker/library/python:3.14-slim@sha256:bbb
FROM ${PYTHON_IMAGE} AS base
DOCKERFILE

  write_report \
    '{"depName": "public.ecr.aws/docker/library/postgres", "currentValue": "18-alpine", "currentDigest": "sha256:aaa"}' \
    '{"depName": "public.ecr.aws/docker/library/python", "currentValue": "3.14-slim", "currentDigest": "sha256:bbb"}'
}

# write_report <compose dep json> <dockerfile dep json>
write_report() {
  cat > "$REPORT" <<JSON
{
  "problems": [],
  "repositories": {
    "local": {
      "packageFiles": {
        "docker-compose": [{"packageFile": "compose.ci.yml", "deps": [${1}]}],
        "dockerfile": [{"packageFile": "backend/Dockerfile", "deps": [${2}]}]
      }
    }
  }
}
JSON
}

run_check() {
  cd "$REPO" || return 1
  bash "$SCRIPT" "$REPORT" compose.ci.yml backend/Dockerfile
}

@test "passes when Renovate lists every pinned image with its digest" {
  run run_check

  [ "$status" -eq 0 ]
  [[ "$output" == *"Renovate tracks all 2 pinned image(s)"* ]]
}

@test "fails for a compose image Renovate did not find" {
  write_report \
    '{"depName": "something/else", "currentDigest": "sha256:aaa"}' \
    '{"depName": "public.ecr.aws/docker/library/python", "currentDigest": "sha256:bbb"}'

  run run_check

  [ "$status" -eq 1 ]
  [[ "$output" == *"compose.ci.yml: Renovate does not track public.ecr.aws/docker/library/postgres at sha256:aaa"* ]]
}

@test "fails for a base image Renovate did not find" {
  write_report \
    '{"depName": "public.ecr.aws/docker/library/postgres", "currentDigest": "sha256:aaa"}' \
    ''

  run run_check

  [ "$status" -eq 1 ]
  [[ "$output" == *"backend/Dockerfile: Renovate does not track public.ecr.aws/docker/library/python at sha256:bbb"* ]]
}

@test "fails when Renovate found the image and missed its digest" {
  write_report \
    '{"depName": "public.ecr.aws/docker/library/postgres", "currentValue": "18-alpine"}' \
    '{"depName": "public.ecr.aws/docker/library/python", "currentDigest": "sha256:bbb"}'

  run run_check

  [ "$status" -eq 1 ]
  [[ "$output" == *"does not track public.ecr.aws/docker/library/postgres"* ]]
}

@test "fails when Renovate found the image and skipped it" {
  write_report \
    '{"depName": "public.ecr.aws/docker/library/postgres", "currentDigest": "sha256:aaa", "skipReason": "contains-variable"}' \
    '{"depName": "public.ecr.aws/docker/library/python", "currentDigest": "sha256:bbb"}'

  run run_check

  [ "$status" -eq 1 ]
  [[ "$output" == *"does not track public.ecr.aws/docker/library/postgres"* ]]
}

@test "an image found in another file does not count for this one" {
  cat > "$REPORT" <<'JSON'
{"repositories": {"local": {"packageFiles": {
  "docker-compose": [
    {"packageFile": "compose.dev.yml", "deps": [{"depName": "public.ecr.aws/docker/library/postgres", "currentDigest": "sha256:aaa"}]},
    {"packageFile": "compose.ci.yml", "deps": []}
  ],
  "dockerfile": [{"packageFile": "backend/Dockerfile", "deps": [{"depName": "public.ecr.aws/docker/library/python", "currentDigest": "sha256:bbb"}]}]
}}}}
JSON

  run run_check

  [ "$status" -eq 1 ]
  [[ "$output" == *"compose.ci.yml: Renovate does not track"* ]]
}

@test "an image Renovate names by packageName is found" {
  write_report \
    '{"depName": "postgres", "packageName": "public.ecr.aws/docker/library/postgres", "currentDigest": "sha256:aaa"}' \
    '{"depName": "public.ecr.aws/docker/library/python", "currentDigest": "sha256:bbb"}'

  run run_check

  [ "$status" -eq 0 ]
}

@test "every image not tracked is reported, not just the first" {
  write_report '' ''

  run run_check

  [ "$status" -eq 1 ]
  [[ "$output" == *"library/postgres"* ]]
  [[ "$output" == *"library/python"* ]]
}

@test "an image with no digest is an error, not a pass" {
  cat > "${REPO}/backend/Dockerfile" <<'DOCKERFILE'
ARG PYTHON_IMAGE=public.ecr.aws/docker/library/python:3.14-slim
FROM ${PYTHON_IMAGE} AS base
DOCKERFILE

  run run_check

  [ "$status" -eq 1 ]
  [[ "$output" == *"has no digest"* ]]
}

@test "an image CI builds itself is not looked for" {
  run run_check

  [[ "$output" != *"quillmedical-ci_backend"* ]]
}

@test "a registry with a port in its name keeps the port" {
  cat > "${REPO}/backend/Dockerfile" <<'DOCKERFILE'
ARG PYTHON_IMAGE=registry.example:5000/python:3.14-slim@sha256:bbb
FROM ${PYTHON_IMAGE} AS base
DOCKERFILE
  write_report \
    '{"depName": "public.ecr.aws/docker/library/postgres", "currentDigest": "sha256:aaa"}' \
    '{"depName": "registry.example:5000/python", "currentDigest": "sha256:bbb"}'

  run run_check

  [ "$status" -eq 0 ]
}

@test "a missing report is an error, not a pass" {
  rm "$REPORT"

  run run_check

  [ "$status" -eq 1 ]
  [[ "$output" == *"did not write its report"* ]]
}

@test "a report that lists no files is an error, not a pass" {
  echo '{"problems": [], "repositories": {}}' > "$REPORT"

  run run_check

  [ "$status" -eq 1 ]
  [[ "$output" == *"lists no files at all"* ]]
}

@test "a file that names no image is an error, not a pass" {
  echo "FROM scratch" > "${REPO}/backend/Dockerfile"

  run run_check

  [ "$status" -eq 1 ]
  [[ "$output" == *"names no image the mirror copies"* ]]
}

@test "a file that is not there is an error" {
  rm "${REPO}/backend/Dockerfile"

  run run_check

  [ "$status" -eq 1 ]
  [[ "$output" == *"backend/Dockerfile does not exist"* ]]
}

@test "fails with no Dockerfile named" {
  cd "$REPO"

  run bash "$SCRIPT" "$REPORT" compose.ci.yml

  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage:"* ]]
}

@test "the workflow checks the files the mirror copies, and runs when one changes" {
  # A file the mirror copies and this does not check could lose its pin
  # with nothing to say so.
  ROOT="${BATS_TEST_DIRNAME}/../../.."
  workflow="${ROOT}/.github/workflows/renovate-tracks-images.yml"
  checked="$(grep -A3 'check-renovate-tracks-images.sh \\' "$workflow")"

  for file in compose.ci.yml backend/Dockerfile backend/Dockerfile.caption frontend/Dockerfile; do
    grep -q "$file" "${ROOT}/.github/workflows/mirror-images.yml"
    [[ "$checked" == *"${file}"* ]]
    grep -q "^      - \"${file}\"$" "$workflow"
  done

  grep -q '^      - "renovate.json"$' "$workflow"
}
