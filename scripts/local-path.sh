#!/usr/bin/env bash
# Print the path of the shared local/ folder.
#
# local/ holds files kept out of git, and there is one of it: the main
# checkout's. Every worktree reaches it through this path, so a script
# run from any of them reads and writes the same files.
#
# Not a symlink in each worktree. A file under a symlinked folder makes
# `git check-ignore` stop with "beyond a symbolic link", and an editor
# that asks about a batch of paths then loses the answer for all of them.

set -euo pipefail

common_dir="$(git rev-parse --path-format=absolute --git-common-dir)"
main_checkout="$(cd -P "$(dirname "$common_dir")" && pwd)"
shared="${main_checkout}/local"
exclude="${common_dir}/info/exclude"

mkdir -p "$shared"

# .gitignore travels with a branch, so the main checkout on a branch cut
# before the rule landed would show local/ as untracked. info/exclude is
# read whatever is checked out, and is never committed.
mkdir -p "$(dirname "$exclude")"
touch "$exclude"

if ! grep -qxF "/local" "$exclude"; then
    echo "/local" >> "$exclude"
fi

echo "$shared"
