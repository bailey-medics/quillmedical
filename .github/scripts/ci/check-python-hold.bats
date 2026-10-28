#!/usr/bin/env bats
# Tests for check-python-hold.sh
#
# Ordered to follow the script: working out the minor, reading the lock
# files, deciding about one release's files, then main. PyPI is stubbed
# throughout, through fetch_release_files.
#
# The point of this script is to break a silence, so the tests care most
# about the ways it could stay quiet when it should not, and about not
# reporting a minor ready while one package still has no wheel.

# shellcheck disable=SC2329,SC2030,SC2031

setup() {
  source "${BATS_TEST_DIRNAME}/check-python-hold.sh"
  unset GITHUB_OUTPUT HELD_MINOR

  cd "$BATS_TEST_TMPDIR"
  mkdir -p backend/app/features/teaching/tooling
  echo "3.14.7" >.python-version
}

# Writes a lock file holding the "name version" pairs given.
write_lock() {
  local path="$1"
  shift
  local name version

  : >"$path"
  while [ "$#" -gt 0 ]; do
    name="$1"
    version="$2"
    shift 2
    printf '[[package]]\nname = "%s"\nversion = "%s"\ndescription = "x"\n\n' \
      "$name" "$version" >>"$path"
  done
}

@test "next_minor moves the minor on by one" {
  run next_minor "3.14.7"

  [ "$output" = "3.15" ]
}

@test "next_minor prints nothing for a version it cannot read" {
  run next_minor "three"

  [ -z "$output" ]
}

@test "locked_packages lists each package once across both lock files" {
  write_lock backend/poetry.lock pydantic 2.14.1 pygit2 1.20.1
  write_lock backend/app/features/teaching/tooling/poetry.lock pydantic 2.14.1

  run locked_packages backend/poetry.lock \
    backend/app/features/teaching/tooling/poetry.lock

  [ "${lines[0]}" = "pydantic 2.14.1" ]
  [ "${lines[1]}" = "pygit2 1.20.1" ]
  [ "${#lines[@]}" -eq 2 ]
}

@test "a release with only a source archive is ready" {
  run wheel_status 3.15 <<<"http_ece-1.2.1.tar.gz"

  [ "$output" = "ready" ]
}

@test "a pure Python wheel is ready" {
  run wheel_status 3.15 <<<"alembic-1.20.1-py3-none-any.whl"

  [ "$output" = "ready" ]
}

@test "a binary wheel with no Python ABI is ready" {
  run wheel_status 3.15 \
    <<<"ruff-0.17.3-py3-none-manylinux_2_17_x86_64.manylinux2014_x86_64.whl"

  [ "$output" = "ready" ]
}

@test "a compiled release with a wheel for the minor is ready" {
  run wheel_status 3.15 <<<"pydantic_core-2.50.1-cp314-cp314-manylinux_2_17_x86_64.whl
pydantic_core-2.50.1-cp315-cp315-manylinux_2_17_x86_64.whl"

  [ "$output" = "ready" ]
}

@test "a compiled release with wheels only for older minors is missing" {
  # pygit2 1.20.1 as it stands today.
  run wheel_status 3.15 <<<"pygit2-1.20.1-cp313-cp313-manylinux_2_28_x86_64.whl
pygit2-1.20.1-cp314-cp314-manylinux_2_28_x86_64.whl
pygit2-1.20.1.tar.gz"

  [ "$output" = "missing" ]
}

@test "a wheel for the minor on another platform does not count" {
  run wheel_status 3.15 <<<"pygit2-1.20.1-cp315-cp315-macosx_11_0_arm64.whl
pygit2-1.20.1-cp315-cp315-manylinux_2_28_aarch64.whl"

  [ "$output" = "missing" ]
}

@test "a free-threaded wheel does not count for the ordinary build" {
  run wheel_status 3.15 <<<"pygit2-1.20.1-cp315-cp315t-manylinux_2_28_x86_64.whl"

  [ "$output" = "missing" ]
}

@test "a stable ABI wheel from an earlier minor is ready" {
  run wheel_status 3.15 \
    <<<"cryptography-50.0.2-cp311-abi3-manylinux_2_34_x86_64.whl"

  [ "$output" = "ready" ]
}

