#!/usr/bin/env bats
# Tests that .gitleaks.toml still tells gitleaks to scan with its built-in
# rules.
#
# A gitleaks config file replaces those rules unless it extends them, and
# with no rules the scan passes everything. That is silent: the hook is
# green either way. These tests read the file and fail when the block
# that keeps the rules is gone or switched off. They do not run gitleaks,
# which the test image does not carry.

setup() {
    CONFIG="${BATS_TEST_DIRNAME}/../../.gitleaks.toml"
}

# Prints the lines of one TOML table, from its header to the next header.
table() {
    awk -v header="[$1]" '
        $0 == header { inside = 1; next }
        /^\[/ { inside = 0 }
        inside { print }
    ' "$2"
}

@test "the config extends the built-in rules" {
    run table extend "$CONFIG"

    [ "$status" -eq 0 ]
    [[ "$output" =~ (^|$'\n')useDefault[[:space:]]*=[[:space:]]*true($|$'\n') ]]
}

@test "a config with the block commented out is caught" {
    local broken="${BATS_TEST_TMPDIR}/broken.toml"
    sed 's/^useDefault = true$/# useDefault = true/' "$CONFIG" > "$broken"

    run table extend "$broken"

    [[ ! "$output" =~ (^|$'\n')useDefault[[:space:]]*=[[:space:]]*true($|$'\n') ]]
}

@test "a config with no extend block is caught" {
    local broken="${BATS_TEST_TMPDIR}/broken.toml"
    printf 'title = "t"\n\n[allowlist]\npaths = []\n' > "$broken"

    run table extend "$broken"

    [ -z "$output" ]
}

@test "no allowlist entry lets a whole folder of source through" {
    # An allowlist path is a regular expression. One that names a folder
    # and nothing else would exempt every file in it for good.
    run grep -nE "^\s*'''(\^)?(backend|frontend|infra|scripts|shared)(/)?(\\$)?'''" "$CONFIG"

    [ "$status" -eq 1 ]
}
