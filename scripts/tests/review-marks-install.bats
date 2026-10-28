#!/usr/bin/env bats
# Tests for tools/review-marks/install.sh, which packs the review-marks
# extension and installs it. Only the check for `zip` is tested here: the
# rest needs VS Code. Kept apart from review-marks.bats, whose tests all
# need node, so these run where node is not installed too.

setup() {
    # shellcheck source=../../tools/review-marks/install.sh
    source "${BATS_TEST_DIRNAME}/../../tools/review-marks/install.sh"
}

# only_on_path <command>...: a folder holding a stand-in for each command
# named, to be the whole of PATH, so anything not named is not found.
only_on_path() {
    local bin="${BATS_TEST_TMPDIR}/bin"
    mkdir -p "$bin"

    for name in "$@"; do
        printf '#!/bin/sh\necho "%s $*" >> "%s/called"\n' "$name" "$BATS_TEST_TMPDIR" > "${bin}/${name}"
        chmod +x "${bin}/${name}"
    done

    echo "$bin"
}

@test "zip being installed is all require_zip asks" {
    PATH="$(only_on_path zip)" run require_zip

    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "without zip, on a machine with apt, the apt line is the one given" {
    PATH="$(only_on_path apt dnf)" run require_zip

    [ "$status" -eq 1 ]
    [[ "$output" == *"'zip' command was not found"* ]]
    [[ "$output" == *"sudo apt install zip"* ]]
    [[ "$output" != *"dnf"* ]]
    [[ "$output" != *"brew"* ]]
}

@test "without zip, on a machine with dnf and no apt, the dnf line is the one given" {
    PATH="$(only_on_path dnf)" run require_zip

    [ "$status" -eq 1 ]
    [[ "$output" == *"sudo dnf install zip"* ]]
    [[ "$output" != *"apt"* ]]
}

@test "without zip or a package manager it knows, every way to install it is given" {
    PATH="$(only_on_path)" run require_zip

    [ "$status" -eq 1 ]
    [[ "$output" == *"sudo apt install zip"* ]]
    [[ "$output" == *"sudo dnf install zip"* ]]
    [[ "$output" == *"brew install zip"* ]]
}

@test "without zip the installer stops before it installs anything" {
    PATH="$(only_on_path code apt)" run main

    [ "$status" -eq 1 ]
    [[ "$output" == *"sudo apt install zip"* ]]
    [ ! -e "${BATS_TEST_TMPDIR}/called" ]
}
