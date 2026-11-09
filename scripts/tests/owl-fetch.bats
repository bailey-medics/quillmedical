#!/usr/bin/env bats
# Tests for owl/fetch.sh, which reads one whitelisted web address for Owl's
# skills and never sends anything.
#
# curl is replaced by a stub that records its arguments, one per line, and
# prints a body, so no test reaches the network.
#
# cspell:ignore curlrc

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/../owl/fetch.sh"
    CALLS="${BATS_TEST_TMPDIR}/curl-calls"
    unset CURL_FAILS

    mkdir -p "${BATS_TEST_TMPDIR}/bin"
    cat > "${BATS_TEST_TMPDIR}/bin/curl" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$@" > "${CALLS}"
if [ "\${CURL_FAILS:-}" = "1" ]; then
    exit 22
fi
echo '{"incidents": []}'
EOF
    chmod +x "${BATS_TEST_TMPDIR}/bin/curl"
    export PATH="${BATS_TEST_TMPDIR}/bin:${PATH}"
}

@test "GitHub's status page is fetched, and its body printed" {
    run "$SCRIPT" https://www.githubstatus.com/api/v2/incidents/unresolved.json
    [ "$status" -eq 0 ]
    [ "$output" = '{"incidents": []}' ]
    [ "$(tail -n 1 "$CALLS")" = "https://www.githubstatus.com/api/v2/incidents/unresolved.json" ]
}

@test "Google Cloud's status page is fetched" {
    run "$SCRIPT" https://status.cloud.google.com/incidents.json
    [ "$status" -eq 0 ]
    [ "$(tail -n 1 "$CALLS")" = "https://status.cloud.google.com/incidents.json" ]
}

@test "curl ignores any curlrc, and is held to https" {
    run "$SCRIPT" https://status.cloud.google.com/incidents.json
    [ "$(head -n 1 "$CALLS")" = "-q" ]
    grep -qx -- "--proto" "$CALLS"
    grep -qx -- "=https" "$CALLS"
    grep -qx -- "--proto-redir" "$CALLS"
}

@test "a status page that fails exits 1" {
    CURL_FAILS=1 run "$SCRIPT" https://status.cloud.google.com/incidents.json
    [ "$status" -eq 1 ]
}

@test "a release download fetches one byte, writes nothing and prints the status" {
    run "$SCRIPT" https://github.com/Cisco-Talos/clamav/releases/download/clamav-1.4.6/clamav-1.4.6.linux.aarch64.deb
    [ "$status" -eq 0 ]
    grep -qx -- "--range" "$CALLS"
    grep -qx -- "0-0" "$CALLS"
    grep -qx -- "/dev/null" "$CALLS"
    grep -qxF -- 'HTTP %{http_code}\n' "$CALLS"
}

@test "a release download that fails still exits 0, so its status can be read" {
    CURL_FAILS=1 run "$SCRIPT" https://github.com/Cisco-Talos/clamav/releases/download/clamav-1.4.6/clamav.deb
    [ "$status" -eq 0 ]
}

@test "no option that sends data is ever passed" {
    run "$SCRIPT" https://www.githubstatus.com/api/v2/incidents/unresolved.json
    [ "$(grep -cE -- '^(-d|--data.*|--json|-F|--form|-T|--upload-file|-X|--request)$' "$CALLS")" -eq 0 ]
}

@test "an address not on the whitelist is refused, and curl is not run" {
    run "$SCRIPT" https://example.com/
    [ "$status" -eq 2 ]
    [[ "$output" == *"Not an allowed address"* ]]
    [ ! -e "$CALLS" ]
}

@test "plain http is refused" {
    run "$SCRIPT" http://www.githubstatus.com/api/v2/incidents/unresolved.json
    [ "$status" -eq 2 ]
}

@test "a lookalike host is refused" {
    run "$SCRIPT" https://www.githubstatus.com.example.com/api/v2/x
    [ "$status" -eq 2 ]
    run "$SCRIPT" https://status.cloud.google.com@example.com/
    [ "$status" -eq 2 ]
}

@test "github.com outside a release download is refused" {
    run "$SCRIPT" https://github.com/bailey-medics/quillmedical-private
    [ "$status" -eq 2 ]
}

@test "a query string is refused, so nothing travels in the address" {
    run "$SCRIPT" "https://status.cloud.google.com/incidents.json?x=secret"
    [ "$status" -eq 2 ]
}

@test "a space in the address is refused" {
    run "$SCRIPT" "https://status.cloud.google.com/incidents.json -d @file"
    [ "$status" -eq 2 ]
}

@test "dot-dot is refused" {
    run "$SCRIPT" https://www.githubstatus.com/api/v2/../../x
    [ "$status" -eq 2 ]
}

@test "a second argument is refused" {
    run "$SCRIPT" https://status.cloud.google.com/incidents.json -d
    [ "$status" -eq 2 ]
    [[ "$output" == *"Usage"* ]]
    [ ! -e "$CALLS" ]
}

@test "no argument is refused" {
    run "$SCRIPT"
    [ "$status" -eq 2 ]
}
