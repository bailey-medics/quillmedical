#!/usr/bin/env bats
# Tests for session-start.sh
#
# The hook's job is to leave the session usable whatever happens, so these
# cover the two things that would hurt if they regressed: it must never exit
# non-zero and abort the session, and when the dev stack fails it must say
# why in terms of the setting that needs changing.
#
# Docker is stubbed throughout. Starting a real daemon here would test the
# environment rather than the hook.

setup() {
    HOOK="${BATS_TEST_DIRNAME}/session-start.sh"

    # A throwaway project directory, so the hook's .env copying never touches
    # the real checkout.
    PROJECT="${BATS_TEST_TMPDIR}/project"
    mkdir -p "${PROJECT}/backend" "${PROJECT}/frontend"
    touch "${PROJECT}/.env-sample" \
        "${PROJECT}/backend/.env-sample" \
        "${PROJECT}/frontend/.env-sample"

    STUBS="${BATS_TEST_TMPDIR}/stubs"
    mkdir -p "$STUBS"

    export CLAUDE_CODE_REMOTE=true
    export CLAUDE_PROJECT_DIR="$PROJECT"
    export SESSION_START_LOG_DIR="${BATS_TEST_TMPDIR}/logs"
    mkdir -p "$SESSION_START_LOG_DIR"

    # Keep the tooling steps quiet and instant; they are not what is under
    # test. `bats` is deliberately not stubbed — shadowing it would break the
    # runner executing these tests — and the hook only reaches for npm when
    # bats is missing, which under bats it never is.
    stub pre-commit 'exit 0'
    stub npm 'exit 0'
    stub just 'exit 0'
    stub dockerd 'exit 0'

    PATH="${STUBS}:${PATH}"
    export PATH
}

# Writes an executable stub named $1 whose body is $2.
stub() {
    local name="$1"
    local body="$2"
    printf '#!/usr/bin/env bash\n%s\n' "$body" >"${STUBS}/${name}"
    chmod +x "${STUBS}/${name}"
}

# Stubs `docker` so that the daemon is up and `compose up` fails, printing
# $1 as the Compose output the hook then has to interpret.
stub_failing_stack() {
    local message="$1"
    stub docker "
case \"\$1\" in
  info) exit 0 ;;
  compose) echo '${message}'; exit 1 ;;
esac
exit 0
"
}

@test "does nothing outside Claude Code on the web" {
    export CLAUDE_CODE_REMOTE=false
    stub docker 'echo "docker should not have been called"; exit 1'

    run "$HOOK"

    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "materialises the .env files from the samples" {
    stub docker 'exit 0'

    run "$HOOK"

    [ "$status" -eq 0 ]
    [ -f "${PROJECT}/.env" ]
    [ -f "${PROJECT}/backend/.env" ]
    [ -f "${PROJECT}/frontend/.env" ]
}

@test "leaves an existing .env alone" {
    printf 'KEEP=me\n' >"${PROJECT}/.env"
    stub docker 'exit 0'

    run "$HOOK"

    [ "$status" -eq 0 ]
    [ "$(cat "${PROJECT}/.env")" = "KEEP=me" ]
}

@test "reports the running services when the stack comes up" {
    stub docker '
case "$1" in
  info) exit 0 ;;
  compose)
    for arg in "$@"; do
      if [ "$arg" = "ps" ]; then printf "backend\nfrontend\n"; exit 0; fi
    done
    exit 0
    ;;
esac
exit 0
'

    run "$HOOK"

    [ "$status" -eq 0 ]
    [[ "$output" == *"dev stack is up"* ]]
    [[ "$output" == *"backend"* ]]
    [[ "$output" == *"frontend"* ]]
}

@test "still exits zero when the dev stack fails to start" {
    stub_failing_stack "something went wrong"

    run "$HOOK"

    [ "$status" -eq 0 ]
    [[ "$output" == *"could not start the dev stack"* ]]
}

@test "explains a blocked image pull in terms of the egress policy" {
    stub_failing_stack \
        'failed to do request: Get "https://production.cloudfront.docker.com/x": Forbidden'

    run "$HOOK"

    [ "$status" -eq 0 ]
    [[ "$output" == *"refused by this session's egress policy"* ]]
    [[ "$output" == *"production.cloudfront.docker.com"* ]]
}

@test "does not blame the egress policy for an unrelated failure" {
    stub_failing_stack "port is already allocated"

    run "$HOOK"

    [ "$status" -eq 0 ]
    [[ "$output" == *"could not start the dev stack"* ]]
    [[ "$output" != *"egress policy"* ]]
}

@test "keeps the full Compose output for inspection" {
    stub_failing_stack "a detailed explanation"

    run "$HOOK"

    [ "$status" -eq 0 ]
    grep -q "a detailed explanation" "${SESSION_START_LOG_DIR}/compose-up.log"
}

@test "exits zero when the Docker daemon never becomes ready" {
    # `docker info` always fails, so the readiness loop gives up. Stubbing
    # sleep keeps that 30-second wait instant.
    stub docker 'exit 1'
    stub sleep 'exit 0'

    run "$HOOK"

    [ "$status" -eq 0 ]
    [[ "$output" == *"did not come up"* ]]
}
