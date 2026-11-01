#!/usr/bin/env bats
# Tests for check-home-details.sh, which refuses addresses, tailnet names
# and other details of a home or dev set-up in tracked files.
#
# Each test builds a throwaway repository and runs the script inside it,
# so the real local-path.sh makes its local/ there and nothing here
# touches the real one. Every address below is made up, and this file is
# exempt from the check because its name ends .bats.

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/../check-home-details.sh"
    REPO="${BATS_TEST_TMPDIR}/repo"

    git init -q "$REPO"
    git -C "$REPO" -c user.name=t -c user.email=t@example.com \
        commit -q --allow-empty -m "start"

    # The path as local-path.sh prints it: macOS keeps its temporary
    # directory behind a symlink.
    DENYLIST="$(cd -P "$REPO" && pwd)/local/home-details-denylist"

    cd "$REPO"
}

# Runs the script as it runs on a developer's machine.
check() {
    run env -u CI "$SCRIPT" "$@"
}

# Runs the script as it runs in CI.
check_in_ci() {
    run env CI=true "$SCRIPT" "$@"
}

@test "a clean file passes" {
    echo "Nothing to see here." > notes.md

    check notes.md
    [ "$status" -eq 0 ]
}

@test "a LAN host address in a document fails" {
    printf 'one\nreach it at 192.168.1.20.\n' > notes.md

    check notes.md
    [ "$status" -eq 1 ]
    [[ "$output" == *"notes.md:2: home detail (private address)"* ]]
}

@test "a tailnet host address fails" {
    echo "the phone loads http://100.101.102.103" > notes.md

    check notes.md
    [ "$status" -eq 1 ]
    [[ "$output" == *"(private address)"* ]]
}

@test "the same address in a test file passes" {
    echo 'CLIENT = "192.168.1.20"' > client_test.py

    check client_test.py
    [ "$status" -eq 0 ]
}

@test "a CIDR passes" {
    echo 'ip_cidr_range = "10.0.0.0/20"' > network.tf

    check network.tf
    [ "$status" -eq 0 ]
}

@test "a network address ending .0 passes" {
    echo 'address = "10.8.0.0"' > network.tf

    check network.tf
    [ "$status" -eq 0 ]
}

@test "a public address passes" {
    echo "the load balancer is on 100.200.1.2" > notes.md

    check notes.md
    [ "$status" -eq 0 ]
}

@test "a version number passes" {
    echo '"storybook": "10.6.2"' > package.json

    check package.json
    [ "$status" -eq 0 ]
}

@test "a named tailnet fails" {
    echo "devbox.example-tailnet.ts.net" > notes.md

    check notes.md
    [ "$status" -eq 1 ]
    [[ "$output" == *"(tailnet name)"* ]]
}

@test "the bare tailnet suffix passes" {
    echo "ALLOWED_HOSTS=devbox,.ts.net" > .env-sample

    check .env-sample
    [ "$status" -eq 0 ]
}

@test "a tailnet IPv6 address fails" {
    echo "listening on fd7a:115c:a1e0::1" > notes.md

    check notes.md
    [ "$status" -eq 1 ]
    [[ "$output" == *"(tailnet IPv6 address)"* ]]
}

@test "a MAC address fails" {
    echo "the box is aa:bb:cc:dd:ee:0f on the router" > notes.md

    check notes.md
    [ "$status" -eq 1 ]
    [[ "$output" == *"(MAC address)"* ]]
}

@test "a longer fingerprint passes" {
    echo "fingerprint AB:CD:EF:01:23:45:67:89" > notes.md

    check notes.md
    [ "$status" -eq 0 ]
}

@test "the output names the file and line but not the text" {
    echo "reach it at 192.168.1.20" > notes.md

    check notes.md
    [ "$status" -eq 1 ]
    [[ "$output" != *"192.168.1.20"* ]]
}

@test "a literal from the denylist fails, whatever its case" {
    echo "Nothing to see here." > notes.md
    check notes.md
    [ -f "$DENYLIST" ]
    echo "example-laptop" >> "$DENYLIST"
    echo "banners go to Example-Laptop" > notes.md

    check notes.md
    [ "$status" -eq 1 ]
    [[ "$output" == *"notes.md:1: home detail (a literal from local/home-details-denylist)"* ]]
    [[ "$output" != *"Example-Laptop"* ]]
}

@test "the denylist's comments are not literals" {
    echo "Nothing to see here." > notes.md
    check notes.md
    grep -qx '#' "$DENYLIST"

    # The header holds a line that is a bare #, which would match any
    # Markdown heading if comments were read as literals.
    printf '# A heading\n' > notes.md

    check notes.md
    [ "$status" -eq 0 ]
}

@test "the denylist is made with its header when it is missing" {
    echo "Nothing to see here." > notes.md
    [ ! -e "$DENYLIST" ]

    check notes.md
    [ "$status" -eq 0 ]
    [ -f "$DENYLIST" ]
    head -1 "$DENYLIST" | grep -q '^# Home details'
}

@test "a denylist that is there is left as it is" {
    mkdir -p "$(dirname "$DENYLIST")"
    echo "example-laptop" > "$DENYLIST"
    echo "Nothing to see here." > notes.md

    check notes.md
    [ "$(cat "$DENYLIST")" = "example-laptop" ]
}

@test "CI makes no denylist and checks the patterns" {
    echo "reach it at 192.168.1.20" > notes.md

    check_in_ci notes.md
    [ "$status" -eq 1 ]
    [ ! -e "$(dirname "$DENYLIST")" ]
}

@test "--all checks every tracked file" {
    echo "reach it at 192.168.1.20" > tracked.md
    echo "reach it at 192.168.1.20" > untracked.md
    git add tracked.md

    check --all
    [ "$status" -eq 1 ]
    [[ "$output" == *"tracked.md:1:"* ]]
    [[ "$output" != *"untracked.md"* ]]
}

@test "no files is a pass" {
    check
    [ "$status" -eq 0 ]
}
