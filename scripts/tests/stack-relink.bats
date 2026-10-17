#!/usr/bin/env bats
# Tests for stack-relink.py, the route `just stack-refresh` takes when
# GitHub will not unstack a stack because part of it has merged.
#
# The record is a hand-written file in a throwaway repository, and `gh` is
# a stub on PATH that answers from files and writes down what it was asked
# to link. Nothing reaches GitHub, so these pin what the script asks for
# and what it writes, not how GitHub answers.

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/../stack-relink.py"
    REPO="${BATS_TEST_TMPDIR}/repo"
    STUB="${BATS_TEST_TMPDIR}/stub"

    export GIT_AUTHOR_NAME="Test" GIT_AUTHOR_EMAIL="test@example.com"
    export GIT_COMMITTER_NAME="Test" GIT_COMMITTER_EMAIL="test@example.com"

    mkdir -p "${STUB}/bin"
    cat > "${STUB}/bin/gh" <<'GH'
#!/usr/bin/env bash
# Answers from files in ${STUB}; a missing file is a failed call.
answer() {
    [ -f "${STUB}/$1" ] || exit 1
    cat "${STUB}/$1"
    exit 0
}
case "$1 $2" in
    "pr list")
        # gh pr list --head <branch> --state open --json number
        answer "open-${4//\//_}"
        ;;
    "stack link")
        shift 2
        echo "$*" > "${STUB}/linked"
        [ -f "${STUB}/link-fails" ] && exit 1
        exit 0
        ;;
    "stack unstack")
        # As gh does for the stack checked out: GitHub's goes, and so
        # does the local record.
        echo "$3" >> "${STUB}/unstacked"
        rm -f .git/gh-stack
        [ -f "${STUB}/unstack-fails-$3" ] && exit 1
        exit 0
        ;;
    "api repos/{owner}/{repo}/pulls/"*)
        answer "pull-${2##*/}"
        ;;
    "api repos/{owner}/{repo}/stacks/"*)
        answer "stack-${2##*/}"
        ;;
esac
exit 1
GH
    chmod +x "${STUB}/bin/gh"
    export STUB PATH="${STUB}/bin:${PATH}"

    git init --quiet --initial-branch main "${REPO}"
    cd "${REPO}"
    echo base > base.txt
    git add base.txt
    git commit --quiet --message base
    git switch --quiet --create feature/b
    git branch --quiet feature/c
}

# Writes a record of two stacks: a finished one, and the live one holding
# feature/b and feature/c. The argument is extra JSON for the live stack.
write_record() {
    python3 - "${1:-{\}}" <<'PY'
import json, sys

live = {
    "trunk": {"branch": "main", "head": "a" * 40},
    "branches": [{"branch": "feature/b"}, {"branch": "feature/c"}],
}
live.update(json.loads(sys.argv[1]))
record = {
    "schemaVersion": 1,
    "stacks": [
        {"id": "1", "number": 100, "trunk": {"branch": "main"}, "branches": []},
        live,
    ],
}
open(".git/gh-stack", "w").write(json.dumps(record))
PY
}

# Prints `<id> <number>` of the live stack in the record.
live_stack() {
    python3 -c '
import json
stack = json.load(open(".git/gh-stack"))["stacks"][1]
print(repr(stack.get("id")), repr(stack.get("number")))
'
}

@test "needed when GitHub's stack holds a merged pull request" {
    write_record '{"id": "5", "number": 1300}'
    echo '{"pull_requests": [{"merged_at": "2026-10-02T10:00:00Z"}, {"merged_at": null}]}' \
        > "${STUB}/stack-1300"

    run python3 "${SCRIPT}" --needed
    [ "$status" -eq 0 ]
}

@test "not needed when nothing in GitHub's stack has merged" {
    write_record '{"id": "5", "number": 1300}'
    echo '{"pull_requests": [{"merged_at": null}, {"merged_at": null}]}' \
        > "${STUB}/stack-1300"

    run python3 "${SCRIPT}" --needed
    [ "$status" -eq 1 ]
}

@test "not needed for a stack that was never submitted" {
    write_record

    run python3 "${SCRIPT}" --needed
    [ "$status" -eq 1 ]
}

@test "not needed when GitHub cannot be asked" {
    write_record '{"id": "5", "number": 1300}'

    run python3 "${SCRIPT}" --needed
    [ "$status" -eq 1 ]
}

