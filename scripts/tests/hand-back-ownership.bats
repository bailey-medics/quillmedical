#!/usr/bin/env bats
# Tests for hand-back-ownership.sh, which runs a command in a container and
# then gives what it wrote under a folder back to the host user.
#
# chown is replaced by a stub that records what it was asked to do, so the
# tests need no root and change no real ownership: the files here are the
# test's own, and the script hands back files owned by whoever runs it.

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/../hand-back-ownership.sh"
    TREE="${BATS_TEST_TMPDIR}/tree"
    CALLS="${BATS_TEST_TMPDIR}/chown-calls"

    mkdir -p "${TREE}/src/generated" "${TREE}/node_modules/pkg" "${BATS_TEST_TMPDIR}/bin"

    cat > "${BATS_TEST_TMPDIR}/bin/chown" <<EOF
#!/bin/sh
printf '%s\n' "\$@" >> "${CALLS}"
EOF
    chmod +x "${BATS_TEST_TMPDIR}/bin/chown"

    export PATH="${BATS_TEST_TMPDIR}/bin:${PATH}"
    unset HOST_UID HOST_GID
}

# A host user that is not the one running the tests.
other_uid() {
    echo $(( $(id -u) + 1 ))
}

@test "the command's output and exit status come through" {
    run "$SCRIPT" "$TREE" sh -c 'echo ran; exit 3'
    [ "$status" -eq 3 ]
    [ "$output" = "ran" ]
}

@test "a file the command wrote is handed back to the host user" {
    export HOST_UID="$(other_uid)" HOST_GID=4242

    run "$SCRIPT" "$TREE" touch "${TREE}/src/generated/types.json"
    [ "$status" -eq 0 ]
    grep -qx "${HOST_UID}:4242" "$CALLS"
    grep -qx "${TREE}/src/generated/types.json" "$CALLS"
}

@test "anything under node_modules is left alone" {
    export HOST_UID="$(other_uid)" HOST_GID=4242
    touch "${TREE}/node_modules/pkg/index.js"

    run "$SCRIPT" "$TREE" true
    [ "$status" -eq 0 ]
    ! grep -q node_modules "$CALLS"
}

@test "files are handed back after a failed command too" {
    export HOST_UID="$(other_uid)" HOST_GID=4242

    run "$SCRIPT" "$TREE" sh -c "touch '${TREE}/src/generated/types.json'; exit 1"
    [ "$status" -eq 1 ]
    grep -qx "${TREE}/src/generated/types.json" "$CALLS"
}

@test "the group defaults to the host user when HOST_GID is unset" {
    export HOST_UID="$(other_uid)"

    run "$SCRIPT" "$TREE" true
    [ "$status" -eq 0 ]
    grep -qx "${HOST_UID}:${HOST_UID}" "$CALLS"
}

@test "nothing is handed back when HOST_UID is unset, as on a Mac" {
    run "$SCRIPT" "$TREE" touch "${TREE}/src/generated/types.json"
    [ "$status" -eq 0 ]
    [ ! -e "$CALLS" ]
}

@test "nothing is handed back when the host user is already the owner" {
    export HOST_UID="$(id -u)"

    run "$SCRIPT" "$TREE" true
    [ "$status" -eq 0 ]
    [ ! -e "$CALLS" ]
}

@test "a missing command is refused with a usage message" {
    run "$SCRIPT" "$TREE"
    [ "$status" -eq 2 ]
    [[ "$output" == Usage:* ]]
}
