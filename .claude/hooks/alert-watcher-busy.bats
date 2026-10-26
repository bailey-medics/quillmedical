#!/usr/bin/env bats
# Tests for alert-watcher-busy.sh, the hook that keeps the alert watcher's
# busy flag in worktree 5.
#
# Every test points the state folder at its own temporary directory, so
# nothing here touches a real flag.

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/alert-watcher-busy.sh"
    export QUILL_ALERT_WATCHER_STATE="${BATS_TEST_TMPDIR}/state"
    FLAG="${QUILL_ALERT_WATCHER_STATE}/busy"
    export QUILL_ALERT_WATCHER=true
}

@test "set writes the flag, holding the time the turn began" {
    run "$SCRIPT" set <<< '{"prompt": "hello"}'
    [ "$status" -eq 0 ]
    [ -z "$output" ]
    [[ "$(cat "$FLAG")" =~ ^[0-9]+$ ]]
    [ $(( $(date +%s) - $(cat "$FLAG") )) -lt 60 ]
}

@test "clear removes the flag" {
    "$SCRIPT" set < /dev/null

    run "$SCRIPT" clear < /dev/null
    [ "$status" -eq 0 ]
    [ ! -e "$FLAG" ]
}

@test "clear with no flag is not an error" {
    run "$SCRIPT" clear < /dev/null
    [ "$status" -eq 0 ]
}

@test "outside the watcher's session it does nothing" {
    export QUILL_ALERT_WATCHER=false

    run "$SCRIPT" set < /dev/null
    [ "$status" -eq 0 ]
    [ ! -e "$QUILL_ALERT_WATCHER_STATE" ]
}

@test "with the variable unset it does nothing" {
    unset QUILL_ALERT_WATCHER

    run "$SCRIPT" set < /dev/null
    [ "$status" -eq 0 ]
    [ ! -e "$QUILL_ALERT_WATCHER_STATE" ]
}

@test "a flag it cannot write still exits 0, so the prompt is never blocked" {
    mkdir -p "${BATS_TEST_TMPDIR}/readonly"
    chmod 0500 "${BATS_TEST_TMPDIR}/readonly"
    export QUILL_ALERT_WATCHER_STATE="${BATS_TEST_TMPDIR}/readonly/state"

    run "$SCRIPT" set < /dev/null
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "an unknown action exits 0 and writes nothing" {
    run "$SCRIPT" pause < /dev/null
    [ "$status" -eq 0 ]
    [ ! -e "$FLAG" ]
}