@test "a stable ABI wheel from a later minor is missing" {
  run wheel_status 3.15 \
    <<<"cryptography-50.0.2-cp316-abi3-manylinux_2_34_x86_64.whl"

  [ "$output" = "missing" ]
}

@test "errors when a lock file is missing" {
  write_lock backend/poetry.lock pydantic 2.14.1

  run main

  [ "$status" -eq 1 ]
  [[ "$output" == *"Lock file not found"* ]]
}

@test "errors when PyPI cannot be read" {
  write_lock backend/poetry.lock pydantic 2.14.1
  write_lock backend/app/features/teaching/tooling/poetry.lock pydantic 2.14.1
  fetch_release_files() { return 1; }

  run main

  [ "$status" -eq 1 ]
  [[ "$output" == *"Could not read pydantic 2.14.1 from PyPI"* ]]
}

@test "stays quiet and names the package while one has no wheel" {
  write_lock backend/poetry.lock alembic 1.20.1 pygit2 1.20.1
  write_lock backend/app/features/teaching/tooling/poetry.lock alembic 1.20.1
  fetch_release_files() {
    case "$1" in
      alembic) echo "alembic-1.20.1-py3-none-any.whl" ;;
      pygit2) echo "pygit2-1.20.1-cp314-cp314-manylinux_2_28_x86_64.whl" ;;
    esac
  }

  run main

  [ "$status" -eq 0 ]
  [[ "$output" == *"Python 3.15 is still held"* ]]
  [[ "$output" == *"pygit2 1.20.1"* ]]
  [[ "$output" != *"now ships"* ]]
}

@test "does not wait for a package that builds without a wheel" {
  write_lock backend/poetry.lock pyyaml 6.0.3
  write_lock backend/app/features/teaching/tooling/poetry.lock pyyaml 6.0.3
  fetch_release_files() {
    echo "pyyaml-6.0.3-cp314-cp314-manylinux_2_17_x86_64.whl"
  }

  run main

  [ "$status" -eq 0 ]
  [[ "$output" == *"now ships a wheel for Python 3.15"* ]]
}

@test "reports when every compiled package has a wheel" {
  write_lock backend/poetry.lock pygit2 1.21.0
  write_lock backend/app/features/teaching/tooling/poetry.lock pygit2 1.21.0
  fetch_release_files() {
    echo "pygit2-1.21.0-cp315-cp315-manylinux_2_28_x86_64.whl"
  }

  run main

  [ "$status" -eq 0 ]
  [[ "$output" == *"now ships a wheel for Python 3.15"* ]]
}

@test "checks the minor given in HELD_MINOR instead" {
  write_lock backend/poetry.lock pygit2 1.20.1
  write_lock backend/app/features/teaching/tooling/poetry.lock pygit2 1.20.1
  fetch_release_files() {
    echo "pygit2-1.20.1-cp314-cp314-manylinux_2_28_x86_64.whl"
  }
  export HELD_MINOR=3.14

  run main

  [ "$status" -eq 0 ]
  [[ "$output" == *"wheel for Python 3.14"* ]]
}

@test "writes an empty liftable output and the minor while held" {
  write_lock backend/poetry.lock pygit2 1.20.1
  write_lock backend/app/features/teaching/tooling/poetry.lock pygit2 1.20.1
  fetch_release_files() {
    echo "pygit2-1.20.1-cp314-cp314-manylinux_2_28_x86_64.whl"
  }
  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/output"
  : >"$GITHUB_OUTPUT"

  run main

  [ "$status" -eq 0 ]
  run cat "$GITHUB_OUTPUT"
  [[ "$output" == *"minor=3.15"* ]]
  [ "${lines[1]}" = "liftable<<PYTHON_HOLD_EOF" ]
  [ "${lines[2]}" = "PYTHON_HOLD_EOF" ]
}

@test "refuses to write a report containing the output delimiter" {
  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/output"
  : >"$GITHUB_OUTPUT"

  run publish_step_output "PYTHON_HOLD_EOF" 3.15

  [ "$status" -eq 1 ]
  [[ "$output" == *"refusing to write it"* ]]
}
