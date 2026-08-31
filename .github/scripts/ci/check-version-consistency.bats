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
FROM python:3.13-slim
COPY .poetry-version ./
RUN pip install "poetry==$(cat .poetry-version)"
EOF

  cat > "${REPO}/backend/pyproject.toml" <<'EOF'
[tool.poetry]
requires-poetry = ">=2.4,<3"
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
