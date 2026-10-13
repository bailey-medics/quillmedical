#!/usr/bin/env bats
# Tests for check-python-version.sh, which refuses to carry on when the
# backend's Python on this machine is not the one CI runs.
#
# Poetry is stubbed onto PATH and answers with whatever version the test
# says the backend's environment is on, so nothing here builds one.
# `python3` is stubbed the same way, so a test does not pass or fail on
# the Python of the machine it happens to run on.

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/../check-python-version.sh"
    REPO="${BATS_TEST_TMPDIR}/repo"
    STUBS="${BATS_TEST_TMPDIR}/stubs"
    mkdir -p "${REPO}/backend" "$STUBS"
    echo "3.14.7" > "${REPO}/.python-version"
    hooks_on "python3.14"

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

    # HOST_PYTHON is the version `python3` on the PATH is. It starts on
    # the pinned one, so a test about something else need not mention it.
    # Set to `none`, there is no python3 to ask.
    cat > "${STUBS}/python3" <<'EOF'
#!/usr/bin/env bash
if [ "${HOST_PYTHON:-}" = "none" ]; then
    exit 127
fi
echo "${HOST_PYTHON:-3.14.7}"
EOF
    chmod +x "${STUBS}/python3"
    PATH="${STUBS}:${PATH}"

    cd "$REPO" || return
}

# Writes a pre-commit config with one hook told to run on the Python
# given, as `.pre-commit-config.yaml` has for black.
hooks_on() {
    local language_version="$1"

    cat > "${REPO}/.pre-commit-config.yaml" <<EOF
repos:
  - repo: https://github.com/psf/black
    rev: 26.10.1
    hooks:
      - id: black
        language_version: ${language_version}
EOF
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
    hooks_on "python3.15"

    HOST_PYTHON=3.15.0 LOCAL_PYTHON=3.14.7 run bash "$SCRIPT"
    [ "$status" -eq 1 ]

    HOST_PYTHON=3.15.0 LOCAL_PYTHON=3.15.0 run bash "$SCRIPT"
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

@test "refuses a hook told to run on another Python, and says which" {
    hooks_on "python3.13"

    LOCAL_PYTHON=3.14.7 run bash "$SCRIPT"

    [ "$status" -eq 1 ]
    [[ "$output" == *"set to run on Python 3.13"* ]]
    [[ "$output" == *"pinned to 3.14.7"* ]]
    [[ "$output" == *"language_version: python3.14"* ]]
}

@test "refuses a hook left behind when the pin moves" {
    echo "3.15.2" > .python-version

    HOST_PYTHON=3.15.0 LOCAL_PYTHON=3.15.0 run bash "$SCRIPT"

    [ "$status" -eq 1 ]
    [[ "$output" == *"language_version: python3.15"* ]]
}

@test "checks the hooks before the environment" {
    # A wrong hook is reported even with no environment to ask.
    hooks_on "python3.13"

    run bash "$SCRIPT"

    [ "$status" -eq 1 ]
    [[ "$output" == *"set to run on Python 3.13"* ]]
}

@test "refuses when any one of several hooks is on another Python" {
    cat >> .pre-commit-config.yaml <<'EOF'
      - id: another
        language_version: python3.12
EOF

    LOCAL_PYTHON=3.14.7 run bash "$SCRIPT"

    [ "$status" -eq 1 ]
    [[ "$output" == *"set to run on Python 3.12"* ]]
}

@test "reads a hook's Python written in quotes" {
    hooks_on '"python3.13"'

    LOCAL_PYTHON=3.14.7 run bash "$SCRIPT"

    [ "$status" -eq 1 ]
}

@test "passes when no hook names a Python" {
    echo "repos: []" > .pre-commit-config.yaml

    LOCAL_PYTHON=3.14.7 run bash "$SCRIPT"

    [ "$status" -eq 0 ]
}

@test "leaves alone a language_version that is not a Python" {
    hooks_on "20.11.0"

    LOCAL_PYTHON=3.14.7 run bash "$SCRIPT"

    [ "$status" -eq 0 ]
}

@test "leaves alone a language_version in a comment" {
    echo "        # language_version: python3.12" >> .pre-commit-config.yaml

    LOCAL_PYTHON=3.14.7 run bash "$SCRIPT"

    [ "$status" -eq 0 ]
}

@test "fails when the pre-commit config is missing" {
    rm .pre-commit-config.yaml

    LOCAL_PYTHON=3.14.7 run bash "$SCRIPT"

    [ "$status" -eq 1 ]
    [[ "$output" == *".pre-commit-config.yaml is not here"* ]]
}

@test "refuses an older python3 on the PATH, and says which and where" {
    HOST_PYTHON=3.13.15 LOCAL_PYTHON=3.14.7 run bash "$SCRIPT"

    [ "$status" -eq 1 ]
    [[ "$output" == *"python3 on this machine is Python 3.13.15 (${STUBS}/python3)"* ]]
    [[ "$output" == *"pinned to 3.14.7"* ]]
    [[ "$output" == *"Install Python 3.14"* ]]
}

@test "refuses a newer python3 on the PATH too" {
    HOST_PYTHON=3.15.0 LOCAL_PYTHON=3.14.7 run bash "$SCRIPT"

    [ "$status" -eq 1 ]
    [[ "$output" == *"is Python 3.15.0"* ]]
}

@test "passes on a different patch release of python3" {
    HOST_PYTHON=3.14.8 LOCAL_PYTHON=3.14.7 run bash "$SCRIPT"

    [ "$status" -eq 0 ]
}

@test "refuses when there is no python3 on the PATH" {
    HOST_PYTHON=none LOCAL_PYTHON=3.14.7 run bash "$SCRIPT"

    [ "$status" -eq 1 ]
    [[ "$output" == *"There is no python3 on the PATH"* ]]
}

@test "says so when the wrong python3 comes from an active virtual environment" {
    # An editor that activates an environment in its terminals puts that
    # environment's python3 first, which is how this was met.
    HOST_PYTHON=3.13.15 VIRTUAL_ENV="${BATS_TEST_TMPDIR}" run bash "$SCRIPT"

    [ "$status" -eq 1 ]
    [[ "$output" == *"A virtual environment is active (${BATS_TEST_TMPDIR})"* ]]
    [[ "$output" == *"deactivate"* ]]
    [[ "$output" != *"put it first on the PATH"* ]]
}

@test "does not blame a virtual environment the wrong python3 is not in" {
    HOST_PYTHON=3.13.15 VIRTUAL_ENV="/somewhere/else" run bash "$SCRIPT"

    [ "$status" -eq 1 ]
    [[ "$output" != *"A virtual environment is active"* ]]
    [[ "$output" == *"put it first on the PATH"* ]]
}

@test "host checks python3 and nothing else" {
    # No environment and no hooks file: neither is looked at.
    rm .pre-commit-config.yaml

    run bash "$SCRIPT" host

    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "host refuses an older python3" {
    HOST_PYTHON=3.12.3 run bash "$SCRIPT" host

    [ "$status" -eq 1 ]
    [[ "$output" == *"python3 on this machine is Python 3.12.3"* ]]
}

@test "refuses an argument it does not know" {
    run bash "$SCRIPT" everything

    [ "$status" -eq 1 ]
    [[ "$output" == *"Unknown argument: everything"* ]]
}
