#!/usr/bin/env bats
# Tests for owl/restart.sh, which restarts Owl and its Claude Code session
# owl, detached.
#
# systemd-run, systemctl, tmux and uname are stubs that record what they
# were asked, so nothing is restarted and no session killed. tmux answers
# `display-message` with IN_SESSION, standing in for the session the
# script is run from.

bats_require_minimum_version 1.5.0

setup() {
    SCRIPT="$(cd "${BATS_TEST_DIRNAME}/../owl" && pwd)/restart.sh"
    CALLS="${BATS_TEST_TMPDIR}/calls"
    export HOME="${BATS_TEST_TMPDIR}/home"
    export OWL_WORKTREE="${BATS_TEST_TMPDIR}/quillmedical-owl"
    export OWL_STATE="${BATS_TEST_TMPDIR}/state"
    unset OWL_TMUX_TARGET TMUX IN_SESSION XDG_STATE_HOME

    mkdir -p "${OWL_WORKTREE}" "${OWL_STATE}" "${BATS_TEST_TMPDIR}/bin"
    git -C "${OWL_WORKTREE}" init --quiet

    write_stub systemd-run ''
    write_stub systemctl ''
    write_stub tmux 'if [ "$1" = "display-message" ]; then echo "${IN_SESSION:-}"; fi'
    write_stub uname 'echo Linux'
    export PATH="${BATS_TEST_TMPDIR}/bin:${PATH}"
    cd "${OWL_WORKTREE}"
}

write_stub() {
    local name="$1"
    local body="$2"

    cat > "${BATS_TEST_TMPDIR}/bin/${name}" <<EOF
#!/usr/bin/env bash
printf '%s %s\n' "${name}" "\$*" >> "${CALLS}"
${body}
EOF
    chmod +x "${BATS_TEST_TMPDIR}/bin/${name}"
}

@test "anywhere but Owl's worktree is refused, and nothing is restarted" {
    cd "${BATS_TEST_TMPDIR}"
    run "$SCRIPT"

    [ "$status" -eq 1 ]
    [[ "$output" == *"Run this on the dev box"* ]]
    run ! grep -q "^systemd-run" "$CALLS"
}

@test "an unknown argument is refused" {
    run "$SCRIPT" now

    [ "$status" -eq 1 ]
    [[ "$output" == *"Unknown argument 'now'"* ]]
    [ ! -f "$CALLS" ]
}

@test "an idle Owl is restarted through systemd-run" {
    run "$SCRIPT"

    [ "$status" -eq 0 ]
    grep -q "^systemd-run --user --collect --quiet bash -c " "$CALLS"
}

@test "the four steps go to the detached job in order" {
    run "$SCRIPT"

    [ "$status" -eq 0 ]
    grep -qF "systemctl --user stop quill-owl.service; tmux kill-session -t =owl; rm -f ${OWL_STATE}/busy; systemctl --user start quill-owl.service" "$CALLS"
}

@test "nothing is stopped or killed in place" {
    run "$SCRIPT"

    [ "$status" -eq 0 ]
    run ! grep -q "^systemctl" "$CALLS"
    run ! grep -q "^tmux kill-session" "$CALLS"
}

@test "a busy session is refused, and nothing is restarted" {
    date +%s > "${OWL_STATE}/busy"

    run "$SCRIPT"

    [ "$status" -eq 1 ]
    [[ "$output" == *"owl is busy"* ]]
    run ! grep -q "^systemd-run" "$CALLS"
}

@test "force restarts a busy session" {
    date +%s > "${OWL_STATE}/busy"

    run "$SCRIPT" force

    [ "$status" -eq 0 ]
    grep -q "^systemd-run" "$CALLS"
}

@test "from inside the owl session the busy flag is the caller's own, so it restarts" {
    date +%s > "${OWL_STATE}/busy"
    export TMUX="/tmp/tmux-1000/default,1,0"
    export IN_SESSION="owl"

    run "$SCRIPT"

    [ "$status" -eq 0 ]
    grep -q "^systemd-run" "$CALLS"
}

@test "from another tmux session the busy flag still counts" {
    date +%s > "${OWL_STATE}/busy"
    export TMUX="/tmp/tmux-1000/default,1,0"
    export IN_SESSION="q2"

    run "$SCRIPT"

    [ "$status" -eq 1 ]
    run ! grep -q "^systemd-run" "$CALLS"
}
