#!/usr/bin/env bats
# Tests for local-path.sh, which prints where the shared local/ folder is:
# the main checkout's, from whichever worktree asks.
#
# Each test builds a throwaway repository with one extra worktree, so
# nothing here touches the real one.

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/../local-path.sh"
    MAIN="${BATS_TEST_TMPDIR}/main"
    OTHER="${BATS_TEST_TMPDIR}/other"

    git init -q "$MAIN"
    git -C "$MAIN" -c user.name=t -c user.email=t@example.com \
        commit -q --allow-empty -m "start"
    git -C "$MAIN" worktree add -q "$OTHER" -b other

    # The path as the script will print it: macOS keeps its temporary
    # directory behind a symlink.
    SHARED="$(cd -P "$MAIN" && pwd)/local"
}

path_from() {
    (cd "$1" && "$SCRIPT")
}

@test "the main checkout is given its own folder" {
    run path_from "$MAIN"
    [ "$status" -eq 0 ]
    [ "$output" = "$SHARED" ]
}

@test "another worktree is given the main checkout's folder" {
    run path_from "$OTHER"
    [ "$status" -eq 0 ]
    [ "$output" = "$SHARED" ]
}

@test "a subdirectory of a worktree is given the same folder" {
    mkdir -p "${OTHER}/backend/app"

    run path_from "${OTHER}/backend/app"
    [ "$status" -eq 0 ]
    [ "$output" = "$SHARED" ]
}

@test "the folder is made when it is not there" {
    [ ! -e "${MAIN}/local" ]
    path_from "$OTHER"
    [ -d "${MAIN}/local" ]
}

@test "nothing is put in the worktree that asked" {
    path_from "$OTHER"
    [ ! -e "${OTHER}/local" ]
}

@test "a file written from one worktree is read from another" {
    echo "card" > "$(path_from "$OTHER")/ledger.tsv"
    [ "$(cat "$(path_from "$MAIN")/ledger.tsv")" = "card" ]
}

@test "the folder is hidden from git, and the rule is written once" {
    path_from "$OTHER"
    path_from "$MAIN"
    echo "card" > "${MAIN}/local/ledger.tsv"

    [ "$(grep -cxF "/local" "${MAIN}/.git/info/exclude")" -eq 1 ]
    [ -z "$(git -C "$MAIN" status --short)" ]
    [ -z "$(git -C "$OTHER" status --short)" ]
}

@test "git can still say what is ignored with a file from the folder asked about" {
    # The reason there is no symlink: with one, this stops with "beyond a
    # symbolic link" and answers for none of the paths.
    path_from "$OTHER"
    echo "card" > "${MAIN}/local/ledger.tsv"

    run git -C "$MAIN" check-ignore local/ledger.tsv
    [ "$status" -eq 0 ]
    [ "$output" = "local/ledger.tsv" ]
}
