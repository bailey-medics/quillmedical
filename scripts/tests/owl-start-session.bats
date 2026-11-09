#!/usr/bin/env bats
# Tests for owl/start-session.sh, which starts the alert
# watcher's Claude Code session in tmux unless one is already running.
#
# tmux is replaced by a stub that records what it was asked and answers
# `has-session` with whatever SESSION_EXISTS says, so no tmux server is
# started and no claude runs. systemd-run and systemctl are stubs too:
# systemd-run records its options and runs the command after them, and
# `systemctl is-active` answers with whatever SERVICE_ACTIVE says, and only
# for the tmux server's service, so no test reaches the real systemd.

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/../owl/start-session.sh"
    CALLS="${BATS_TEST_TMPDIR}/tmux-calls"
    export OWL_WORKTREE="${BATS_TEST_TMPDIR}/quillmedical-owl"
    export OWL_STATE="${BATS_TEST_TMPDIR}/state"
    export HOME="${BATS_TEST_TMPDIR}/home"
    SYSTEMD_RUN_CALLS="${BATS_TEST_TMPDIR}/systemd-run-calls"
    unset OWL_TMUX_TARGET SESSION_EXISTS SERVICE_ACTIVE

    mkdir -p "${OWL_WORKTREE}" "${BATS_TEST_TMPDIR}/bin"
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
    [ "\${SERVICE_ACTIVE:-}" = "1" ] && [ "\$4" = "quill-tmux-server.service" ]
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
    grep -qx "has-session -t =owl" "$CALLS"
}

@test "a missing session is started in Owl's worktree" {
    run "$SCRIPT"
    [ "$status" -eq 0 ]
    grep -q "^new-session -d -s owl -c ${OWL_WORKTREE} bash -lc " "$CALLS"
}

@test "the session runs claude as the watcher, and may read the alert files" {
    run "$SCRIPT"
    grep -q "export QUILL_OWL=true CLOUDSDK_CONFIG=${HOME}/.config/quill-owl/gcloud CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY=1; claude --add-dir ${OWL_STATE}/alerts" "$CALLS"
}

@test "the session runs in auto mode, so tool calls are decided rather than asked about" {
    run "$SCRIPT"
    grep -q -- "--permission-mode auto " "$CALLS"
}

@test "the session may not ask a question, since nobody is there to answer it" {
    run "$SCRIPT"
    grep -q -- "--disallowedTools AskUserQuestion " "$CALLS"
}

@test "the session loads its own settings, from beside the script" {
    local settings

    settings="$(cd "${BATS_TEST_DIRNAME}/../owl" && pwd)/session-settings.json"

    run "$SCRIPT"
    grep -qF -- "--settings ${settings} " "$CALLS"
}

@test "the session settings refuse reads outside the worktree rather than asking" {
    local settings="${BATS_TEST_DIRNAME}/../owl/session-settings.json"

    run python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d["permissions"]["blockReadsOutsideWorkingDirectories"])' "$settings"
    [ "$status" -eq 0 ]
    [ "$output" = "True" ]
}

@test "the session settings run the Bash guard before every Bash call" {
    local settings="${BATS_TEST_DIRNAME}/../owl/session-settings.json"

    run jq -r '.hooks.PreToolUse[] | select(.matcher == "Bash") | .hooks[].command' "$settings"
    [ "$status" -eq 0 ]
    [ "$output" = '$CLAUDE_PROJECT_DIR/.claude/hooks/owl-bash-guard.sh' ]
}

@test "the allowlist lets Owl read its own journal and service state" {
    run "$SCRIPT"
    grep -qF 'Bash\(journalctl\ --user\ -u\ quill-owl:\*\)' "$CALLS"
    grep -qF 'Bash\(systemctl\ --user\ is-active\ quill-owl:\*\)' "$CALLS"
    grep -qF 'Bash\(systemctl\ --user\ status\ quill-owl:\*\)' "$CALLS"
}

@test "the feedback survey is off in the session" {
    run "$SCRIPT"
    grep -q "CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY=1;" "$CALLS"
}

@test "the session keeps gcloud settings of its own, apart from the user's" {
    run "$SCRIPT"
    grep -q "CLOUDSDK_CONFIG=${HOME}/.config/quill-owl/gcloud " "$CALLS"
    [ "$(grep -c "CLOUDSDK_CONFIG=${HOME}/.config/gcloud" "$CALLS")" -eq 0 ]
}

@test "the session has Remote Control on, under the worktree's name" {
    run "$SCRIPT"
    grep -q -- "--remote-control quillmedical-owl " "$CALLS"
}

@test "the allowlist names the commands the skill needs to open a pull request" {
    run "$SCRIPT"
    grep -qF 'Bash\(just\ stack-submit:\*\)' "$CALLS"
    grep -qF 'Bash\(scripts/slack-reply.sh:\*\)' "$CALLS"
}

@test "the allowlist reads the web and the GitHub API through the read-only wrappers" {
    run "$SCRIPT"
    grep -qF 'Bash\(scripts/owl/fetch.sh:\*\)' "$CALLS"
    grep -qF 'Bash\(scripts/owl/gh-get.sh:\*\)' "$CALLS"
}

@test "the allowlist never names a bare curl or gh api" {
    run "$SCRIPT"
    [ "$(grep -c 'Bash\\(curl' "$CALLS")" -eq 0 ]
    [ "$(grep -c 'gh\\ api' "$CALLS")" -eq 0 ]
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
    [ -d "${OWL_STATE}/alerts" ]
    [ "$(stat -c %a "${OWL_STATE}")" = "700" ]
}

@test "a missing worktree is refused, and nothing is started" {
    export OWL_WORKTREE="${BATS_TEST_TMPDIR}/nowhere"

    run "$SCRIPT"
    [ "$status" -eq 1 ]
    [ "$(grep -c new-session "$CALLS")" -eq 0 ]
}

@test "the session starts in a transient service of its own, outside Owl's" {
    run "$SCRIPT"
    [ "$status" -eq 0 ]
    grep -q -- "^--user --quiet --collect --unit=quill-tmux-server --property=Type=forking tmux new-session -d -s owl -c ${OWL_WORKTREE} bash -lc " "$SYSTEMD_RUN_CALLS"
    grep -q "^new-session -d -s owl " "$CALLS"
}

@test "the server is never started in a scope, which would inherit Owl's restrictions" {
    run "$SCRIPT"
    [ "$status" -eq 0 ]
    [ "$(grep -c -- "--scope" "$SYSTEMD_RUN_CALLS")" -eq 0 ]
}

@test "a service already running is not asked for again" {
    SERVICE_ACTIVE=1 run "$SCRIPT"
    [ "$status" -eq 0 ]
    [ ! -e "$SYSTEMD_RUN_CALLS" ]
    grep -q "^new-session -d -s owl " "$CALLS"
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
    grep -q "^new-session -d -s owl -c ${OWL_WORKTREE} bash -lc " "$CALLS"
}

@test "a session already running starts no service" {
    SESSION_EXISTS=1 run "$SCRIPT"
    [ ! -e "$SYSTEMD_RUN_CALLS" ]
}
