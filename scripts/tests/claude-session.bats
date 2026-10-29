#!/usr/bin/env bats
# Tests for claude-session.sh, which takes the terminal to the worktree's
# Claude Code session in tmux and starts Claude in it when it has exited.
#
# tmux, pgrep, systemctl and claude are stubs that record what they were
# asked, so no tmux server is touched and no claude runs. The answers come
# from SESSION_EXISTS, CLAUDE_RUNNING, WATCHER_ENABLED and CURRENT_SESSION,
# and the session's active pane is always %7.

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/../claude-session.sh"
    CALLS="${BATS_TEST_TMPDIR}/calls"
    WORKTREE="${BATS_TEST_TMPDIR}/quillmedical-3"
    unset TMUX TMUX_PANE TERM_PROGRAM SESSION_EXISTS CLAUDE_RUNNING WATCHER_ENABLED CURRENT_SESSION

    git init -q "${WORKTREE}"
    mkdir -p "${BATS_TEST_TMPDIR}/bin"

    cat > "${BATS_TEST_TMPDIR}/bin/tmux" <<EOF
#!/usr/bin/env bash
printf 'tmux %s\n' "\$*" >> "${CALLS}"
case "\$1" in
    has-session) [ "\${SESSION_EXISTS:-}" = "1" ] ;;
    display-message)
        case "\$*" in
            *pane_id*) echo "%7" ;;
            *pane_pid*) echo "4242" ;;
            *session_name*) echo "\${CURRENT_SESSION:-other}" ;;
        esac
        ;;
esac
EOF

    cat > "${BATS_TEST_TMPDIR}/bin/pgrep" <<EOF
#!/usr/bin/env bash
printf 'pgrep %s\n' "\$*" >> "${CALLS}"
[ "\${CLAUDE_RUNNING:-}" = "1" ]
EOF

    cat > "${BATS_TEST_TMPDIR}/bin/systemctl" <<EOF
#!/usr/bin/env bash
[ "\${WATCHER_ENABLED:-}" = "1" ]
EOF

    cat > "${BATS_TEST_TMPDIR}/bin/claude" <<EOF
