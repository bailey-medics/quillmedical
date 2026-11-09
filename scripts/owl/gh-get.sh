#!/usr/bin/env bash
# Reads one GitHub API path for Owl's skills, with a GET and nothing else.
#
# Usage: gh-get.sh <path>
#
# Owl's session may run this without a prompt, where a bare `gh api` may
# not. `gh api` reads by default, but `-f`, `-F`, `--input` or `-X` turn it
# into a write, made as the person signed in to gh on the box. Here the one
# argument is the path, the method is always GET, and no other option can be
# passed.
#
# Only two kinds of path are allowed, so the private repositories the
# sign-in can see are not among them:
#
# - repos/bailey-medics/quillmedical/..., this repository
# - repos/<owner>/<repo>/... for any owner but bailey-medics, such as a
#   supplier's releases
#
# A path holds letters, digits and `._/-`, and may end in a query string of
# letters, digits and `._=&,-`. `..` is refused.
#
# Exit codes:
#   0  read
#   1  GitHub refused the request, or could not be reached
#   2  wrong usage, or a path that is not allowed
set -euo pipefail

readonly OWN_REPOSITORY='^repos/bailey-medics/quillmedical(/[A-Za-z0-9._/-]*)?(\?[A-Za-z0-9._=&,-]+)?$'
readonly OTHER_OWNER='^repos/([A-Za-z0-9._-]+)/[A-Za-z0-9._-]+(/[A-Za-z0-9._/-]*)?(\?[A-Za-z0-9._=&,-]+)?$'

main() {
    local path="${1:-}"

    if [ "$#" -ne 1 ] || [ -z "${path}" ]; then
        echo "Usage: gh-get.sh <path>" >&2
        exit 2
    fi

    if [[ "${path}" == *..* ]]; then
        echo "✗ Not an allowed path: it holds '..'." >&2
        exit 2
    fi

    if [[ "${path}" =~ ${OWN_REPOSITORY} ]]; then
        gh api --method GET "${path}" || exit 1
        exit 0
    fi

    if [[ "${path}" =~ ${OTHER_OWNER} ]] && [ "${BASH_REMATCH[1],,}" != "bailey-medics" ]; then
        gh api --method GET "${path}" || exit 1
        exit 0
    fi

    echo "✗ Not an allowed path. gh-get.sh reads repos/bailey-medics/quillmedical/... and other owners' repositories." >&2
    exit 2
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
