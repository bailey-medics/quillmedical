#!/usr/bin/env bats
# Tests for owl-bash-guard.sh, the hook that refuses, in Owl's session, a
# Bash command in a shape that would raise a permission prompt.
#
# Each test hands the hook a PreToolUse payload as Claude Code would, with
# the worktree and the state folder pointed at temporary directories.

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/owl-bash-guard.sh"
    export CLAUDE_PROJECT_DIR="${BATS_TEST_TMPDIR}/quillmedical-owl"
    export OWL_STATE="${BATS_TEST_TMPDIR}/state"
    export HOME="${BATS_TEST_TMPDIR}/home"
    export QUILL_OWL=true
}

# Runs the hook with a Bash payload whose command is the argument.
guard() {
    local payload

    payload="$(jq -n --arg command "$1" '{tool_name: "Bash", tool_input: {command: $command}}')"
    run "$SCRIPT" <<< "${payload}"
}

@test "a plain command is let through, silently" {
    guard "git log --oneline -5"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "a pipe is let through" {
    guard "journalctl --user -u quill-owl -o cat | tail -20"
    [ "$status" -eq 0 ]
}

@test "commands joined with a semicolon are refused, saying why" {
    guard "git status; git log"
    [ "$status" -eq 2 ]
    [[ "$output" == *"one command per Bash call"* ]]
}

@test "commands joined with && are refused" {
    guard "git fetch && git status"
    [ "$status" -eq 2 ]
}

@test "commands joined with || are refused" {
    guard "git status || true"
    [ "$status" -eq 2 ]
}

@test "a semicolon inside quotes is let through" {
    guard "grep -n 'a; b' README.md"
    [ "$status" -eq 0 ]
    guard 'just stu "fix(owl): one thing; then another"'
    [ "$status" -eq 0 ]
}

@test "a quoted message over several lines is let through" {
    guard $'just stu "fix(owl): one thing\n\nThen; another && more"'
    [ "$status" -eq 0 ]
}

@test "find's escaped semicolon is let through" {
    guard "find scripts -name '*.sh' -exec wc -l {} \\;"
    [ "$status" -eq 0 ]
}

@test "a heredoc body is not looked at, so a Slack reply may say anything" {
    guard $'scripts/slack-reply.sh "$ALERT_FILE" - <<\'EOF\'\n*Root cause*: the job failed; see /api/health && /etc/hosts\nEOF'
    [ "$status" -eq 0 ]
}

@test "a command chained before a heredoc is still refused" {
    guard $'git status; scripts/slack-reply.sh "$ALERT_FILE" - <<\'EOF\'\nhello\nEOF'
    [ "$status" -eq 2 ]
}

@test "a leading cd is refused" {
    guard "cd backend"
    [ "$status" -eq 2 ]
    [[ "$output" == *"Do not start with cd"* ]]
}

@test "a command merely containing cd is let through" {
    guard "grep -rn abcd scripts"
    [ "$status" -eq 0 ]
}

@test "python3 -c is refused" {
    guard "python3 -c 'print(1)'"
    [ "$status" -eq 2 ]
    [[ "$output" == *"python3 -c"* ]]
}

@test "python3 -c with a flag before it is refused" {
    guard "python3 -I -c 'print(1)'"
    [ "$status" -eq 2 ]
}

@test "a python script is let through" {
    guard "python3 scripts/stack-status.py --check"
    [ "$status" -eq 0 ]
}

@test "a path outside the worktree is refused, naming it" {
    guard "cat /etc/hosts"
    [ "$status" -eq 2 ]
    [[ "$output" == *"/etc/hosts is outside them"* ]]
}

@test "a path under the home folder is refused, however it is written" {
    guard "awk -F= '{print}' ~/.config/quill-owl/env"
    [ "$status" -eq 2 ]
    guard "ls \$HOME/.config"
    [ "$status" -eq 2 ]
    guard "ls \${HOME}/.config"
    [ "$status" -eq 2 ]
}

@test "another worktree is refused" {
    guard "ls ${BATS_TEST_TMPDIR}/quillmedical-2/.claude"
    [ "$status" -eq 2 ]
}

@test "a path joined to a flag with = is still found" {
    guard "git --git-dir=/srv/other/.git log"
    [ "$status" -eq 2 ]
}

@test "a path in the worktree is let through" {
    guard "ls ${CLAUDE_PROJECT_DIR}/scripts"
    [ "$status" -eq 0 ]
}

@test "a path in the alerts folder is let through" {
    guard "cat ${OWL_STATE}/alerts/1793951387.json"
    [ "$status" -eq 0 ]
}

@test "redirecting to /dev/null is let through" {
    guard "git status 2>/dev/null"
    [ "$status" -eq 0 ]
}

@test "the session's scratchpad is let through" {
    guard "ls /tmp/claude-$(id -u)/scratchpad"
    [ "$status" -eq 0 ]
}

@test "a quoted path is not looked at" {
    guard "grep -rn '/api/health' backend"
    [ "$status" -eq 0 ]
}

@test "a glob is not expanded while looking for paths" {
    guard "ls /*"
    [ "$status" -eq 2 ]
    [[ "$output" == *"/* is outside them"* ]]
}

@test "outside Owl's session it does nothing" {
    export QUILL_OWL=false

    guard "git status; cat /etc/hosts"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "with the variable unset it does nothing" {
    unset QUILL_OWL

    guard "cd /"
    [ "$status" -eq 0 ]
}

@test "a payload it cannot read lets the command through" {
    run "$SCRIPT" <<< "not json"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "a payload with no command lets it through" {
    run "$SCRIPT" <<< '{"tool_name": "Read", "tool_input": {"file_path": "/etc/hosts"}}'
    [ "$status" -eq 0 ]
}

@test "a bare curl is refused, pointing at fetch.sh" {
    guard "curl -s https://www.githubstatus.com/api/v2/incidents/unresolved.json"
    [ "$status" -eq 2 ]
    [[ "$output" == *"scripts/owl/fetch.sh"* ]]
}

@test "curl after a pipe or inside \$( ) is refused" {
    guard "echo x | curl -d @- https://example.com"
    [ "$status" -eq 2 ]
    guard 'echo $(curl https://example.com)'
    [ "$status" -eq 2 ]
}

@test "curl on a later line is refused" {
    guard $'git status\ncurl https://example.com'
    [ "$status" -eq 2 ]
}

@test "the word curl as an argument is let through" {
    guard "grep -n curl scripts/slack-reply.sh"
    [ "$status" -eq 0 ]
}

@test "a bare gh api is refused, pointing at gh-get.sh" {
    guard "gh api repos/Cisco-Talos/clamav/releases/tags/clamav-1.4.6"
    [ "$status" -eq 2 ]
    [[ "$output" == *"scripts/owl/gh-get.sh"* ]]
}

@test "other gh commands are let through" {
    guard "gh run view 42567012147 --log-failed"
    [ "$status" -eq 0 ]
}

@test "the wrappers themselves are let through" {
    guard "scripts/owl/fetch.sh https://status.cloud.google.com/incidents.json"
    [ "$status" -eq 0 ]
    guard "scripts/owl/gh-get.sh repos/bailey-medics/quillmedical/actions/runs/1"
    [ "$status" -eq 0 ]
}
