#!/usr/bin/env bash
# Says whether a stack branch is spent: its pull request has merged and
# there is nothing open on it.
#
# Usage: stack-branch-merged.sh <branch>
#
# Run by `just stack-add` before it stacks a new branch on the one checked
# out. Stacking on a merged branch puts the new unit under the merged
# unit's name, because `gh stack add` rebases the branch level with the
# trunk, finds it empty, and commits onto it.
#
# The stack's own record cannot answer this: it knows what it knew at the
# last sync. So GitHub is asked.
#
# A merged pull request alone is not enough to call a branch spent. Branch
# names are reused: #1378 merged from a branch called
# `feature/docs-cybersecurity-page-matches-the-code`, and three weeks later
# #1772 was opened from a new branch of the same name. Asked only "has a
# pull request from this name merged?", GitHub said yes, and a live stack
# could not be added to. A branch with an open pull request is, by
# definition, not spent.
#
# Prints the merged pull request's number when the branch is spent.
#
# Exit codes:
#   0  not spent: nothing has merged from this name, or something is open
#   1  spent: a pull request has merged and none is open
#   2  GitHub could not be asked
set -euo pipefail

branch="${1:-}"

if [ -z "${branch}" ]; then
    echo "Usage: stack-branch-merged.sh <branch>" >&2
    exit 2
fi

# Prints the number of the first pull request from the branch in the given
# state, or nothing. Fails when GitHub cannot be asked.
first_pull_request() {
    gh pr list --head "${branch}" --state "$1" --json number \
        --jq '.[0].number // empty'
}

if ! merged="$(first_pull_request merged)"; then
    exit 2
fi

if [ -z "${merged}" ]; then
    exit 0
fi

if ! open="$(first_pull_request open)"; then
    exit 2
fi

if [ -n "${open}" ]; then
    exit 0
fi

echo "${merged}"
exit 1
