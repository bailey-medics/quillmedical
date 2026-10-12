#!/usr/bin/env bash
# Starts the Postgres a compose file names, on its own and on port 5432,
# and waits until it answers.
#
# Usage: start-postgres.sh <compose-file> <service> <database> <user> <password>
#
# For a job that wants a database and nothing else from the compose file.
# The image is whatever the compose file would start for <service>, so it
# is this repository's own copy when use-mirrored-images.sh has pointed
# the variable there, and the public image when it has not.
#
# Why not a `services:` container: GitHub pulls those before the job's
# first step, so nothing can log in or choose the mirror first. They came
# from the public registry with no login, and on 12 October 2026 it
# refused one for asking too often, failing a check on a pull request
# with nothing wrong in it.
#
# Set START_POSTGRES_TRIES to change how many seconds it waits (60).
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "start-postgres"

CONTAINER="ci-postgres"

# Prints the image the compose file would start for a service, with any
# variable in it already filled in.
image_of() {
  local compose_file="$1"
  local service="$2"

  docker compose -f "$compose_file" config --format json |
    jq -r --arg service "$service" '.services[$service].image // empty'
}

# Succeeds once the container reports healthy, or fails after the tries
# run out.
wait_until_healthy() {
  local tries="$1"
  local status=""
  local attempt=0

  while [ "$attempt" -lt "$tries" ]; do
    status="$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || true)"
    if [ "$status" = "healthy" ]; then
      return 0
    fi

    attempt=$((attempt + 1))
    sleep 1
  done

  return 1
}

main() {
  local compose_file="${1:-}"
  local service="${2:-}"
  local database="${3:-}"
  local user="${4:-}"
  local password="${5:-}"
  local tries="${START_POSTGRES_TRIES:-60}"
  local image=""

  if [ "$#" -ne 5 ] || [ -z "$compose_file" ] || [ -z "$service" ] || [ -z "$database" ] || [ -z "$user" ] || [ -z "$password" ]; then
    error "Usage: start-postgres.sh <compose-file> <service> <database> <user> <password>"
    exit 1
  fi

  image="$(image_of "$compose_file" "$service")"
  if [ -z "$image" ]; then
    error "${compose_file} names no image for the service ${service}"
    exit 1
  fi

  log "Starting ${image}"
  docker run --detach --name "$CONTAINER" \
    --env "POSTGRES_DB=${database}" \
    --env "POSTGRES_USER=${user}" \
    --env "POSTGRES_PASSWORD=${password}" \
    --publish 5432:5432 \
    --tmpfs /var/lib/postgresql \
    --health-cmd "pg_isready -U ${user} -d ${database}" \
    --health-interval 2s \
    --health-timeout 3s \
    --health-retries 30 \
    "$image" >/dev/null

  if ! wait_until_healthy "$tries"; then
    error "Postgres did not answer within ${tries} seconds"
    docker logs "$CONTAINER" >&2 || true
    exit 1
  fi

  log "Postgres is answering on port 5432"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
