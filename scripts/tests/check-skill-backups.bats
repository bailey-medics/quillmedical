#!/usr/bin/env bats
# Tests for check-skill-backups.sh, which says when a shared skill's
# back-up in .claude/skill-backups/ has drifted from the personal copy.
#
# The script finds the back-ups beside itself, so each test copies it into
# a repository of its own, with HOME pointing at the test's own folder.

setup() {
    REPO="${BATS_TEST_TMPDIR}/repo"
    export HOME="${BATS_TEST_TMPDIR}/home"

    mkdir -p "${REPO}/scripts" "${REPO}/.claude/skill-backups/crpd"
    mkdir -p "${HOME}/.claude/skills/crpd"
    cp "${BATS_TEST_DIRNAME}/../check-skill-backups.sh" "${REPO}/scripts/"

    SCRIPT="${REPO}/scripts/check-skill-backups.sh"
}

@test "says nothing when the back-up matches the personal copy" {
    echo "same" >"${REPO}/.claude/skill-backups/crpd/SKILL.md"
    echo "same" >"${HOME}/.claude/skills/crpd/SKILL.md"

    run bash "$SCRIPT"

    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "names the drifted skill and the command that fixes it" {
    echo "old" >"${REPO}/.claude/skill-backups/crpd/SKILL.md"
    echo "new" >"${HOME}/.claude/skills/crpd/SKILL.md"

    run bash "$SCRIPT"

    [ "$status" -eq 0 ]
    [[ "$output" == *"shared skill crpd"* ]]
    [[ "$output" == *"just sync-skill-backups"* ]]
}

@test "says nothing when there is no personal copy, as the back-up is then in use" {
    echo "backup" >"${REPO}/.claude/skill-backups/crpd/SKILL.md"
    rm -r "${HOME}/.claude/skills/crpd"

    run bash "$SCRIPT"

    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "says nothing when there are no back-ups at all" {
    rm -r "${REPO}/.claude/skill-backups/crpd"

    run bash "$SCRIPT"

    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "sync copies the personal copy over a drifted back-up" {
    echo "old" >"${REPO}/.claude/skill-backups/crpd/SKILL.md"
    echo "new" >"${HOME}/.claude/skills/crpd/SKILL.md"

    run bash "$SCRIPT" sync

    [ "$status" -eq 0 ]
    [ "$(cat "${REPO}/.claude/skill-backups/crpd/SKILL.md")" = "new" ]
    [[ "$output" == *"crpd: back-up brought up to date"* ]]
}

@test "sync leaves a back-up alone when there is no personal copy" {
    echo "backup" >"${REPO}/.claude/skill-backups/crpd/SKILL.md"
    rm -r "${HOME}/.claude/skills/crpd"

    run bash "$SCRIPT" sync

    [ "$status" -eq 0 ]
    [ "$(cat "${REPO}/.claude/skill-backups/crpd/SKILL.md")" = "backup" ]
}

@test "an unknown mode is refused" {
    run bash "$SCRIPT" tidy

    [ "$status" -eq 1 ]
    [[ "$output" == *"Unknown mode tidy"* ]]
}
