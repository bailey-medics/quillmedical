#!/usr/bin/env bats
# Tests for build-backend-venv.sh, which builds the backend's Poetry
# environment on the pinned Python.
#
# Poetry and the pinned Python are stubbed onto PATH. The stubs record
# what they were asked, so nothing here builds an environment.

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/../build-backend-venv.sh"
    REPO="${BATS_TEST_TMPDIR}/repo"
    STUBS="${BATS_TEST_TMPDIR}/stubs"
    CALLS="${BATS_TEST_TMPDIR}/calls"
    mkdir -p "${REPO}/backend" "$STUBS" "$CALLS"
    echo "3.14.7" > "${REPO}/.python-version"

    cat > "${STUBS}/poetry" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "${CALLS}/poetry.args"
echo "\${POETRY_VIRTUALENVS_IN_PROJECT:-unset}" >> "${CALLS}/poetry.in-project"
echo "\${VIRTUAL_ENV:-unset}" >> "${CALLS}/poetry.virtual-env"
pwd -P >> "${CALLS}/poetry.cwd"
EOF
    printf '#!/usr/bin/env bash\necho "Python 3.14.8"\n' > "${STUBS}/python3.14"
    chmod +x "${STUBS}/poetry" "${STUBS}/python3.14"

    # Only the stubs and the basics, so a real python3.15 on the machine
    # running the tests cannot be found by mistake.
    PATH="${STUBS}:/usr/bin:/bin"
}

@test "builds on the Python the pin names, then installs" {
    run bash "$SCRIPT" "$REPO"

    [ "$status" -eq 0 ]
    [ "$(sed -n 1p "${CALLS}/poetry.args")" = "env use ${STUBS}/python3.14" ]
    [ "$(sed -n 2p "${CALLS}/poetry.args")" = "install" ]
}

@test "builds inside the backend folder of the root it was given" {
    run bash "$SCRIPT" "$REPO"

    [ "$(sed -n 1p "${CALLS}/poetry.cwd")" = "$(cd -P "${REPO}/backend" && pwd)" ]
}

@test "makes the environment in the worktree, not in Poetry's shared cache" {
    run bash "$SCRIPT" "$REPO"

    [ "$(sort -u "${CALLS}/poetry.in-project")" = "1" ]
}

@test "does not build into an environment active in the calling shell" {
    VIRTUAL_ENV=/somewhere/else run bash "$SCRIPT" "$REPO"

    [ "$(sort -u "${CALLS}/poetry.virtual-env")" = "unset" ]
}

@test "replaces an environment that is already there" {
    mkdir -p "${REPO}/backend/.venv/bin"
    touch "${REPO}/backend/.venv/bin/python"

    run bash "$SCRIPT" "$REPO"

    [ "$status" -eq 0 ]
    [ ! -e "${REPO}/backend/.venv/bin/python" ]
    [[ "$output" == *"Removing the old environment"* ]]
}

@test "fails, and builds nothing, when the pinned Python is not installed" {
    echo "3.15.2" > "${REPO}/.python-version"

    run bash "$SCRIPT" "$REPO"

    [ "$status" -eq 1 ]
    [[ "$output" == *"Python 3.15 is not installed"* ]]
    [[ "$output" == *"pinned to 3.15.2"* ]]
    [ ! -f "${CALLS}/poetry.args" ]
}

@test "leaves the old environment alone when the pinned Python is not installed" {
    echo "3.15.2" > "${REPO}/.python-version"
    mkdir -p "${REPO}/backend/.venv"

    run bash "$SCRIPT" "$REPO"

    [ -d "${REPO}/backend/.venv" ]
}

@test "fails without a repository root" {
    run bash "$SCRIPT"

    [ "$status" -eq 1 ]
    [[ "$output" == *"No repository root given"* ]]
}

@test "fails when the root has no pin file" {
    rm "${REPO}/.python-version"

    run bash "$SCRIPT" "$REPO"

    [ "$status" -eq 1 ]
    [[ "$output" == *".python-version is not there"* ]]
}
