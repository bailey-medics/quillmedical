#!/usr/bin/env bash
# Installs Owl, the alert watcher, as a systemd user service, moving the
# box across from the names it had as the alert watcher.
#
# Usage: install.sh
#
# Run by `just owl-install`, from worktree 5 on the home box only, because
# the unit names worktree 5 by path: installing it from another checkout
# would run code that is not that checkout's.
#
# Safe to run again. On a box that still has quill-alert-watcher.service,
# it stops and unlinks that service, then moves ~/.config/quill-alert-watcher
# and ~/.local/state/quill-alert-watcher to their quill-owl names, so the
# Slack tokens, the ledger, the gcloud settings and the certificate all
# come across and nothing has to be made again. gcloud wrote the old
# folder's path into two of its files, and the env file names its channel
# ALERT_WATCHER_CHANNEL, so both are rewritten in the moved copy. A folder
# present under both names is refused: one of them is not what it looks
# like, and a person should decide which to keep.
#
# OWL_WORKTREE changes the worktree, as it does for the daemon.
set -euo pipefail

readonly OLD_NAME="quill-alert-watcher"
readonly NEW_NAME="quill-owl"

# Moves one folder from its old name to its new one. Nothing to move is
# fine; both present is refused.
move_folder() {
    local old="$1"
    local new="$2"

    if [ ! -e "${old}" ]; then
        return 0
    fi

    if [ -e "${new}" ]; then
        echo "✗ Both ${old} and ${new} exist. Keep one, then run this again." >&2
        return 1
    fi

    mv "${old}" "${new}"
    echo "Moved ${old} to ${new}."
}

# gcloud keeps absolute paths in some of its files, such as the
# certificate's location, so the old folder's path is rewritten in every
# text file under the new one. Its logs are history and are left alone.
rewrite_old_path() {
    local old="$1"
    local new="$2"
    local file

    if [ ! -d "${new}" ]; then
        return 0
    fi

    while IFS= read -r file; do
        sed -i "s|${old}|${new}|g" "${file}"
    done < <(grep -rlIF --exclude-dir=logs "${old}" "${new}" || true)
}

# Stops and unlinks the service under its old name, answering 0 when there
# was one. Its unit file moved with the code, so the link is dangling and
# is removed by hand.
retire_old_service() {
    local units="$1"
    local link="${units}/${OLD_NAME}.service"

    if [ ! -L "${link}" ] && ! systemctl --user is-active --quiet "${OLD_NAME}.service"; then
        return 1
    fi

    systemctl --user stop "${OLD_NAME}.service" || true
    systemctl --user disable "${OLD_NAME}.service" 2>/dev/null || true
    rm -f "${link}"
    systemctl --user daemon-reload
    echo "Stopped and removed ${OLD_NAME}.service."
}

main() {
    local worktree="${OWL_WORKTREE:-${HOME}/github/quillmedical-5}"
    local config="${HOME}/.config/${NEW_NAME}"
    local state="${XDG_STATE_HOME:-${HOME}/.local/state}"
    local units="${HOME}/.config/systemd/user"
    local env_file="${config}/env"
    local unit="${worktree}/scripts/owl/${NEW_NAME}.service"
    local toplevel
    local moved_across=0

    toplevel="$(git rev-parse --show-toplevel 2>/dev/null || true)"

    if [ "$(uname -s)" != "Linux" ] || [ "${toplevel}" != "${worktree}" ]; then
        echo "✗ Run this on the home box, from ${worktree}." >&2
        return 1
    fi

    if [ -e "${HOME}/.config/${OLD_NAME}" ] && [ -e "${config}" ]; then
        echo "✗ Both ${HOME}/.config/${OLD_NAME} and ${config} exist. Keep one, then run this again." >&2
        return 1
    fi

    if [ -e "${state}/${OLD_NAME}" ] && [ -e "${state}/${NEW_NAME}" ]; then
        echo "✗ Both ${state}/${OLD_NAME} and ${state}/${NEW_NAME} exist. Keep one, then run this again." >&2
        return 1
    fi

    if retire_old_service "${units}"; then
        moved_across=1
    fi

    move_folder "${HOME}/.config/${OLD_NAME}" "${config}"
    move_folder "${state}/${OLD_NAME}" "${state}/${NEW_NAME}"
    rewrite_old_path "${HOME}/.config/${OLD_NAME}" "${config}"

    # The tokens are the one thing the repository cannot supply: see the
    # watcher phase of docs/docs/plans/2026-10-19-remote-dev-machine-plan.md.
    if [ ! -f "${env_file}" ]; then
        echo "✗ No ${env_file} yet. It holds SLACK_APP_TOKEN, SLACK_BOT_TOKEN and OWL_CHANNEL." >&2
        return 1
    fi

    if [ "$(stat -c %a "${env_file}")" != "600" ]; then
        echo "✗ ${env_file} must be mode 0600: chmod 0600 ${env_file}" >&2
        return 1
    fi

    sed -i 's/^ALERT_WATCHER_/OWL_/' "${env_file}"

    (cd "${worktree}/scripts/owl" && yarn install --immutable)

    # `link` rather than a copy, so a merged change to the unit file takes
    # effect at the next daemon-reload without installing again.
    systemctl --user link "${unit}"
    systemctl --user daemon-reload
    systemctl --user enable --now "${NEW_NAME}.service"

    if ! loginctl show-user "${USER}" --property=Linger | grep -q "=yes"; then
        echo "! Lingering is off, so Owl stops when you log out. To start it at boot:"
        echo "    sudo loginctl enable-linger ${USER}"
    fi

    # A q5 started under the old names is left running, because a person
    # may be in it. Its Claude still has the old variable, so its hooks do
    # nothing until it is started again.
    if [ "${moved_across}" -eq 1 ]; then
        echo "! q5 was started before the rename. Start it again with:"
        echo "    tmux kill-session -t q5; systemctl --user restart ${NEW_NAME}"
    fi

    systemctl --user --no-pager status "${NEW_NAME}.service"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
