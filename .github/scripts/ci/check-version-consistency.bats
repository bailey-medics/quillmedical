#!/usr/bin/env bats
# Tests for check-version-consistency.sh
#
# The script reads fixed paths relative to the working directory, so each test
# builds a miniature repository in a temp directory and runs from there. That
# keeps the real config files out of it: a test must not pass or fail because
# somebody bumped a version.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/check-version-consistency.sh"
  REPO="${BATS_TEST_TMPDIR}/repo"
  mkdir -p "${REPO}/backend/app/features/teaching/tooling" \
           "${REPO}/frontend" \
           "${REPO}/.github/actions/setup-frontend"

  echo "3.13.7" > "${REPO}/.python-version"
  echo "2.4.2" > "${REPO}/.poetry-version"

  cat > "${REPO}/backend/Dockerfile" <<'EOF'
ARG PYTHON_IMAGE=registry.example/library/python:3.13-slim@sha256:aaa111
FROM ${PYTHON_IMAGE} AS base
COPY .poetry-version ./
RUN pip install "poetry==$(cat .poetry-version)"
EOF

  cat > "${REPO}/backend/pyproject.toml" <<'EOF'
[tool.poetry]
requires-poetry = ">=2.4,<3"
[tool.ruff]
target-version = "py313"
line-length = 79
[tool.black]
target-version = ["py313"]
[tool.mypy]
python_version = "3.13"
EOF

  cat > "${REPO}/backend/app/features/teaching/tooling/pyproject.toml" <<'EOF'
[tool.poetry]
requires-poetry = ">=2.4,<3"
EOF

  cat > "${REPO}/renovate.json" <<'EOF'
{ "constraints": { "poetry": "2.4.2" } }
EOF

  # The shell test image, built on the image the backend is built on.
  printf 'FROM registry.example/library/python:3.13-slim@sha256:aaa111\nARG BATS_VERSION=1.14.0\n' \
    > "${REPO}/.github/Dockerfile"

  echo "FROM node:24-slim" > "${REPO}/frontend/Dockerfile"
  printf "runs:\n  steps:\n    - with:\n        node-version: '24'\n" \
    > "${REPO}/.github/actions/setup-frontend/action.yml"
}

run_check() {
  cd "$REPO" || return 1
  bash "$SCRIPT"
}

@test "passes when every pin agrees" {
  run run_check
  [ "$status" -eq 0 ]
  [[ "$output" == *"All pinned versions are consistent"* ]]
}

@test "fails when .poetry-version is missing" {
  rm "${REPO}/.poetry-version"
  run run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *".poetry-version is missing or empty"* ]]
}

@test "fails when .poetry-version is empty" {
  : > "${REPO}/.poetry-version"
  run run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *".poetry-version is missing or empty"* ]]
}

@test "fails when the backend constraint lags the pin" {
  sed -i.bak 's/>=2.4,<3/>=2.1,<3/' "${REPO}/backend/pyproject.toml"
  run run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *"backend/pyproject.toml requires '>=2.1'"* ]]
}

@test "fails when the tooling constraint lags the pin" {
  sed -i.bak 's/>=2.4,<3/>=2.1,<3/' \
    "${REPO}/backend/app/features/teaching/tooling/pyproject.toml"
  run run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *"tooling/pyproject.toml requires '>=2.1'"* ]]
}

@test "fails when a consumer declares no constraint at all" {
  echo "[tool.poetry]" > "${REPO}/backend/app/features/teaching/tooling/pyproject.toml"
  run run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *"No requires-poetry lower bound"* ]]
}

@test "fails when the Dockerfile hardcodes a version instead of reading the file" {
  echo 'RUN pip install "poetry==2.1.3"' >> "${REPO}/backend/Dockerfile"
  run run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *"hardcoded instead of read"* ]]
  [[ "$output" == *"backend/Dockerfile"* ]]
}

@test "fails when a workflow hardcodes a version" {
  mkdir -p "${REPO}/.github/workflows"
  echo 'run: pip install "poetry==2.1.3"' > "${REPO}/.github/workflows/x.yml"
  run run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *"hardcoded instead of read"* ]]
}