@test "link uses each branch's open pull request, bottom to top" {
    write_record
    echo '[{"number": 1386}]' > "${STUB}/open-feature_b"
    echo '[{"number": 1364}]' > "${STUB}/open-feature_c"
    echo '{"stack": {"id": 1700305, "number": 1414}}' > "${STUB}/pull-1386"

    run python3 "${SCRIPT}" --link feature/b feature/c
    [ "$status" -eq 0 ]
    [ "$(cat "${STUB}/linked")" = "1386 1364" ]
}

@test "link points the live stack's id and number at GitHub's stack" {
    write_record '{"id": "5", "number": 1300}'
    echo '[{"number": 1386}]' > "${STUB}/open-feature_b"
    echo '[{"number": 1364}]' > "${STUB}/open-feature_c"
    echo '{"stack": {"id": 1700305, "number": 1414}}' > "${STUB}/pull-1386"

    run python3 "${SCRIPT}" --link feature/b feature/c
    [ "$status" -eq 0 ]
    # The id is kept as a string and the number as an integer, as
    # gh-stack writes them.
    [ "$(live_stack)" = "'1700305' 1414" ]
}

@test "link refuses a branch with no open pull request and links nothing" {
    write_record '{"id": "5", "number": 1300}'
    echo '[{"number": 1386}]' > "${STUB}/open-feature_b"
    echo '[]' > "${STUB}/open-feature_c"

    run python3 "${SCRIPT}" --link feature/b feature/c
    [ "$status" -eq 1 ]
    [[ "$output" == *"feature/c does not have exactly one open pull request"* ]]
    [ ! -f "${STUB}/linked" ]
    [ "$(live_stack)" = "'5' 1300" ]
}

@test "link leaves the record alone when gh stack link fails" {
    write_record '{"id": "5", "number": 1300}'
    echo '[{"number": 1386}]' > "${STUB}/open-feature_b"
    echo '[{"number": 1364}]' > "${STUB}/open-feature_c"
    touch "${STUB}/link-fails"

    run python3 "${SCRIPT}" --link feature/b feature/c
    [ "$status" -eq 1 ]
    [ "$(live_stack)" = "'5' 1300" ]
}

@test "link leaves the record alone when GitHub names no stack" {
    write_record '{"id": "5", "number": 1300}'
    echo '[{"number": 1386}]' > "${STUB}/open-feature_b"
    echo '[{"number": 1364}]' > "${STUB}/open-feature_c"
    echo '{"stack": null}' > "${STUB}/pull-1386"

    run python3 "${SCRIPT}" --link feature/b feature/c
    [ "$status" -eq 1 ]
    [ "$(live_stack)" = "'5' 1300" ]
}

@test "one open pull request is not linked, since one is not a stack" {
    write_record
    echo '[{"number": 1386}]' > "${STUB}/open-feature_b"
    echo '{"stack": null}' > "${STUB}/pull-1386"

    run python3 "${SCRIPT}" --link feature/b
    [ "$status" -eq 0 ]
    [ ! -f "${STUB}/linked" ]
}

# Gives feature/b and feature/c open pull requests 1386 and 1364.
two_open() {
    echo '[{"number": 1386}]' > "${STUB}/open-feature_b"
    echo '[{"number": 1364}]' > "${STUB}/open-feature_c"
}

@test "check passes when GitHub has them as one stack, in order" {
    write_record
    two_open
    echo '{"stack": {"number": 1414, "position": 1}}' > "${STUB}/pull-1386"
    echo '{"stack": {"number": 1414, "position": 2}}' > "${STUB}/pull-1364"
    echo '{"pull_requests": [{"number": 1386, "state": "open"}, {"number": 1364, "state": "open"}]}' \
        > "${STUB}/stack-1414"

    run python3 "${SCRIPT}" --check feature/b feature/c
    [ "$status" -eq 0 ]
}

@test "check fails on a pull request in no stack, and names it" {
    write_record
    two_open
    echo '{"stack": {"number": 1414, "position": 1}}' > "${STUB}/pull-1386"
    echo '{"stack": null}' > "${STUB}/pull-1364"

    run python3 "${SCRIPT}" --check feature/b feature/c
    [ "$status" -eq 1 ]
    [[ "$output" == *"#1364 is in no stack on GitHub"* ]]
    [[ "$output" == *"just stack-relink"* ]]
}

