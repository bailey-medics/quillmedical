#!/usr/bin/env bats
# Tests for run-storybook-tests-in-image.sh
#
# yarn, python3, npx and docker are stubbed onto PATH, so nothing builds a
# real Storybook, serves one or pulls an image. Each stub records what it was
# asked for, and the python3 stub stays alive like the static server would,
# so the tests can check it is stopped afterwards.

bats_require_minimum_version 1.5.0

IMAGE="mcr.microsoft.com/playwright:v1.63.0-noble"

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/run-storybook-tests-in-image.sh"
  REPO="${BATS_TEST_TMPDIR}/repo"
  STUBS="${BATS_TEST_TMPDIR}/stubs"
  CALLS="${BATS_TEST_TMPDIR}/calls"
  mkdir -p "${REPO}/frontend" "$STUBS" "$CALLS"

  # The build. Fails when the test asks it to.
  cat > "${STUBS}/yarn" <<EOF
#!/usr/bin/env bash
echo "\$*" > "${CALLS}/yarn.args"
exit "\${YARN_EXIT:-0}"
EOF

  # Stands in for the static server: says where it is, then stays up.
  cat > "${STUBS}/python3" <<EOF
#!/usr/bin/env bash
echo "\$*" > "${CALLS}/server.args"
echo "server stub output"
echo \$\$ > "${CALLS}/server.pid"
exec sleep 300
EOF

  # wait-on. Fails when the test asks it to.
  cat > "${STUBS}/npx" <<EOF
#!/usr/bin/env bash
echo "\$*" > "${CALLS}/npx.args"
exit "\${NPX_EXIT:-0}"
EOF

  # Waits for the server stub to have started, so a test that checks it was
  # stopped is not racing it. Then exits as the test asks.
  cat > "${STUBS}/docker" <<EOF
#!/usr/bin/env bash
echo "\$*" > "${CALLS}/docker.args"
pwd > "${CALLS}/docker.cwd"
for _ in \$(seq 1 50); do
  [ -f "${CALLS}/server.pid" ] && break
  sleep 0.1
done
exit "\${DOCKER_EXIT:-0}"
EOF

  chmod +x "${STUBS}/yarn" "${STUBS}/python3" "${STUBS}/npx" "${STUBS}/docker"
  PATH="${STUBS}:${PATH}"
  cd "$REPO" || return
}

teardown() {
  if [ -f "${CALLS}/server.pid" ]; then
    kill "$(cat "${CALLS}/server.pid")" 2>/dev/null || true
  fi
}

@test "fails without an image, and starts nothing" {
  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage"* ]]
  [ ! -f "${CALLS}/yarn.args" ]
  [ ! -f "${CALLS}/docker.args" ]
}

@test "builds Storybook, serves the build and waits for it" {
  run bash "$SCRIPT" "$IMAGE" "2/3"

  [ "$status" -eq 0 ]
  [ "$(cat "${CALLS}/yarn.args")" = "storybook:build" ]
  [ "$(cat "${CALLS}/server.args")" = "-m http.server 6006 --bind 127.0.0.1 --directory ../docs/docs/code/storybook" ]
  [[ "$(cat "${CALLS}/npx.args")" == "wait-on http-get://127.0.0.1:6006/index.json"* ]]
}

@test "fails without serving or testing anything when the build fails" {
  YARN_EXIT=2 run bash "$SCRIPT" "$IMAGE" "2/3"

  [ "$status" -eq 2 ]
  [ ! -f "${CALLS}/server.args" ]
  [ ! -f "${CALLS}/docker.args" ]
}

@test "runs the test runner in the image, on the host network, from frontend" {
  run bash "$SCRIPT" "$IMAGE" "2/3"

  [ "$status" -eq 0 ]
  [[ "$(cat "${CALLS}/docker.args")" == "run "*"--network host"*" ${IMAGE} npx test-storybook --url http://127.0.0.1:6006 "* ]]
  [ "$(cat "${CALLS}/docker.cwd")" = "${REPO}/frontend" ]
}

@test "passes the shard to the test runner" {
  run bash "$SCRIPT" "$IMAGE" "2/3"

  [ "$status" -eq 0 ]
  [[ "$(cat "${CALLS}/docker.args")" == *"--shard=2/3" ]]
}

@test "runs every story when no shard is given" {
  run bash "$SCRIPT" "$IMAGE"

  [ "$status" -eq 0 ]
  [[ "$(cat "${CALLS}/docker.args")" != *"--shard"* ]]
}

@test "exits with the test runner's status when a test fails" {
  DOCKER_EXIT=3 run bash "$SCRIPT" "$IMAGE" "1/3"

  [ "$status" -eq 3 ]
}

@test "fails without running the tests when the build is never served, and prints the server's log" {
  NPX_EXIT=1 run bash "$SCRIPT" "$IMAGE" "1/3"

  [ "$status" -eq 1 ]
  [[ "$output" == *"was not served"* ]]
  [[ "$output" == *"server stub output"* ]]
  [ ! -f "${CALLS}/docker.args" ]
}

@test "stops the server once the tests have passed" {
  run bash "$SCRIPT" "$IMAGE" "1/3"

  [ "$status" -eq 0 ]
  run ! kill -0 "$(cat "${CALLS}/server.pid")"
}

@test "stops the server when a test fails too" {
  DOCKER_EXIT=1 run bash "$SCRIPT" "$IMAGE" "1/3"

  [ "$status" -eq 1 ]
  run ! kill -0 "$(cat "${CALLS}/server.pid")"
}
