#!/usr/bin/env bats
# Tests for alert-watcher/start-session.sh, which starts the alert
# watcher's Claude Code session in tmux unless one is already running.
#
# tmux is replaced by a stub that records what it was asked and answers
# `has-session` with whatever SESSION_EXISTS says, so no tmux server is
# started and no claude runs. systemd-run and systemctl are stubs too:
# systemd-run records its options and runs the command after them, and
# `systemctl is-active` answers with whatever SCOPE_ACTIVE says, so no test
# reaches the real systemd.

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/../alert-watcher/start-session.sh"
    CALLS="${BATS_TEST_TMPDIR}/tmux-calls"
    export ALERT_WATCHER_WORKTREE="${BATS_TEST_TMPDIR}/quillmedical-5"
    export QUILL_ALERT_WATCHER_STATE="${BATS_TEST_TMPDIR}/state"
    export HOME="${BATS_TEST_TMPDIR}/home"
    SYSTEMD_RUN_CALLS="${BATS_TEST_TMPDIR}/systemd-run-calls"
    unset ALERT_WATCHER_TMUX_TARGET SESSION_EXISTS SCOPE_ACTIVE

    mkdir -p "${ALERT_WATCHER_WORKTREE}" "${BATS_TEST_TMPDIR}/bin"
    cat > "${BATS_TEST_TMPDIR}/bin/tmux" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "${CALLS}"
if [ "\$1" = "has-session" ]; then
    [ "\${SESSION_EXISTS:-}" = "1" ]
fi
EOF
    cat > "${BATS_TEST_TMPDIR}/bin/systemd-run" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "${SYSTEMD_RUN_CALLS}"
while [ "\$#" -gt 0 ] && [ "\${1#--}" != "\$1" ]; do
    shift
done
exec "\$@"
EOF
    cat > "${BATS_TEST_TMPDIR}/bin/systemctl" <<EOF
#!/usr/bin/env bash
if [ "\$2" = "is-active" ]; then
    [ "\${SCOPE_ACTIVE:-}" = "1" ]
fi
EOF
    chmod +x "${BATS_TEST_TMPDIR}/bin/tmux" \
        "${BATS_TEST_TMPDIR}/bin/systemd-run" \
        "${BATS_TEST_TMPDIR}/bin/systemctl"
    export PATH="${BATS_TEST_TMPDIR}/bin:${PATH}"
}

@test "a session already running is left alone" {
    SESSION_EXISTS=1 run "$SCRIPT"
    [ "$status" -eq 0 ]
    [[ "$output" == *"left as it is"* ]]
    [ "$(grep -c new-session "$CALLS")" -eq 0 ]
}

@test "the exact session name is asked for, not any that starts with it" {
    SESSION_EXISTS=1 run "$SCRIPT"
    grep -qx "has-session -t =q5" "$CALLS"
}

@test "a missing session is started in worktree 5" {
    run "$SCRIPT"
    [ "$status" -eq 0 ]
    grep -q "^new-session -d -s q5 -c ${ALERT_WATCHER_WORKTREE} bash -lc " "$CALLS"
}

@test "the session runs claude as the watcher, and may read the alert files" {
    run "$SCRIPT"
    grep -q "export QUILL_ALERT_WATCHER=true CLOUDSDK_CONFIG=${HOME}/.config/quill-alert-watcher/gcloud; claude --add-dir ${QUILL_ALERT_WATCHER_STATE}/alerts" "$CALLS"
}

@test "the session keeps gcloud settings of its own, apart from the user's" {
    run "$SCRIPT"
    grep -q "CLOUDSDK_CONFIG=${HOME}/.config/quill-alert-watcher/gcloud;" "$CALLS"
    [ "$(grep -c "CLOUDSDK_CONFIG=${HOME}/.config/gcloud" "$CALLS")" -eq 0 ]
}

@test "the session has Remote Control on, under the worktree's name" {
    run "$SCRIPT"
    grep -q -- "--remote-control quillmedical-5 " "$CALLS"
}

@test "the allowlist names the commands the skill needs to open a pull request" {
    run "$SCRIPT"
    grep -qF 'Bash\(just\ stack-submit:\*\)' "$CALLS"
    grep -qF 'Bash\(scripts/slack-reply.sh:\*\)' "$CALLS"
}

@test "the allowlist never lets a run merge" {
    run "$SCRIPT"
    [ "$(grep -c 'merge' "$CALLS")" -eq 0 ]
}

@test "the allowlist pushes only through the stack recipes" {
    run "$SCRIPT"
    [ "$(grep -c 'git\\ push' "$CALLS")" -eq 0 ]
    [ "$(grep -c 'gh\\ pr\\ create' "$CALLS")" -eq 0 ]
}

@test "the alert folder is made, and kept to its owner" {
    run "$SCRIPT"
    [ -d "${QUILL_ALERT_WATCHER_STATE}/alerts" ]
    [ "$(stat -c %a "${QUILL_ALERT_WATCHER_STATE}")" = "700" ]
}

@test "a missing worktree is refused, and nothing is started" {
    export ALERT_WATCHER_WORKTREE="${BATS_TEST_TMPDIR}/nowhere"

    run "$SCRIPT"
    [ "$status" -eq 1 ]
    [ "$(grep -c new-session "$CALLS")" -eq 0 ]
}

@test "the session starts in a systemd scope of its own, outside the service" {
    run "$SCRIPT"
    [ "$status" -eq 0 ]
    grep -q -- "^--user --scope --quiet --collect --unit=quill-tmux-server tmux new-session -d -s q5 -c ${ALERT_WATCHER_WORKTREE} bash -lc " "$SYSTEMD_RUN_CALLS"
    grep -q "^new-session -d -s q5 " "$CALLS"
}

@test "a scope already running is not asked for again" {
    SCOPE_ACTIVE=1 run "$SCRIPT"
    [ "$status" -eq 0 ]
    [ ! -e "$SYSTEMD_RUN_CALLS" ]
    grep -q "^new-session -d -s q5 " "$CALLS"
}

@test "without systemd-run, the session starts through tmux as it is" {
    # A PATH holding the stub tmux and only the tools the script needs, so
    # a systemd-run on the host cannot be found.
    local tools="${BATS_TEST_TMPDIR}/tools"
    mkdir -p "$tools"
    cp "${BATS_TEST_TMPDIR}/bin/tmux" "$tools/"
    for tool in bash mkdir chmod basename; do
        ln -s "$(command -v "$tool")" "$tools/$tool"
    done

    PATH="$tools" run "$SCRIPT"
    [ "$status" -eq 0 ]
    [ ! -e "$SYSTEMD_RUN_CALLS" ]
    grep -q "^new-session -d -s q5 -c ${ALERT_WATCHER_WORKTREE} bash -lc " "$CALLS"
}

@test "a session already running starts no scope" {
    SESSION_EXISTS=1 run "$SCRIPT"
    [ ! -e "$SYSTEMD_RUN_CALLS" ]
}
