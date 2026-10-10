#!/usr/bin/env bats
# Tests for check-python-version.sh, which refuses to carry on when the
# backend's Python on this machine is not the one CI runs.
#
# Poetry is stubbed onto PATH and answers with whatever version the test
# says the backend's environment is on, so nothing here builds one.

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/../check-python-version.sh"
    REPO="${BATS_TEST_TMPDIR}/repo"
    STUBS="${BATS_TEST_TMPDIR}/stubs"
    mkdir -p "${REPO}/backend" "$STUBS"
    echo "3.14.7" > "${REPO}/.python-version"

    # LOCAL_PYTHON is the version the environment is on. Unset, there is
    # no environment, and Poetry fails as it does then.
    cat > "${STUBS}/poetry" <<'EOF'
#!/usr/bin/env bash
if [ -z "${LOCAL_PYTHON:-}" ]; then
    echo "Poetry could not find a pyproject.toml file" >&2
    exit 1
fi
echo "$LOCAL_PYTHON"
EOF
    chmod +x "${STUBS}/poetry"
    PATH="${STUBS}:${PATH}"

    cd "$REPO" || return
}

@test "passes, and says nothing, when the environment is on the pinned Python" {
    LOCAL_PYTHON=3.14.7 run bash "$SCRIPT"

    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "passes on a different patch release of the same Python" {
    # CI installs the newest 3.14, and so may a developer.
    LOCAL_PYTHON=3.14.8 run bash "$SCRIPT"

    [ "$status" -eq 0 ]
}

@test "refuses an environment on an older Python, and says which" {
    LOCAL_PYTHON=3.13.15 run bash "$SCRIPT"

    [ "$status" -eq 1 ]
    [[ "$output" == *"is Python 3.13.15"* ]]
    [[ "$output" == *"pinned to 3.14.7"* ]]
}

@test "refuses an environment on a newer Python too" {
    LOCAL_PYTHON=3.15.0 run bash "$SCRIPT"

    [ "$status" -eq 1 ]
    [[ "$output" == *"is Python 3.15.0"* ]]
}

@test "does not take 3.1 for 3.14" {
    # Compared as two numbers, not as the start of a string.
    LOCAL_PYTHON=3.1.4 run bash "$SCRIPT"

    [ "$status" -eq 1 ]
}

@test "a refusal names the command that fixes it" {
    LOCAL_PYTHON=3.13.15 run bash "$SCRIPT"

    [[ "$output" == *"just venv-rebuild"* ]]
    [[ "$output" == *"Python 3.14 with"* ]]
}

@test "refuses when there is no environment at all" {
    run bash "$SCRIPT"

    [ "$status" -eq 1 ]
    [[ "$output" == *"has no Python environment"* ]]
    [[ "$output" == *"just venv-rebuild"* ]]
}

@test "follows the pin when the pin moves" {
    echo "3.15.2" > .python-version

    LOCAL_PYTHON=3.14.7 run bash "$SCRIPT"
    [ "$status" -eq 1 ]

    LOCAL_PYTHON=3.15.0 run bash "$SCRIPT"
    [ "$status" -eq 0 ]
}

@test "reads a pin with a line break after it" {
    printf '3.14.7\n\n' > .python-version

    LOCAL_PYTHON=3.14.7 run bash "$SCRIPT"

    [ "$status" -eq 0 ]
}

@test "fails when the pin file is missing" {
    rm .python-version

    LOCAL_PYTHON=3.14.7 run bash "$SCRIPT"

    [ "$status" -eq 1 ]
    [[ "$output" == *".python-version is not here"* ]]
}