@test "reading the version from the file is not mistaken for hardcoding" {
  # The Dockerfile already contains poetry==$(cat .poetry-version).
  run run_check
  [ "$status" -eq 0 ]
}

@test "a hardcoded version inside a test file is not flagged" {
  # A .bats file needs the literal string as a fixture and installs nothing,
  # so this check must not trip over the tests that prove it works.
  mkdir -p "${REPO}/.github/scripts/ci"
  echo 'echo "poetry==2.1.3"' > "${REPO}/.github/scripts/ci/some-check.bats"
  run run_check
  [ "$status" -eq 0 ]
}

@test "fails when renovate.json pins a different Poetry" {
  # Renovate runs in its own container and cannot read .poetry-version, so
  # its pin is a second copy of the version and has to be kept in step.
  echo '{ "constraints": { "poetry": "2.3.3" } }' > "${REPO}/renovate.json"
  run run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *"renovate.json pins '2.3.3'"* ]]
}

@test "finds the pin whatever order the constraints are listed in" {
  # A line-window grep missed it as soon as another constraint came first,
  # and called a correct config a missing one.
  cat > "${REPO}/renovate.json" <<'EOF'
{
  "constraints": {
    "python": "3.13.7",
    "npm": "10",
    "poetry": "2.4.2"
  }
}
EOF
  run run_check
  [ "$status" -eq 0 ]
}

@test "fails when renovate.json pins no Poetry at all" {
  echo '{ "extends": ["config:recommended"] }' > "${REPO}/renovate.json"
  run run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *"No constraints.poetry"* ]]
}

@test "a hardcoded version in a real script is still flagged" {
  mkdir -p "${REPO}/.github/scripts/ci"
  echo 'pip install "poetry==2.1.3"' > "${REPO}/.github/scripts/ci/some-check.sh"
  run run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *"hardcoded instead of read"* ]]
}

@test "fails when the setup action's Node differs from the Dockerfile" {
  printf "runs:\n  steps:\n    - with:\n        node-version: '22'\n" \
    > "${REPO}/.github/actions/setup-frontend/action.yml"
  run run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *"Node major mismatch"* ]]
  [[ "$output" == *"setup-frontend/action.yml is '22'"* ]]
}

@test "fails when a workflow sets up its own, different Node" {
  # The pin that went unchecked: a workflow with its own setup-node step,
  # written with double quotes where the action uses single.
  mkdir -p "${REPO}/.github/workflows"
  printf 'jobs:\n  a:\n    steps:\n      - with:\n          node-version: "22"\n' \
    > "${REPO}/.github/workflows/dependency-audit.yml"
  run run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *"dependency-audit.yml is '22'"* ]]
}

@test "passes when a workflow's own Node agrees" {
  mkdir -p "${REPO}/.github/workflows"
  printf 'jobs:\n  a:\n    steps:\n      - with:\n          node-version: "24"\n' \
    > "${REPO}/.github/workflows/dependency-audit.yml"
  run run_check
  [ "$status" -eq 0 ]
}

@test "fails when nothing under .github names a Node version" {
  rm "${REPO}/.github/actions/setup-frontend/action.yml"
  run run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *"No node-version found"* ]]
}

@test "a Python mismatch still fails, alongside the Poetry checks" {
  echo "3.12.0" > "${REPO}/.python-version"
  run run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *"Python minor mismatch"* ]]
}

@test "every mismatch is reported, not just the first" {
  echo "3.12.0" > "${REPO}/.python-version"
  sed -i.bak 's/>=2.4,<3/>=2.1,<3/' "${REPO}/backend/pyproject.toml"
  run run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *"Python minor mismatch"* ]]
  [[ "$output" == *"Poetry minor mismatch"* ]]
}

@test "names every place that agrees on Python" {
  run run_check

  [ "$status" -eq 0 ]
  [[ "$output" == *"Ruff: 3.13, Black: 3.13, .github/Dockerfile: 3.13"* ]]
}

@test "fails when Ruff targets an older Python than the pin" {
  # Where both formatters sat for a while after the backend moved on.
  sed -i.bak 's/^target-version = "py313"/target-version = "py312"/' \
    "${REPO}/backend/pyproject.toml"

  run run_check

  [ "$status" -eq 1 ]
  [[ "$output" == *"(Ruff target-version) is '3.12' but .python-version is '3.13'"* ]]
  [[ "$output" != *"(Black target-version) is"* ]]
}