#!/usr/bin/env bash
printf 'claude %s in %s\n' "\$*" "\$PWD" >> "${CALLS}"
EOF

    chmod +x "${BATS_TEST_TMPDIR}"/bin/*
    export PATH="${BATS_TEST_TMPDIR}/bin:${PATH}"
}

run_in() {
    cd "$1"
    run "$SCRIPT"
}

@test "outside tmux, a running session is attached to and left as it is" {
    SESSION_EXISTS=1 CLAUDE_RUNNING=1 run_in "$WORKTREE"
    [ "$status" -eq 0 ]
    grep -qx "tmux attach -t =q3" "$CALLS"
    [ "$(grep -c -e new-session -e send-keys "$CALLS")" -eq 0 ]
}

@test "a missing session is started with Claude in it, then attached to" {
    run_in "$WORKTREE"
    [ "$status" -eq 0 ]
    grep -q "^tmux new-session -d -s q3 -c .*quillmedical-3 bash -lc 'claude --continue --ide --remote-control quillmedical-3 || claude --ide --remote-control quillmedical-3; exec bash'$" "$CALLS"
    grep -qx "tmux attach -t =q3" "$CALLS"
}

@test "a subdirectory of the worktree finds the same session" {
    mkdir -p "${WORKTREE}/backend/app"

    SESSION_EXISTS=1 CLAUDE_RUNNING=1 run_in "${WORKTREE}/backend/app"
    grep -qx "tmux attach -t =q3" "$CALLS"
}

@test "the main checkout is q1" {
    git init -q "${BATS_TEST_TMPDIR}/quillmedical"

    SESSION_EXISTS=1 CLAUDE_RUNNING=1 run_in "${BATS_TEST_TMPDIR}/quillmedical"
    grep -qx "tmux attach -t =q1" "$CALLS"
}

@test "Claude is looked for in the pane's own process session" {
    SESSION_EXISTS=1 CLAUDE_RUNNING=1 run_in "$WORKTREE"
    grep -qx "pgrep -x -s 4242 claude" "$CALLS"
}

@test "from outside tmux, an exited Claude is typed back in, then attached to" {
    SESSION_EXISTS=1 run_in "$WORKTREE"
    [ "$status" -eq 0 ]
    grep -qx "tmux send-keys -t %7 claude --continue --ide --remote-control quillmedical-3 || claude --ide --remote-control quillmedical-3 Enter" "$CALLS"
    grep -qx "tmux attach -t =q3" "$CALLS"
}

@test "from another session, an exited Claude is typed back in, then switched to" {
    export TMUX=/tmp/tmux-test TMUX_PANE=%1

    SESSION_EXISTS=1 run_in "$WORKTREE"
    grep -q "^tmux send-keys -t %7 " "$CALLS"
    grep -qx "tmux switch-client -t =q3" "$CALLS"
}

@test "from the session's own shell, Claude starts here in the foreground" {
    export TMUX=/tmp/tmux-test TMUX_PANE=%7

    SESSION_EXISTS=1 run_in "${WORKTREE}"
    [ "$status" -eq 0 ]
    grep -qx "claude --continue --ide --remote-control quillmedical-3 in $(cd -P "$WORKTREE" && pwd)" "$CALLS"
    [ "$(grep -c -e send-keys -e switch-client -e attach "$CALLS")" -eq 0 ]
}

@test "inside the session already, with Claude running, nothing is done" {
    export TMUX=/tmp/tmux-test TMUX_PANE=%1 CURRENT_SESSION=q3

    SESSION_EXISTS=1 CLAUDE_RUNNING=1 run_in "$WORKTREE"
    [ "$status" -eq 0 ]
    [ "$(grep -c -e send-keys -e switch-client -e attach "$CALLS")" -eq 0 ]
}

@test "a folder that is not a Quill worktree is refused" {
    git init -q "${BATS_TEST_TMPDIR}/elsewhere"

    run_in "${BATS_TEST_TMPDIR}/elsewhere"
    [ "$status" -eq 1 ]
    [[ "$output" == *"not one of the Quill worktrees"* ]]
}

@test "a folder outside git is refused" {
    mkdir -p "${BATS_TEST_TMPDIR}/plain"

    run_in "${BATS_TEST_TMPDIR}/plain"
    [ "$status" -eq 1 ]
}

@test "worktree 5 is treated like the others while the watcher is off" {
    git init -q "${BATS_TEST_TMPDIR}/quillmedical-5"

    SESSION_EXISTS=1 run_in "${BATS_TEST_TMPDIR}/quillmedical-5"
    [ "$status" -eq 0 ]
    grep -q "^tmux send-keys -t %7 claude --continue --ide --remote-control quillmedical-5 " "$CALLS"
}

@test "the watcher's q5 is attached to while its Claude runs" {
    git init -q "${BATS_TEST_TMPDIR}/quillmedical-5"

    WATCHER_ENABLED=1 SESSION_EXISTS=1 CLAUDE_RUNNING=1 run_in "${BATS_TEST_TMPDIR}/quillmedical-5"
    [ "$status" -eq 0 ]
    grep -qx "tmux attach -t =q5" "$CALLS"
}

@test "the watcher's q5 never has a plain Claude typed into it" {
    git init -q "${BATS_TEST_TMPDIR}/quillmedical-5"

    WATCHER_ENABLED=1 SESSION_EXISTS=1 run_in "${BATS_TEST_TMPDIR}/quillmedical-5"
    [ "$status" -eq 1 ]
    [[ "$output" == *"systemctl --user restart quill-alert-watcher"* ]]
    [ "$(grep -c -e send-keys -e attach "$CALLS")" -eq 0 ]
}

@test "the watcher's q5 is never started here when it is missing" {
    git init -q "${BATS_TEST_TMPDIR}/quillmedical-5"

    WATCHER_ENABLED=1 run_in "${BATS_TEST_TMPDIR}/quillmedical-5"
    [ "$status" -eq 1 ]
    [ "$(grep -c new-session "$CALLS")" -eq 0 ]
}

@test "from VS Code's terminal, a running Claude is asked to link again before attaching" {
    export TERM_PROGRAM=vscode

    SESSION_EXISTS=1 CLAUDE_RUNNING=1 run_in "$WORKTREE"
    [ "$status" -eq 0 ]
    grep -qx "tmux send-keys -t %7 /ide Enter" "$CALLS"
    grep -qx "tmux attach -t =q3" "$CALLS"
    # Asked before attaching, so the picker is waiting on arrival.
    [ "$(grep -n send-keys "$CALLS" | cut -d: -f1)" -lt "$(grep -n attach "$CALLS" | cut -d: -f1)" ]
}

@test "from another terminal, a running Claude is attached to and not asked to link" {
    export TERM_PROGRAM=iTerm.app

    SESSION_EXISTS=1 CLAUDE_RUNNING=1 run_in "$WORKTREE"
    grep -qx "tmux attach -t =q3" "$CALLS"
    [ "$(grep -c send-keys "$CALLS")" -eq 0 ]
}

@test "from VS Code's terminal, a Claude started here is not asked to link, as --ide links it" {
    export TERM_PROGRAM=vscode

    SESSION_EXISTS=1 run_in "$WORKTREE"
    grep -qx "tmux attach -t =q3" "$CALLS"
    [ "$(grep -c "send-keys -t %7 /ide" "$CALLS")" -eq 0 ]
}
