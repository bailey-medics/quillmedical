#!/usr/bin/env bats
# Tests for owl/install.sh, which installs Owl as a systemd user service
# and moves the box across from the alert watcher's old names.
#
# systemctl, yarn, loginctl, uname and tmux are stubs that record what they were
# asked, so no service is touched and no package installed. The worktree
# is a throwaway git repository, so the "only from Owl's worktree" check sees
# a real top level.

bats_require_minimum_version 1.5.0

setup() {
    SCRIPT="$(cd "${BATS_TEST_DIRNAME}/../owl" && pwd)/install.sh"
    CALLS="${BATS_TEST_TMPDIR}/calls"
    export HOME="${BATS_TEST_TMPDIR}/home"
    export OWL_WORKTREE="${BATS_TEST_TMPDIR}/quillmedical-owl"
    export USER="tester"
    unset XDG_STATE_HOME OLD_ACTIVE Q5_EXISTS

    mkdir -p "${HOME}/.config/systemd/user" "${HOME}/.local/state" "${OWL_WORKTREE}/scripts/owl" "${BATS_TEST_TMPDIR}/bin"
    git -C "${OWL_WORKTREE}" init --quiet

    write_stub systemctl 'if [ "$2" = "is-active" ]; then [ "${OLD_ACTIVE:-}" = "1" ]; fi'
    write_stub yarn ''
    write_stub loginctl 'echo "Linger=yes"'
    write_stub uname 'echo Linux'
    write_stub tmux 'if [ "$1" = "has-session" ]; then [ "${Q5_EXISTS:-}" = "1" ]; fi'
    export PATH="${BATS_TEST_TMPDIR}/bin:${PATH}"
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

# The box as it is before the rename: the old folders, an env file naming
# its channel the old way, gcloud's file holding the old path, and the
# old service's link.
old_box() {
    local config="${HOME}/.config/quill-alert-watcher"

    mkdir -p "${config}/gcloud/logs" "${HOME}/.local/state/quill-alert-watcher/alerts"
    printf 'SLACK_APP_TOKEN=a\nSLACK_BOT_TOKEN=b\nALERT_WATCHER_CHANNEL=C0123456789\n' > "${config}/env"
    chmod 0600 "${config}/env"
    printf '{"cert_path": "%s/pki/watcher.crt"}\n' "${config}" > "${config}/gcloud/certificate_config.json"
    printf 'path %s\n' "${config}" > "${config}/gcloud/logs/old.log"
    printf '[]\n' > "${HOME}/.local/state/quill-alert-watcher/ledger.json"
    ln -s "${OWL_WORKTREE}/scripts/alert-watcher/quill-alert-watcher.service" "${HOME}/.config/systemd/user/quill-alert-watcher.service"
}

new_box() {
    mkdir -p "${HOME}/.config/quill-owl"
    printf 'SLACK_APP_TOKEN=a\nSLACK_BOT_TOKEN=b\nOWL_CHANNEL=C0123456789\n' > "${HOME}/.config/quill-owl/env"
    chmod 0600 "${HOME}/.config/quill-owl/env"
}

@test "anywhere but Owl's worktree is refused, and nothing is touched" {
    new_box

    cd "${BATS_TEST_TMPDIR}"
    run "$SCRIPT"

    [ "$status" -eq 1 ]
    [[ "$output" == *"Run this on the home box"* ]]
    [ "$(grep -c '^systemctl' "$CALLS" 2>/dev/null || true)" -eq 0 ]
}

@test "a first install links, enables and starts quill-owl" {
    new_box

    cd "${OWL_WORKTREE}"
    run "$SCRIPT"

    [ "$status" -eq 0 ]
    grep -qx "systemctl --user link ${OWL_WORKTREE}/scripts/owl/quill-owl.service" "$CALLS"
    grep -qx "systemctl --user enable --now quill-owl.service" "$CALLS"
    [ "$(grep -c 'stop quill-alert-watcher' "$CALLS")" -eq 0 ]
}

@test "the old service is stopped and its dangling link removed" {
    old_box

    cd "${OWL_WORKTREE}"
    run "$SCRIPT"

    [ "$status" -eq 0 ]
    grep -qx "systemctl --user stop quill-alert-watcher.service" "$CALLS"
    [ ! -L "${HOME}/.config/systemd/user/quill-alert-watcher.service" ]
}

@test "the old service's link in default.target.wants is removed too" {
    local wants="${HOME}/.config/systemd/user/default.target.wants"

    old_box
    mkdir -p "${wants}"
    ln -s "${OWL_WORKTREE}/scripts/alert-watcher/quill-alert-watcher.service" "${wants}/quill-alert-watcher.service"

    cd "${OWL_WORKTREE}"
    run "$SCRIPT"

    [ "$status" -eq 0 ]
    [ ! -L "${wants}/quill-alert-watcher.service" ]
}

@test "the old service is stopped before anything is moved" {
    old_box

    cd "${OWL_WORKTREE}"
    run "$SCRIPT"

    [ "$status" -eq 0 ]
    [[ "$output" == *"Stopped and removed quill-alert-watcher.service."*"Moved "* ]]
}

@test "both folders move to their quill-owl names, keeping what they hold" {
    old_box

    cd "${OWL_WORKTREE}"
    run "$SCRIPT"

    [ "$status" -eq 0 ]
    [ ! -e "${HOME}/.config/quill-alert-watcher" ]
    [ ! -e "${HOME}/.local/state/quill-alert-watcher" ]
    [ -f "${HOME}/.local/state/quill-owl/ledger.json" ]
    grep -q "SLACK_BOT_TOKEN=b" "${HOME}/.config/quill-owl/env"
}

@test "gcloud's files name the new folder, and its logs are left alone" {
    old_box

    cd "${OWL_WORKTREE}"
    run "$SCRIPT"

    [ "$status" -eq 0 ]
    grep -qF "${HOME}/.config/quill-owl/pki/watcher.crt" "${HOME}/.config/quill-owl/gcloud/certificate_config.json"
    grep -qF "${HOME}/.config/quill-alert-watcher" "${HOME}/.config/quill-owl/gcloud/logs/old.log"
}

@test "the env file's channel is renamed to OWL_CHANNEL" {
    old_box

    cd "${OWL_WORKTREE}"
    run "$SCRIPT"

    [ "$status" -eq 0 ]
    grep -qx "OWL_CHANNEL=C0123456789" "${HOME}/.config/quill-owl/env"
    run ! grep -q "ALERT_WATCHER_" "${HOME}/.config/quill-owl/env"
}

@test "moving across with the old q5 still running says to stop it" {
    old_box
    export Q5_EXISTS=1

    cd "${OWL_WORKTREE}"
    run "$SCRIPT"

    [ "$status" -eq 0 ]
    [[ "$output" == *"q5, Owl's session before the rename, is still running"* ]]
}

@test "moving across with no q5 left says nothing about it" {
    old_box

    cd "${OWL_WORKTREE}"
    run "$SCRIPT"

    [ "$status" -eq 0 ]
    [[ "$output" != *"q5, Owl's session"* ]]
}

@test "a second run moves nothing and asks for no restart" {
    old_box
    export Q5_EXISTS=1
    cd "${OWL_WORKTREE}"
    "$SCRIPT" >/dev/null

    run "$SCRIPT"

    [ "$status" -eq 0 ]
    [[ "$output" != *"Moved "* ]]
    [[ "$output" != *"q5, Owl's session"* ]]
}

@test "a folder under both names is refused before the service is stopped" {
    old_box
    mkdir -p "${HOME}/.config/quill-owl"

    cd "${OWL_WORKTREE}"
    run "$SCRIPT"

    [ "$status" -eq 1 ]
    [[ "$output" == *"Keep one"* ]]
    [ -d "${HOME}/.config/quill-alert-watcher" ]
    [ "$(grep -c 'stop quill-alert-watcher' "$CALLS" 2>/dev/null || true)" -eq 0 ]
}

@test "an env file others can read is refused" {
    new_box
    chmod 0644 "${HOME}/.config/quill-owl/env"

    cd "${OWL_WORKTREE}"
    run "$SCRIPT"

    [ "$status" -eq 1 ]
    [[ "$output" == *"must be mode 0600"* ]]
}
