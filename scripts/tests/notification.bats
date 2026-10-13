#!/usr/bin/env bats
# Tests for notification.sh, which tells Mark which worktree has finished
# a response, or is waiting on a reply.
#
# Every test sets QUILL_NOTIFY_DEBUG, so the script prints what it would
# show and stops: no banner is posted and nothing is spoken.
#
# Each test builds a throwaway repository with one extra worktree, so
# nothing here touches the real one.

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/../notification.sh"
    MAIN="${BATS_TEST_TMPDIR}/quillmedical"
    OTHER="${BATS_TEST_TMPDIR}/quillmedical-4"

    git init -q "$MAIN"
    git -C "$MAIN" -c user.name=t -c user.email=t@example.com \
        commit -q --allow-empty -m "start"
    git -C "$MAIN" worktree add -q "$OTHER" -b other
}

# What the script would show for a hook payload naming this directory.
shown_for() {
    local cwd="$1"
    shift

    printf '{"cwd": "%s"}' "$cwd" | QUILL_NOTIFY_DEBUG=1 "$SCRIPT" "$@"
}

group_of() {
    printf '%s\n' "$1" | sed -n 's/^group=//p'
}

@test "a finished banner is grouped by its worktree" {
    run shown_for "$OTHER"
    [ "$status" -eq 0 ]
    [ "$(group_of "$output")" = "quill-claude-stop-quillmedical-4" ]
}

@test "two worktrees do not share a group, so neither banner replaces the other" {
    run shown_for "$MAIN"
    main_group="$(group_of "$output")"

    run shown_for "$OTHER"
    other_group="$(group_of "$output")"

    [ -n "$main_group" ]
    [ "$main_group" != "$other_group" ]
}

@test "a subdirectory of a worktree is grouped with that worktree" {
    mkdir -p "${OTHER}/frontend"

    run shown_for "${OTHER}/frontend"
    [ "$status" -eq 0 ]
    [ "$(group_of "$output")" = "quill-claude-stop-quillmedical-4" ]
}

@test "a question is grouped apart from a finished turn in the same worktree" {
    run shown_for "$OTHER" needs-input
    [ "$status" -eq 0 ]
    [ "$(group_of "$output")" = "quill-claude-input-quillmedical-4" ]
}

@test "the banner is titled with the worktree" {
    run shown_for "$OTHER"
    [ "$status" -eq 0 ]
    [[ "$output" == *"title=quillmedical-4"* ]]
}