@test "check fails when GitHub has split them into two stacks" {
    write_record
    two_open
    echo '{"stack": {"number": 1414, "position": 1}}' > "${STUB}/pull-1386"
    echo '{"stack": {"number": 1500, "position": 1}}' > "${STUB}/pull-1364"

    run python3 "${SCRIPT}" --check feature/b feature/c
    [ "$status" -eq 1 ]
    [[ "$output" == *"stack #1414 on GitHub holds #1386"* ]]
    [[ "$output" == *"stack #1500 on GitHub holds #1364"* ]]
}

@test "check fails when GitHub's stack has them out of order" {
    write_record
    two_open
    echo '{"stack": {"number": 1414, "position": 2}}' > "${STUB}/pull-1386"
    echo '{"stack": {"number": 1414, "position": 1}}' > "${STUB}/pull-1364"

    run python3 "${SCRIPT}" --check feature/b feature/c
    [ "$status" -eq 1 ]
    [[ "$output" == *"in another order"* ]]
}

@test "check fails on a closed pull request left in GitHub's stack" {
    write_record
    two_open
    echo '{"stack": {"number": 1414, "position": 1}}' > "${STUB}/pull-1386"
    echo '{"stack": {"number": 1414, "position": 2}}' > "${STUB}/pull-1364"
    echo '{"pull_requests": [{"number": 1386, "state": "open"}, {"number": 1364, "state": "open"}, {"number": 1350, "state": "closed", "merged_at": null}]}' \
        > "${STUB}/stack-1414"

    run python3 "${SCRIPT}" --check feature/b feature/c
    [ "$status" -eq 1 ]
    [[ "$output" == *"holds #1350, closed without merging"* ]]
}

@test "check does not count a merged pull request in GitHub's stack" {
    write_record
    two_open
    echo '{"stack": {"number": 1414, "position": 2}}' > "${STUB}/pull-1386"
    echo '{"stack": {"number": 1414, "position": 3}}' > "${STUB}/pull-1364"
    echo '{"pull_requests": [{"number": 1350, "state": "closed", "merged_at": "2026-10-16T10:00:00Z"}, {"number": 1386, "state": "open"}, {"number": 1364, "state": "open"}]}' \
        > "${STUB}/stack-1414"

    run python3 "${SCRIPT}" --check feature/b feature/c
    [ "$status" -eq 0 ]
}

@test "repair unstacks each stack holding them, then links them as one" {
    write_record '{"id": "5", "number": 1300}'
    two_open
    echo '{"stack": {"id": 1700305, "number": 1414}}' > "${STUB}/pull-1386"
    echo '{"stack": {"id": 1700400, "number": 1500}}' > "${STUB}/pull-1364"

    run python3 "${SCRIPT}" --repair feature/b feature/c
    [ "$status" -eq 0 ]
    [ "$(tr '\n' ' ' < "${STUB}/unstacked")" = "1414 1500 " ]
    [ "$(cat "${STUB}/linked")" = "1386 1364" ]
}

@test "repair keeps the local record that unstacking deletes" {
    write_record '{"id": "5", "number": 1300}'
    two_open
    echo '{"stack": {"id": 1700305, "number": 1414}}' > "${STUB}/pull-1386"
    echo '{"stack": {"id": 1700305, "number": 1414}}' > "${STUB}/pull-1364"

    run python3 "${SCRIPT}" --repair feature/b feature/c
    [ "$status" -eq 0 ]
    [ "$(live_stack)" = "'1700305' 1414" ]
}

@test "repair carries on past a stack GitHub will not unstack" {
    write_record '{"id": "5", "number": 1300}'
    two_open
    echo '{"stack": {"id": 1700305, "number": 1414}}' > "${STUB}/pull-1386"
    echo '{"stack": {"id": 1700305, "number": 1414}}' > "${STUB}/pull-1364"
    touch "${STUB}/unstack-fails-1414"

    run python3 "${SCRIPT}" --repair feature/b feature/c
    [ "$status" -eq 0 ]
    [[ "$output" == *"would not unstack #1414"* ]]
    [ "$(cat "${STUB}/linked")" = "1386 1364" ]
}
