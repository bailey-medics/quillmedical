#!/usr/bin/env bats
# Tests for whether stack-branch-merged.sh calls a branch spent.
#
# `gh` is a stub on PATH. It answers `gh pr list --head <branch> --state
# <state> ...` from a file named for the state, prints nothing when there
# is no file, and fails outright when STUB_FAILS names that state, which
# is what "GitHub could not be asked" looks like.

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/../stack-branch-merged.sh"
    STUB="${BATS_TEST_TMPDIR}/stub"

    mkdir -p "${STUB}/bin"
    cat > "${STUB}/bin/gh" <<'GH'
#!/usr/bin/env bash
# gh pr list --head <branch> --state <state> --json number --jq ...
state=""
while [ "$#" -gt 0 ]; do
    if [ "$1" = "--state" ]; then
        state="$2"
    fi
    shift
done

if [ "${STUB_FAILS:-}" = "${state}" ]; then
    exit 1
fi

if [ -f "${STUB}/${state}" ]; then
    cat "${STUB}/${state}"
fi
GH
    chmod +x "${STUB}/bin/gh"
    export STUB PATH="${STUB}/bin:${PATH}"
}

@test "a branch nothing has merged from is not spent" {
    run bash "${SCRIPT}" feature/new-work

    [ "${status}" -eq 0 ]
    [ -z "${output}" ]
}

@test "a branch whose pull request merged, with none open, is spent" {
    echo 1378 > "${STUB}/merged"

    run bash "${SCRIPT}" feature/old-work

    [ "${status}" -eq 1 ]
    [ "${output}" = "1378" ]
}

@test "a reused name with an open pull request is not spent" {
    # The case this script exists for: #1378 merged from the name, and
    # #1772 is open on a new branch of the same name.
    echo 1378 > "${STUB}/merged"
    echo 1772 > "${STUB}/open"

    run bash "${SCRIPT}" feature/reused-name

    [ "${status}" -eq 0 ]
    [ -z "${output}" ]
}

@test "an open pull request alone is not spent" {
    echo 1772 > "${STUB}/open"

    run bash "${SCRIPT}" feature/in-flight

    [ "${status}" -eq 0 ]
}

@test "GitHub failing on the merged question is told apart from an answer" {
    STUB_FAILS=merged run bash "${SCRIPT}" feature/any

    [ "${status}" -eq 2 ]
}

@test "GitHub failing on the open question is not read as spent" {
    # Merged is known, open is not. Calling that spent would refuse a
    # live stack because of a network fault.
    echo 1378 > "${STUB}/merged"

    STUB_FAILS=open run bash "${SCRIPT}" feature/any

    [ "${status}" -eq 2 ]
}

@test "no branch given is a usage error" {
    run bash "${SCRIPT}"

    [ "${status}" -eq 2 ]
    [[ "${output}" == *"Usage"* ]]
}
