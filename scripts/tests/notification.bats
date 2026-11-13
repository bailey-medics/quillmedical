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

@test "a numbered worktree is spoken by its number" {
    run shown_for "$OTHER"
    [ "$status" -eq 0 ]
    [[ "$output" == *"spoken=Quill Medicine 4"* ]]
}

@test "Owl's worktree is spoken as Owl" {
    git -C "$MAIN" worktree add -q "${BATS_TEST_TMPDIR}/quillmedical-owl" -b owl

    run shown_for "${BATS_TEST_TMPDIR}/quillmedical-owl"
    [ "$status" -eq 0 ]
    [[ "$output" == *"spoken=Quill Medicine Owl"* ]]
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

@test "on Linux, a banner is offered as one line in the queue, and nothing connects out" {
    [ "$(uname -s)" = "Linux" ] || skip "the queue is written on the Linux dev box"
    stub_ssh
    export QUILL_NOTIFY_QUEUE="${BATS_TEST_TMPDIR}/queue/banners.jsonl"

    printf '{"cwd": "%s"}' "$OTHER" | "$SCRIPT"

    [ "$(wc -l <"$QUILL_NOTIFY_QUEUE")" -eq 1 ]
    line="$(cat "$QUILL_NOTIFY_QUEUE")"
    [[ "$line" == *'"title": "quillmedical-4"'* ]]
    [[ "$line" == *'"group": "quill-claude-quillmedical-4"'* ]]
    [[ "$line" == *"\"cwd\": \"${OTHER}\""* ]]
    [ ! -e "${BATS_TEST_TMPDIR}/ssh-called" ]
}

@test "the queue is cut back once it grows long, keeping the latest banners" {
    QUEUE="${BATS_TEST_DIRNAME}/../notification-queue.py"
    queue="${BATS_TEST_TMPDIR}/banners.jsonl"

    for i in $(seq 1 201); do
        python3 "$QUEUE" write --queue "$queue" -- "t" "banner $i" "g" "s" "/x"
    done

    [ "$(wc -l <"$queue")" -eq 50 ]
    [[ "$(tail -n 1 "$queue")" == *'"banner 201"'* ]]
}

@test "a body starting with a dash is still written as the body" {
    QUEUE="${BATS_TEST_DIRNAME}/../notification-queue.py"
    queue="${BATS_TEST_TMPDIR}/banners.jsonl"

    python3 "$QUEUE" write --queue "$queue" -- "t" "-- not an option" "g" "s" "/x"

    [[ "$(cat "$queue")" == *'"body": "-- not an option"'* ]]
}

# The listener's stream, as the box's tail would send it: one JSON line per
# banner, given here with the time to stamp each with.
banner_line() {
    printf '{"time": %s, "title": "%s", "body": "%s", "group": "%s", "spoken": "s", "cwd": "%s"}\n' \
        "$1" "$2" "$3" "${4:-quill-claude-quillmedical-4}" "${5:-/home/mark/github/quillmedical-4}"
}

# A stand-in for the show script that records each call's arguments, one a
# line, and a blank line between calls.
stub_show() {
    SHOWN="${BATS_TEST_TMPDIR}/shown"
    SHOW_STUB="${BATS_TEST_TMPDIR}/show-stub"

    cat >"$SHOW_STUB" <<STUB
#!/bin/bash
printf '%s\n' "\$@" >>"$SHOWN"
printf '\n' >>"$SHOWN"
STUB
    chmod +x "$SHOW_STUB"
}

listen() {
    python3 "${BATS_TEST_DIRNAME}/../notification-queue.py" show \
        --show-script "$SHOW_STUB" --box devbox \
        --state "${BATS_TEST_TMPDIR}/last-shown"
}

@test "the Mac shows a fresh banner, naming the box so a click finds its window" {
    stub_show
    now="$(date +%s)"

    banner_line "$now" "quillmedical-4" "Did the thing" | listen

    [ "$(cat "$SHOWN")" = $'quillmedical-4\nDid the thing\nquill-claude-quillmedical-4\ns\n/home/mark/github/quillmedical-4\ndevbox' ]
}

@test "the Mac skips a banner older than five minutes" {
    stub_show
    old="$(( $(date +%s) - 600 ))"

    banner_line "$old" "quillmedical-4" "Long ago" | listen

    [ ! -e "$SHOWN" ]
}

@test "after a reconnect, the Mac does not show a banner twice" {
    stub_show
    now="$(date +%s)"

    banner_line "$now" "quillmedical-4" "Once" | listen
    banner_line "$now" "quillmedical-4" "Once" | listen

    [ "$(grep -c '^Once$' "$SHOWN")" -eq 1 ]
}

@test "the Mac ignores a line that is not a banner, and shows the next" {
    stub_show
    now="$(date +%s)"

    {
        printf 'not json at all\n'
        printf '{"time": %s, "title": ["a list"]}\n' "$now"
        banner_line "$now" "quillmedical-4" "Bad group" 'quill; rm -rf ~'
        banner_line "$now" "quillmedical-4" "Good one"
    } | listen

    [ "$(grep -c '^devbox$' "$SHOWN")" -eq 1 ]
    grep -q '^Good one$' "$SHOWN"
}

@test "the Mac drops a worktree path that does not look like one, but still shows the banner" {
    stub_show
    now="$(date +%s)"

    banner_line "$now" "quillmedical-4" "Odd path" \
        quill-claude-quillmedical-4 '/home/../etc$(touch x)' | listen

    grep -q '^Odd path$' "$SHOWN"
    [ "$(grep -c 'etc' "$SHOWN")" -eq 0 ]
}

@test "the Mac turns control characters in a banner into spaces" {
    stub_show
    now="$(date +%s)"

    printf '{"time": %s, "title": "a\\nb", "body": "c\\u001bd", "group": "g", "spoken": "s", "cwd": "/x"}\n' \
        "$now" | listen

    grep -q '^a b$' "$SHOWN"
    grep -q '^c d$' "$SHOWN"
}

# say, terminal-notifier and the like read an argument starting with a dash
# as an option, so `say -v Karen "-o ~/file"` would write over a file on the
# Mac. Text from the box must never reach them starting with one.
@test "the Mac never passes a text field that starts with a dash" {
    stub_show
    now="$(date +%s)"

    printf '{"time": %s, "title": "-title", "body": "--help", "group": "g", "spoken": "-o /tmp/x", "cwd": "/x"}\n' \
        "$now" | listen

    [ "$(grep -c '^-' "$SHOWN")" -eq 0 ]
    grep -q '^ -o /tmp/x$' "$SHOWN"
}

@test "the Mac ignores a banner whose group starts with a dash" {
    stub_show
    now="$(date +%s)"

    banner_line "$now" "quillmedical-4" "Dash group" "-execute" | listen

    [ ! -e "$SHOWN" ]
}

# Stand-ins for ssh and setsid, first on PATH, which record that ssh was
# called, for the box's side, or replay a queue, for the Mac's.
stub_ssh() {
    local bin="${BATS_TEST_TMPDIR}/bin"

    mkdir -p "$bin"
    cat >"${bin}/ssh" <<STUB
#!/bin/bash
printf '%s\n' "\$@" >"${BATS_TEST_TMPDIR}/ssh-called"
cat "${BATS_TEST_TMPDIR}/remote-queue" 2>/dev/null
STUB
    cat >"${bin}/setsid" <<'STUB'
#!/bin/bash
[ "$1" = "-f" ] && shift
exec "$@"
STUB
    chmod +x "${bin}/ssh" "${bin}/setsid"

    export PATH="${bin}:${PATH}"
}

@test "the listener connects to the box, follows its queue, and shows what arrives" {
    stub_ssh
    stub_notifier
    banner_line "$(date +%s)" "quillmedical-4" "From the box" \
        >"${BATS_TEST_TMPDIR}/remote-queue"
    export HOME="${BATS_TEST_TMPDIR}/home"

    QUILL_NOTIFY_ONCE=1 run "${BATS_TEST_DIRNAME}/../notification-listen.sh"
    [ "$status" -eq 0 ]

    ssh_args="$(cat "${BATS_TEST_TMPDIR}/ssh-called")"
    [[ "$ssh_args" == *$'BatchMode=yes'* ]]
    [[ "$ssh_args" == *$'\ndevbox\n'* ]]
    [[ "$ssh_args" == *'tail -n 20 -F "$HOME/.local/state/quill-notify/banners.jsonl"'* ]]

    args="$(cat "${BATS_TEST_TMPDIR}/notifier-args")"
    [[ "$args" == *$'-message\nFrom the box'* ]]
    [[ "$args" == *"'/home/mark/github/quillmedical-4' 'devbox'"* ]]
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
