#!/usr/bin/env bats
# Tests for mirror-ref.sh
#
# The script that makes the copies and the script that uses them both take
# the name from here, so what matters is that the name pushed and the name
# pulled are the same image.

setup() {
  source "${BATS_TEST_DIRNAME}/mirror-ref.sh"

  POSTGRES="public.ecr.aws/docker/library/postgres:18-alpine"
  CADDY="public.ecr.aws/docker/library/caddy:2-alpine@sha256:abc123"
}

@test "a tagged image is pushed under its own name and tag" {
  run mirror_push_ref bailey-medics "$POSTGRES"

  [ "$output" = "ghcr.io/bailey-medics/mirror/postgres:18-alpine" ]
}

@test "a tagged image is pulled by the name it was pushed under" {
  [ "$(mirror_pull_ref bailey-medics "$POSTGRES")" = "$(mirror_push_ref bailey-medics "$POSTGRES")" ]
}

@test "the owner is put in lower case, as the registry wants" {
  run mirror_push_ref Bailey-Medics "$POSTGRES"

  [ "$output" = "ghcr.io/bailey-medics/mirror/postgres:18-alpine" ]
}

@test "a pinned image is pushed by its tag" {
  run mirror_push_ref bailey-medics "$CADDY"

  [ "$output" = "ghcr.io/bailey-medics/mirror/caddy:2-alpine" ]
}

@test "a pinned image is pulled by its digest, not its tag" {
  run mirror_pull_ref bailey-medics "$CADDY"

  [ "$output" = "ghcr.io/bailey-medics/mirror/caddy@sha256:abc123" ]
}

@test "a pinned image is copied from its digest alone" {
  run mirror_source_ref "$CADDY"

  [ "$output" = "public.ecr.aws/docker/library/caddy@sha256:abc123" ]
}

@test "a tagged image is copied from the reference as written" {
  run mirror_source_ref "$POSTGRES"

  [ "$output" = "$POSTGRES" ]
}

@test "an image with no tag is pushed as latest" {
  run mirror_push_ref bailey-medics "docker.io/library/redis"

  [ "$output" = "ghcr.io/bailey-medics/mirror/redis:latest" ]
}

@test "a port in the registry's name is not taken for a tag" {
  run mirror_push_ref bailey-medics "localhost:5000/library/redis"

  [ "$output" = "ghcr.io/bailey-medics/mirror/redis:latest" ]
}
