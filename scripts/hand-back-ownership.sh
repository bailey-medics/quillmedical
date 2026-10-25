#!/bin/sh
# Run a command in a container, then hand what it wrote under a folder back
# to the host user.
#
# Usage: hand-back-ownership.sh <folder> <command> [args...]
#
# The frontend unit-test container runs as root, as its image does, and
# writes into the worktree it mounts: `yarn generate:types` rewrites
# frontend/src/generated/ on every run. Docker Desktop on a Mac maps the
# ownership of those files to the host user. A Linux host does not, so they
# come out owned by root, and the next host-side `yarn generate:types`, which
# Storybook runs, stops at EACCES.
#
# HOST_UID and HOST_GID, exported by the Justfile on Linux only, say who the
# host user is. Unset, or the same as the container's user, nothing is handed
# back. Anything under a node_modules folder is left alone: in this container
# those are named volumes, not the worktree.
#
# The command's own exit status is kept, so a failed test run still fails.

set -u

if [ "$#" -lt 2 ]; then
    echo "Usage: hand-back-ownership.sh <folder> <command> [args...]" >&2
    exit 2
fi

folder="$1"
shift

"$@"
status=$?

me="$(id -u)"

if [ -n "${HOST_UID:-}" ] && [ "${HOST_UID}" != "${me}" ]; then
    find "${folder}" -name node_modules -prune -o -user "${me}" \
        -exec chown "${HOST_UID}:${HOST_GID:-${HOST_UID}}" {} + || true
fi

exit "${status}"