@test "fails when Black targets a newer Python than the pin" {
  # The dangerous way round: Black then writes syntax the pinned Python
  # cannot read.
  sed -i.bak 's/^target-version = \["py313"\]/target-version = ["py314"]/' \
    "${REPO}/backend/pyproject.toml"

  run run_check

  [ "$status" -eq 1 ]
  [[ "$output" == *"(Black target-version) is '3.14' but .python-version is '3.13'"* ]]
  [[ "$output" != *"(Ruff target-version) is"* ]]
}

@test "fails when Ruff's target line is gone, and says so" {
  sed -i.bak '/^target-version = "py313"/d' "${REPO}/backend/pyproject.toml"

  run run_check

  [ "$status" -eq 1 ]
  [[ "$output" == *"Python minor not found: backend/pyproject.toml (Ruff target-version) names no version"* ]]
}

@test "fails when Black's target line is gone, and says so" {
  sed -i.bak '/^target-version = \["py313"\]/d' "${REPO}/backend/pyproject.toml"

  run run_check

  [ "$status" -eq 1 ]
  [[ "$output" == *"Python minor not found: backend/pyproject.toml (Black target-version) names no version"* ]]
}

@test "does not take one formatter's target for the other's" {
  # Only Ruff has a target, under its own heading and further down the
  # file than Black's. Black must not be credited with it.
  cat > "${REPO}/backend/pyproject.toml" <<'EOF'
[tool.poetry]
requires-poetry = ">=2.4,<3"
[tool.black]
line-length = 79
[tool.ruff]
target-version = "py313"
[tool.mypy]
python_version = "3.13"
EOF

  run run_check

  [ "$status" -eq 1 ]
  [[ "$output" == *"(Black target-version) names no version"* ]]
  [[ "$output" != *"(Ruff target-version)"*"names no version"* ]]
}

@test "reads a target for a Python with a two-digit minor version" {
  echo "3.14.7" > "${REPO}/.python-version"
  sed -i.bak -e 's/py313/py314/' -e 's/python_version = "3.13"/python_version = "3.14"/' \
    "${REPO}/backend/pyproject.toml"
  sed -i.bak 's/python:3.13/python:3.14/' "${REPO}/backend/Dockerfile"
  sed -i.bak 's/python:3.13/python:3.14/' "${REPO}/.github/Dockerfile"

  run run_check

  [ "$status" -eq 0 ]
  [[ "$output" == *"Ruff: 3.14, Black: 3.14"* ]]
}

@test "fails when the shell test image is built on another Python" {
  sed -i.bak 's/python:3.13/python:3.12/' "${REPO}/.github/Dockerfile"

  run run_check

  [ "$status" -eq 1 ]
  [[ "$output" == *".github/Dockerfile (base image) is '3.12' but .python-version is '3.13'"* ]]
}

@test "fails when the shell test image is built on no Python image at all" {
  printf 'FROM ubuntu\nARG BATS_VERSION=1.14.0\n' > "${REPO}/.github/Dockerfile"

  run run_check

  [ "$status" -eq 1 ]
  [[ "$output" == *".github/Dockerfile (base image) names no version"* ]]
}

@test "fails when the shell test image is the right Python but not the backend's image" {
  # The same tag at another digest: a different build of that Python,
  # and a second image for somebody to keep up to date.
  sed -i.bak 's/sha256:aaa111/sha256:bbb222/' "${REPO}/.github/Dockerfile"

  run run_check

  [ "$status" -eq 1 ]
  [[ "$output" == *"Base image mismatch"* ]]
  [[ "$output" == *"sha256:bbb222"* ]]
  [[ "$output" != *"Python minor mismatch"* ]]
}

@test "fails when the backend moves to a new image and the shell test image stays" {
  sed -i.bak 's/sha256:aaa111/sha256:ccc333/' "${REPO}/backend/Dockerfile"

  run run_check

  [ "$status" -eq 1 ]
  [[ "$output" == *"Base image mismatch"* ]]
}
