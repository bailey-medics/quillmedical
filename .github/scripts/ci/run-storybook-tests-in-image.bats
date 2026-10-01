#!/usr/bin/env bats
# Tests for run-storybook-tests-in-image.sh
#
# yarn, npx and docker are stubbed onto PATH, so nothing starts a real
# Storybook or pulls an image. Each stub records what it was asked for, and
# the yarn stub stays alive like a dev server would, so the tests can check
# it is stopped afterwards.

bats_require_minimum_version 1.5.0

IMAGE="mcr.microsoft.com/playwright:v1.63.0-noble"

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/run-storybook-tests-in-image.sh"
  REPO="${BATS_TEST_TMPDIR}/repo"
  STUBS="${BATS_TEST_TMPDIR}/stubs"
  CALLS="${BATS_TEST_TMPDIR}/calls"
  mkdir -p "${REPO}/frontend" "$STUBS" "$CALLS"

  # Stands in for the dev server: says where it is, then stays up.
  cat > "${STUBS}/yarn" <<EOF
#!/usr/bin/env bash
echo "\$*" > "${CALLS}/yarn.args"
echo "storybook stub output"
echo \$\$ > "${CALLS}/yarn.pid"
exec sleep 300
EOF

  # wait-on. Fails when the test asks it to.
  cat > "${STUBS}/npx" <<EOF
#!/usr/bin/env bash
echo "\$*" > "${CALLS}/npx.args"
exit "\${NPX_EXIT:-0}"
EOF

  # Waits for the yarn stub to have started, so a test that checks it was
  # stopped is not racing it. Then exits as the test asks.
  cat > "${STUBS}/docker" <<EOF
#!/usr/bin/env bash
echo "\$*" > "${CALLS}/docker.args"
pwd > "${CALLS}/docker.cwd"
for _ in \$(seq 1 50); do
  [ -f "${CALLS}/yarn.pid" ] && break
  sleep 0.1
done
exit "\${DOCKER_EXIT:-0}"
EOF

  chmod +x "${STUBS}/yarn" "${STUBS}/npx" "${STUBS}/docker"
  PATH="${STUBS}:${PATH}"
  cd "$REPO"
}

teardown() {
  if [ -f "${CALLS}/yarn.pid" ]; then
    kill "$(cat "${CALLS}/yarn.pid")" 2>/dev/null || true
  fi
}

@test "fails without an image, and starts nothing" {
  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage"* ]]
  [ ! -f "${CALLS}/yarn.args" ]
  [ ! -f "${CALLS}/docker.args" ]
}

@test "starts Storybook on the runner and waits for it" {
  run bash "$SCRIPT" "$IMAGE" "2/3"

  [ "$status" -eq 0 ]
  [ "$(cat "${CALLS}/yarn.args")" = "storybook --no-open --quiet --ci" ]
  [[ "$(cat "${CALLS}/npx.args")" == "wait-on http-get://127.0.0.1:6006/index.json"* ]]
}

@test "runs the test runner in the image, on the host network, from frontend" {
  run bash "$SCRIPT" "$IMAGE" "2/3"

  [ "$status" -eq 0 ]
  [[ "$(cat "${CALLS}/docker.args")" == "run "*"--network host"*" ${IMAGE} npx test-storybook "* ]]
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

@test "fails without running the tests when Storybook never comes up, and prints its log" {
  NPX_EXIT=1 run bash "$SCRIPT" "$IMAGE" "1/3"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Storybook did not come up"* ]]
  [[ "$output" == *"storybook stub output"* ]]
  [ ! -f "${CALLS}/docker.args" ]
}

@test "stops Storybook once the tests have passed" {
  run bash "$SCRIPT" "$IMAGE" "1/3"

  [ "$status" -eq 0 ]
  run ! kill -0 "$(cat "${CALLS}/yarn.pid")"
}

@test "stops Storybook when a test fails too" {
  DOCKER_EXIT=1 run bash "$SCRIPT" "$IMAGE" "1/3"

  [ "$status" -eq 1 ]
  run ! kill -0 "$(cat "${CALLS}/yarn.pid")"
}
