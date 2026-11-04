#!/usr/bin/env bats
# The framework pipeline installs pydantic and PyYAML by hand, pinned, so a
# framework repository's pull request is validated by the same loader the
# backend runs. A lock bump that left the workflow behind would validate
# with other versions, quietly. This checks each pin against
# backend/poetry.lock.

setup() {
  ROOT="${BATS_TEST_DIRNAME}/../../.."
  WORKFLOW="${ROOT}/.github/workflows/framework-pipeline.yml"
  LOCK="${ROOT}/backend/poetry.lock"
}

# The version poetry.lock records for a package.
locked() {
  local package="$1"

  awk -v name="name = \"${package}\"" '
    $0 == name { found = 1; next }
    found && /^version = / { gsub(/"/, "", $3); print $3; exit }
  ' "$LOCK"
}

# The version the workflow pins for a package.
pinned() {
  local package="$1"

  grep -oiE "${package}==[0-9.]+" "$WORKFLOW" | head -n 1 | cut -d= -f3
}

@test "pydantic is pinned to the backend's locked version" {
  [ -n "$(locked pydantic)" ]

  [ "$(pinned pydantic)" = "$(locked pydantic)" ]
}

@test "PyYAML is pinned to the backend's locked version" {
  [ -n "$(locked pyyaml)" ]

  [ "$(pinned pyyaml)" = "$(locked pyyaml)" ]
}
