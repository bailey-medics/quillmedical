#!/usr/bin/env bash
# Reads one web address for Owl's skills, and nothing else: no data is sent,
# no file is written, and only the addresses below may be asked for.
#
# Usage: fetch.sh <url>
#
# Owl's session may run this without a prompt, where a bare curl may not,
# because a curl allowed by a pattern still takes any flag after it: `-d
# @file` sends a file, and a second address sends it somewhere else. Here the
# one argument is the address, checked against a whitelist, and every curl
# option is fixed.
#
# Two kinds of address are allowed:
#
# - Status pages: GitHub's under www.githubstatus.com/api/v2/, and Google
#   Cloud's under status.cloud.google.com/. The body is printed, up to 5 MB.
# - Release downloads on GitHub, github.com/<owner>/<repo>/releases/download/.
#   Only the first byte is fetched, and the HTTP status is printed, so a run
#   can see whether a download works without fetching the whole file.
#
# The address may hold letters, digits and `._~/%-`, so no query string, no
# space and nothing the shell or curl would read as more than an address.
# `..` is refused too.
#
# Exit codes:
#   0  fetched; for a release download, the status is printed whatever it is
#   1  a status page could not be fetched
#   2  wrong usage, or an address that is not allowed
#
# cspell:ignore curlrc redirs
set -euo pipefail

readonly STATUS_PAGE='^https://(www\.githubstatus\.com/api/v2/|status\.cloud\.google\.com/)[A-Za-z0-9._~/%-]*$'
readonly RELEASE_DOWNLOAD='^https://github\.com/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+/releases/download/[A-Za-z0-9._~/%-]+$'

# curl's options for every request. -q, which must come first, skips any
# ~/.curlrc, so nothing outside this script adds an option.
readonly CURL_OPTIONS=(
    -q
    --silent
    --show-error
    --location
    --max-redirs 5
    --proto =https
    --proto-redir =https
    --max-time 30
)

main() {
    local url="${1:-}"

    if [ "$#" -ne 1 ] || [ -z "${url}" ]; then
        echo "Usage: fetch.sh <url>" >&2
        exit 2
    fi

    if [[ "${url}" == *..* ]]; then
        echo "✗ Not an allowed address: it holds '..'." >&2
        exit 2
    fi

    if [[ "${url}" =~ ${STATUS_PAGE} ]]; then
        curl "${CURL_OPTIONS[@]}" --fail --max-filesize 5000000 "${url}" || exit 1
        exit 0
    fi

    if [[ "${url}" =~ ${RELEASE_DOWNLOAD} ]]; then
        curl "${CURL_OPTIONS[@]}" --range 0-0 --output /dev/null \
            --write-out 'HTTP %{http_code}\n' "${url}" || true
        exit 0
    fi

    echo "✗ Not an allowed address. fetch.sh reads GitHub's and Google Cloud's status pages, and GitHub release downloads." >&2
    exit 2
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
