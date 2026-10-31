#!/usr/bin/env bats
# Tests for tmux-window.sh, which takes the terminal to a plain shell in
# tmux for the worktree, starting the session when it is missing.
#
# tmux is a stub that records what it was asked, so no tmux server is
# touched. Its answers come from SESSION_EXISTS and CURRENT_SESSION.

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/../tmux-window.sh"
    CALLS="${BATS_TEST_TMPDIR}/calls"
    WORKTREE="${BATS_TEST_TMPDIR}/quillmedical-3"
    unset TMUX TMUX_PANE SESSION_EXISTS CURRENT_SESSION

    git init -q "${WORKTREE}"
    mkdir -p "${BATS_TEST_TMPDIR}/bin"

    cat > "${BATS_TEST_TMPDIR}/bin/tmux" <<EOF
#!/usr/bin/env bash
printf 'tmux %s\n' "\$*" >> "${CALLS}"
case "\$1" in
    has-session) [ "\${SESSION_EXISTS:-}" = "1" ] ;;
    display-message) echo "\${CURRENT_SESSION:-other}" ;;
esac
EOF

    chmod +x "${BATS_TEST_TMPDIR}"/bin/*
    export PATH="${BATS_TEST_TMPDIR}/bin:${PATH}"
}

run_in() {
    cd "$1"
    run "$SCRIPT"
}

@test "a missing session is started with a login shell in the worktree, then attached to" {
    run_in "$WORKTREE"
    [ "$status" -eq 0 ]
    grep -q "^tmux new-session -d -s t3 -c .*quillmedical-3 bash -l$" "$CALLS"
    grep -qx "tmux attach -t =t3" "$CALLS"
}

@test "outside tmux, an existing session is attached to and not started again" {
    SESSION_EXISTS=1 run_in "$WORKTREE"
    [ "$status" -eq 0 ]
    grep -qx "tmux attach -t =t3" "$CALLS"
    [ "$(grep -c new-session "$CALLS")" -eq 0 ]
}

@test "nothing is typed into the shell" {
    SESSION_EXISTS=1 run_in "$WORKTREE"
    [ "$(grep -c send-keys "$CALLS")" -eq 0 ]
}

@test "a subdirectory of the worktree finds the same session" {
    mkdir -p "${WORKTREE}/frontend/src"

    SESSION_EXISTS=1 run_in "${WORKTREE}/frontend/src"
    grep -qx "tmux attach -t =t3" "$CALLS"
}

@test "the main checkout is t1" {
    git init -q "${BATS_TEST_TMPDIR}/quillmedical"

    SESSION_EXISTS=1 run_in "${BATS_TEST_TMPDIR}/quillmedical"
    grep -qx "tmux attach -t =t1" "$CALLS"
}

@test "worktree 5 is t5, with no refusal for the alert watcher" {
    git init -q "${BATS_TEST_TMPDIR}/quillmedical-5"

    run_in "${BATS_TEST_TMPDIR}/quillmedical-5"
    [ "$status" -eq 0 ]
    grep -q "^tmux new-session -d -s t5 " "$CALLS"
}

@test "from another tmux session, it switches rather than nesting" {
    export TMUX=/tmp/tmux-test TMUX_PANE=%1

    SESSION_EXISTS=1 run_in "$WORKTREE"
    [ "$status" -eq 0 ]
    grep -qx "tmux switch-client -t =t3" "$CALLS"
    [ "$(grep -c attach "$CALLS")" -eq 0 ]
}

@test "inside the session already, nothing is done" {
    export TMUX=/tmp/tmux-test TMUX_PANE=%1 CURRENT_SESSION=t3

    SESSION_EXISTS=1 run_in "$WORKTREE"
    [ "$status" -eq 0 ]
    [ "$(grep -c -e switch-client -e attach -e new-session "$CALLS")" -eq 0 ]
}

@test "a folder that is not a Quill worktree is refused" {
    git init -q "${BATS_TEST_TMPDIR}/elsewhere"

    run_in "${BATS_TEST_TMPDIR}/elsewhere"
    [ "$status" -eq 1 ]
    [[ "$output" == *"is not one of the Quill worktrees"* ]]
    [ ! -e "$CALLS" ] || [ "$(grep -c -e new-session -e attach "$CALLS")" -eq 0 ]
}

@test "outside a git repository it is refused" {
    run_in "$BATS_TEST_TMPDIR"
    [ "$status" -eq 1 ]
    [[ "$output" == *"Run this from one of the Quill worktrees"* ]]
}
