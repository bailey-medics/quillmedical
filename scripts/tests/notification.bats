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
    [ "$(group_of "$output")" = "quill-claude-quillmedical-4" ]
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
    [ "$(group_of "$output")" = "quill-claude-quillmedical-4" ]
}

@test "a question shares its worktree's group, so it replaces a finished banner" {
    run shown_for "$OTHER"
    finished_group="$(group_of "$output")"

    run shown_for "$OTHER" needs-input
    [ "$status" -eq 0 ]
    [ "$(group_of "$output")" = "$finished_group" ]
}

@test "the banner is titled with the worktree" {
    run shown_for "$OTHER"
    [ "$status" -eq 0 ]
    [[ "$output" == *"title=quillmedical-4"* ]]
}

@test "on Linux, a banner is forwarded to the Mac named in QUILL_NOTIFY_SSH_HOST" {
    [ "$(uname -s)" = "Linux" ] || skip "forwarding is from the Linux dev box"

    QUILL_NOTIFY_SSH_HOST=mac run shown_for "$OTHER"
    [ "$status" -eq 0 ]
    [[ "$output" == *"forward=mac"* ]]
}

@test "without QUILL_NOTIFY_SSH_HOST nothing is forwarded" {
    QUILL_NOTIFY_SSH_HOST="" run shown_for "$OTHER"
    [ "$status" -eq 0 ]
    [[ "$output" != *"forward="* ]]
}

# A stand-in for the Quill notifier that records its arguments, one a line,
# so notification-show.sh can be run on any machine without posting a banner.
stub_notifier() {
    local bin="${BATS_TEST_TMPDIR}/notifier.app/Contents/MacOS"

    mkdir -p "$bin"
    cat >"${bin}/terminal-notifier" <<STUB
#!/bin/bash
printf '%s\n' "\$@" >"${BATS_TEST_TMPDIR}/notifier-args"
STUB
    chmod +x "${bin}/terminal-notifier"

    export QUILL_NOTIFY_APP="${BATS_TEST_TMPDIR}/notifier.app"
    export QUILL_NOTIFY_SPEAK=0
}

@test "the show script posts the title, body and group it is given" {
    stub_notifier
    SHOW="${BATS_TEST_DIRNAME}/../notification-show.sh"

    run "$SHOW" "quillmedical-4" "Did the thing" "grp" "Quill Medicine 4" "$OTHER"
    [ "$status" -eq 0 ]

    args="$(cat "${BATS_TEST_TMPDIR}/notifier-args")"
    [[ "$args" == *$'-title\nquillmedical-4'* ]]
    [[ "$args" == *$'-message\nDid the thing'* ]]
    [[ "$args" == *$'-group\ngrp'* ]]
    [[ "$args" == *"-execute"* ]]
}

@test "streamed over stdin, as the Mac receives it, the show script still posts" {
    stub_notifier
    SHOW="${BATS_TEST_DIRNAME}/../notification-show.sh"

    cd "$BATS_TEST_TMPDIR"
    run bash -s -- "quillmedical-4" "Did the thing" "grp" "Quill Medicine 4" \
        <"$SHOW"
    [ "$status" -eq 0 ]

    args="$(cat "${BATS_TEST_TMPDIR}/notifier-args")"
    [[ "$args" == *$'-message\nDid the thing'* ]]
    [[ "$args" != *"-execute"* ]]
}

@test "on Linux, the forward names the box as VS Code knows it, devbox unless set" {
    [ "$(uname -s)" = "Linux" ] || skip "forwarding is from the Linux dev box"

    QUILL_NOTIFY_SSH_HOST=mac run shown_for "$OTHER"
    [[ "$output" == *"remote=devbox"* ]]

    QUILL_NOTIFY_SSH_HOST=mac QUILL_NOTIFY_REMOTE_NAME=box2 run shown_for "$OTHER"
    [[ "$output" == *"remote=box2"* ]]
}

# Stand-ins for ssh and setsid, first on PATH. The ssh runs the remote
# command here, with the stream as its stdin, which is what the Mac does;
# setsid runs it in the foreground so the test can wait for it.
stub_ssh() {
    local bin="${BATS_TEST_TMPDIR}/bin"

    mkdir -p "$bin"
    cat >"${bin}/ssh" <<'STUB'
#!/bin/bash
for last; do :; done
eval "$last"
STUB
    cat >"${bin}/setsid" <<'STUB'
#!/bin/bash
[ "$1" = "-f" ] && shift
exec "$@"
STUB
    chmod +x "${bin}/ssh" "${bin}/setsid"

    export PATH="${bin}:${PATH}"
}

@test "a banner forwarded from the box opens the box's window when clicked" {
    [ "$(uname -s)" = "Linux" ] || skip "forwarding is from the Linux dev box"
    stub_notifier
    stub_ssh
    export HOME="${BATS_TEST_TMPDIR}/home"
    focus="${HOME}/Library/Caches/quill-notifier/notification-focus.sh"

    printf '{"cwd": "%s"}' "$OTHER" | QUILL_NOTIFY_SSH_HOST=mac "$SCRIPT"

    args="$(cat "${BATS_TEST_TMPDIR}/notifier-args")"
    [[ "$args" == *$'-execute\n'"'${focus}' '${OTHER}' 'devbox'"* ]]
    cmp "$focus" "${BATS_TEST_DIRNAME}/../notification-focus.sh"
    [ -x "$focus" ]
}

# A stand-in for osascript that records the window title it was asked to
# find, and finds it only if told to.
stub_focus_tools() {
    local bin="${BATS_TEST_TMPDIR}/bin"

    mkdir -p "$bin"
    cat >"${bin}/osascript" <<STUB
#!/bin/bash
printf '%s\n' "\$2" >"${BATS_TEST_TMPDIR}/osascript-name"
exit "\${OSASCRIPT_STATUS:-1}"
STUB
    cat >"${bin}/code" <<STUB
#!/bin/bash
printf '%s\n' "\$@" >"${BATS_TEST_TMPDIR}/code-args"
STUB
    chmod +x "${bin}/osascript" "${bin}/code"

    export PATH="${bin}:${PATH}"
    export QUILL_NOTIFY_CODE="${bin}/code"
}

@test "for the box, the click looks for the window titled with [SSH: devbox]" {
    stub_focus_tools
    FOCUS="${BATS_TEST_DIRNAME}/../notification-focus.sh"

    OSASCRIPT_STATUS=0 run "$FOCUS" /home/mark/github/quillmedical-5 devbox
    [ "$status" -eq 0 ]
    [ "$(cat "${BATS_TEST_TMPDIR}/osascript-name")" = "quillmedical-5 [SSH: devbox]" ]
    [ ! -e "${BATS_TEST_TMPDIR}/code-args" ]
}

@test "for the box, with no window in view, the click opens the folder over SSH" {
    stub_focus_tools
    FOCUS="${BATS_TEST_DIRNAME}/../notification-focus.sh"

    run "$FOCUS" /home/mark/github/quillmedical-5 devbox
    [ "$status" -eq 0 ]
    [ "$(cat "${BATS_TEST_TMPDIR}/code-args")" = $'--folder-uri\nvscode-remote://ssh-remote+devbox/home/mark/github/quillmedical-5' ]
}
