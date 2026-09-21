#!/usr/bin/env bats
# Tests for find-placeholder-services.sh — decides which services still run
# the Cloud Run placeholder and therefore need deploying regardless of what
# the paths filter said.
#
# `service_image` is stubbed so the decision logic can be tested without
# gcloud or network access. GITHUB_OUTPUT points at a temporary file, which
# is what the workflow reads the answers from.

# shellcheck disable=SC2329

setup() {
  source "${BATS_TEST_DIRNAME}/find-placeholder-services.sh"
  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/output"
  : > "$GITHUB_OUTPUT"
}

@test "reports true for a service on the placeholder image" {
  service_image() { echo "gcr.io/cloudrun/hello:latest"; }
  run main proj europe-west2 app backend
  [ "$status" -eq 0 ]
  grep -qx "backend=true" "$GITHUB_OUTPUT"
}

@test "reports false for a service on a real image" {
  service_image() { echo "europe-west2-docker.pkg.dev/proj/quill/backend:abc123"; }
  run main proj europe-west2 app backend
  [ "$status" -eq 0 ]
  grep -qx "backend=false" "$GITHUB_OUTPUT"
}

@test "matches the placeholder by name, not by exact tag" {
  service_image() { echo "gcr.io/cloudrun/hello@sha256:0123456789abcdef"; }
  run main proj europe-west2 app backend
  [ "$status" -eq 0 ]
  grep -qx "backend=true" "$GITHUB_OUTPUT"
}

@test "treats an unreadable service as not a placeholder" {
  # A transient API error must not force a deploy nobody asked for.
  service_image() { echo ""; }
  run main proj europe-west2 app backend
  [ "$status" -eq 0 ]
  grep -qx "backend=false" "$GITHUB_OUTPUT"
  [[ "$output" == *"no image found"* ]]
}

@test "checks backend and frontend when no services are named" {
  service_image() { echo "gcr.io/cloudrun/hello:latest"; }
  run main proj europe-west2 app
  [ "$status" -eq 0 ]
  grep -qx "backend=true" "$GITHUB_OUTPUT"
  grep -qx "frontend=true" "$GITHUB_OUTPUT"
}

@test "decides each service independently" {
  service_image() {
    case "$1" in
      *backend*) echo "europe-west2-docker.pkg.dev/proj/quill/backend:abc123" ;;
      *) echo "gcr.io/cloudrun/hello:latest" ;;
    esac
  }
  run main proj europe-west2 app
  [ "$status" -eq 0 ]
  grep -qx "backend=false" "$GITHUB_OUTPUT"
  grep -qx "frontend=true" "$GITHUB_OUTPUT"
}

@test "names the service it is describing, including the environment" {
  service_image() { echo "$1"; }
  run main proj europe-west2 teaching backend
  [ "$status" -eq 0 ]
  [[ "$output" == *"quill-backend-teaching"* ]]
}

@test "fails with usage when required arguments are missing" {
  run main proj europe-west2
  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage:"* ]]
}
