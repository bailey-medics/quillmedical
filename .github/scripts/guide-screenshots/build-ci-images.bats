#!/usr/bin/env bats
# Tests for build-ci-images.sh
#
# docker is stubbed and records its arguments, because what matters here is
# that each mirrored base image reaches the build as a build argument.

bats_require_minimum_version 1.5.0

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/build-ci-images.sh"
  CALLS="${BATS_TEST_TMPDIR}/docker-calls"
  : > "$CALLS"

  STUB_DIR="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "$STUB_DIR"
  cat > "${STUB_DIR}/docker" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "${CALLS}"
EOF
  chmod +x "${STUB_DIR}/docker"
  PATH="${STUB_DIR}:${PATH}"
}

@test "fails without a compose file" {
  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No compose file given"* ]]
  [ ! -s "$CALLS" ]
}

@test "passes each line as a build argument" {
  local args
  args="$(printf '%s\n%s' "PYTHON_IMAGE=ghcr.io/o/mirror/python@sha256:a" "NODE_IMAGE=ghcr.io/o/mirror/node@sha256:b")"

  run bash "$SCRIPT" compose.ci.yml "$args"

  [ "$status" -eq 0 ]
  [ "$(cat "$CALLS")" = "compose -f compose.ci.yml build --build-arg PYTHON_IMAGE=ghcr.io/o/mirror/python@sha256:a --build-arg NODE_IMAGE=ghcr.io/o/mirror/node@sha256:b" ]
}

@test "skips blank lines" {
  local args
  args="$(printf '\n%s\n\n' "PYTHON_IMAGE=ghcr.io/o/mirror/python@sha256:a")"

  run bash "$SCRIPT" compose.ci.yml "$args"

  [ "$status" -eq 0 ]
  [ "$(cat "$CALLS")" = "compose -f compose.ci.yml build --build-arg PYTHON_IMAGE=ghcr.io/o/mirror/python@sha256:a" ]
}

@test "builds on the public images when given no build arguments" {
  run bash "$SCRIPT" compose.ci.yml ""

  [ "$status" -eq 0 ]
  [[ "$output" == *"building on the public base images"* ]]
  [ "$(cat "$CALLS")" = "compose -f compose.ci.yml build" ]
}

@test "fails when the build fails" {
  cat > "${STUB_DIR}/docker" <<'EOF'
#!/usr/bin/env bash
exit 3
EOF

  run bash "$SCRIPT" compose.ci.yml ""

  [ "$status" -eq 3 ]
}
