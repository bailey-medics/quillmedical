#!/usr/bin/env bats
# Tests for owl/gh-get.sh, which reads one GitHub API path for Owl's skills,
# always with a GET.
#
# gh is replaced by a stub that records its arguments, one per line, so no
# test reaches GitHub.
#
# cspell:ignore XDELETE

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/../owl/gh-get.sh"
    CALLS="${BATS_TEST_TMPDIR}/gh-calls"
    unset GH_FAILS

    mkdir -p "${BATS_TEST_TMPDIR}/bin"
    cat > "${BATS_TEST_TMPDIR}/bin/gh" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$@" > "${CALLS}"
if [ "\${GH_FAILS:-}" = "1" ]; then
    exit 1
fi
echo '{}'
EOF
    chmod +x "${BATS_TEST_TMPDIR}/bin/gh"
    export PATH="${BATS_TEST_TMPDIR}/bin:${PATH}"
}

@test "a path in this repository is read with a GET" {
    run "$SCRIPT" repos/bailey-medics/quillmedical/actions/runs/42567012147
    [ "$status" -eq 0 ]
    [ "$(cat "$CALLS")" = $'api\n--method\nGET\nrepos/bailey-medics/quillmedical/actions/runs/42567012147' ]
}

@test "the repository itself may be read" {
    run "$SCRIPT" repos/bailey-medics/quillmedical
    [ "$status" -eq 0 ]
}

@test "another owner's repository may be read" {
    run "$SCRIPT" repos/Cisco-Talos/clamav/releases/tags/clamav-1.4.6
    [ "$status" -eq 0 ]
    [ "$(tail -n 1 "$CALLS")" = "repos/Cisco-Talos/clamav/releases/tags/clamav-1.4.6" ]
}

@test "a query string is passed on" {
    run "$SCRIPT" "repos/bailey-medics/quillmedical/actions/runs?per_page=5&status=failure"
    [ "$status" -eq 0 ]
}

@test "a refusal from GitHub exits 1" {
    GH_FAILS=1 run "$SCRIPT" repos/bailey-medics/quillmedical
    [ "$status" -eq 1 ]
}

@test "bailey-medics' other repositories are refused, the private one among them" {
    run "$SCRIPT" repos/bailey-medics/quillmedical-private/contents/README.md
    [ "$status" -eq 2 ]
    [[ "$output" == *"Not an allowed path"* ]]
    [ ! -e "$CALLS" ]
}

@test "the owner is matched without regard to case" {
    run "$SCRIPT" repos/Bailey-Medics/quillmedical-private
    [ "$status" -eq 2 ]
}

@test "a path outside repos/ is refused" {
    run "$SCRIPT" user
    [ "$status" -eq 2 ]
    run "$SCRIPT" graphql
    [ "$status" -eq 2 ]
}

@test "an option in place of a path is refused" {
    run "$SCRIPT" -XDELETE
    [ "$status" -eq 2 ]
    [ ! -e "$CALLS" ]
}

@test "a second argument is refused, so no field can turn it into a write" {
    run "$SCRIPT" repos/bailey-medics/quillmedical/issues -f title=x
    [ "$status" -eq 2 ]
    [[ "$output" == *"Usage"* ]]
    [ ! -e "$CALLS" ]
}

@test "dot-dot is refused" {
    run "$SCRIPT" repos/bailey-medics/quillmedical/../quillmedical-private
    [ "$status" -eq 2 ]
}

@test "a space in the path is refused" {
    run "$SCRIPT" "repos/bailey-medics/quillmedical -X POST"
    [ "$status" -eq 2 ]
}

@test "no argument is refused" {
    run "$SCRIPT"
    [ "$status" -eq 2 ]
}
