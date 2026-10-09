#!/usr/bin/env bash
# Fails if the backend's production image holds test code.
#
# Usage: check-no-tests-in-image.sh <image>
#
# A backend test may live beside the module it tests, under backend/app/,
# named <module>_test.py. backend/Dockerfile copies backend/app whole, and
# the root .dockerignore is what keeps those tests, and backend/conftest.py,
# out of the image. This looks inside the built image and fails if the rule
# has stopped working: a pattern mistyped, a file renamed, a Dockerfile that
# copies from somewhere new.
#
# It also fails if it finds no application code where it looks. A check
# that looks in the wrong place finds no tests there and passes for ever,
# which is how a security scan here went a year checking nothing. See
# docs/docs/plans/2026-10-09-tests-beside-the-source-plan.md.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "check-no-tests-in-image"

#: Where backend/Dockerfile puts backend/app.
readonly APP_DIR="/app/app"

# Lists what the image holds, one path to a line: every Python file under
# the application folder, and a conftest.py beside it if there is one.
# Its own function so the tests can stand in for Docker.
list_image_files() {
  local image="$1"

  docker run --rm --entrypoint sh "$image" -c \
    "find ${APP_DIR} -name '*.py'; ls /app/conftest.py 2>/dev/null || true"
}

# Reads a listing on stdin and decides. Prints what it found.
check_listing() {
  local listing=""
  listing="$(cat)"

  if ! grep -qx "${APP_DIR}/main.py" <<<"$listing"; then
    error "No ${APP_DIR}/main.py in the image: looked in the wrong place, so nothing was checked"
    return 1
  fi

  local tests=""
  tests="$(grep -E '(_test\.py|/conftest\.py)$' <<<"$listing" || true)"

  if [ -n "$tests" ]; then
    error "Test code is in the production image:"
    # shellcheck disable=SC2001
    sed 's/^/    /' <<<"$tests" >&2
    error "The root .dockerignore should keep these out"
    return 1
  fi

  log "$(grep -c '\.py$' <<<"$listing") Python files in the image, none of them tests"
}

main() {
  local image="${1:-}"

  if [ -z "$image" ]; then
    error "Usage: check-no-tests-in-image.sh <image>"
    exit 1
  fi

  list_image_files "$image" | check_listing
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
