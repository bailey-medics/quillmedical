#!/usr/bin/env bash
# Says when a shared skill's back-up has drifted from the personal copy.
#
# Usage: check-skill-backups.sh [sync]
#
# Quill keeps no copy of the shared skills from Mark's mark-house-style
# repository, which are linked into ~/.claude/skills/. The one exception is
# .claude/skill-backups/, which holds a copy of each skill Owl must be able
# to run on a machine without them: `crpd`, which Owl's /alert run ends with.
#
# With no argument, it compares each back-up with the personal copy at
# ~/.claude/skills/<name>/SKILL.md and prints a note for each that differs,
# naming the command that brings it up to date. It runs as a SessionStart
# hook, so the note lands in the session's context and Claude offers the
# fix. Where there is no personal copy, it prints nothing, because the
# back-up is then the copy in use.
#
# With `sync`, it copies each personal copy over its back-up instead. That
# is `just sync-skill-backups`.
#
# It always exits 0 when checking: a hook that fails would stop a session
# over a note.
set -euo pipefail

backups_dir() {
    local here

    here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

    echo "${here}/.claude/skill-backups"
}

personal_copy() {
    local name="$1"

    echo "${HOME}/.claude/skills/${name}/SKILL.md"
}

check() {
    local backups="$1"
    local backup
    local name
    local personal

    for backup in "${backups}"/*/SKILL.md; do
        [ -f "${backup}" ] || continue

        name="$(basename "$(dirname "${backup}")")"
        personal="$(personal_copy "${name}")"

        if [ -f "${personal}" ] && ! cmp -s "${backup}" "${personal}"; then
            echo "The back-up of the shared skill ${name}, in .claude/skill-backups/${name}/, differs from the personal copy in ~/.claude/skills/${name}/. Owl falls back to it on a machine without mark-house-style. Offer to bring it up to date with: just sync-skill-backups"
        fi
    done
}

sync() {
    local backups="$1"
    local backup
    local name
    local personal

    for backup in "${backups}"/*/SKILL.md; do
        [ -f "${backup}" ] || continue

        name="$(basename "$(dirname "${backup}")")"
        personal="$(personal_copy "${name}")"

        if [ ! -f "${personal}" ]; then
            echo "✗ No personal copy of ${name} at ${personal}, so its back-up is left as it is." >&2
            continue
        fi

        if cmp -s "${backup}" "${personal}"; then
            echo "${name}: already up to date"
            continue
        fi

        cp "${personal}" "${backup}"
        echo "${name}: back-up brought up to date from ${personal}"
    done
}

main() {
    local mode="${1:-check}"
    local backups

    backups="$(backups_dir)"

    case "${mode}" in
        check)
            check "${backups}"
            ;;
        sync)
            sync "${backups}"
            ;;
        *)
            echo "✗ Unknown mode ${mode}. Usage: check-skill-backups.sh [sync]" >&2
            exit 1
            ;;
    esac
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
