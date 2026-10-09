#!/usr/bin/env bash
# Downloads and installs a pinned version of actionlint for CI use.
#
# Usage: install-actionlint.sh
#
# The lint job used to run actionlint from its Docker image, which is
# published on Docker Hub only. Docker Hub limits how often a runner with
# no login may pull, and the job failed whenever GitHub's shared runners
# had used the allowance up. The release archive comes from GitHub, which
# the runner can always reach.
#
# Verifies the downloaded archive against actionlint's published checksums
# before installing, so CI never runs an unverified binary. Installs to
# /usr/local/bin/actionlint. Bump ACTIONLINT_VERSION deliberately, not
# silently.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "$0")/../shared/logging.sh" "install-actionlint"

ACTIONLINT_VERSION="1.7.8"
OS="linux"
ARCH="amd64"

base_url="https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}"
archive="actionlint_${ACTIONLINT_VERSION}_${OS}_${ARCH}.tar.gz"
checksums="actionlint_${ACTIONLINT_VERSION}_checksums.txt"

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

log "Downloading actionlint v${ACTIONLINT_VERSION} for ${OS}/${ARCH}..."
curl -fsSL -o "$work_dir/$archive" "$base_url/$archive"
curl -fsSL -o "$work_dir/$checksums" "$base_url/$checksums"

log "Verifying checksum against actionlint's published checksums..."
if ! (cd "$work_dir" && grep " ${archive}\$" "$checksums" | sha256sum -c -); then
  error "Checksum verification failed for $archive"
  exit 1
fi

log "Extracting and installing to /usr/local/bin/actionlint..."
tar -xzf "$work_dir/$archive" -C "$work_dir" actionlint
sudo install -m 0755 "$work_dir/actionlint" /usr/local/bin/actionlint

actionlint -version
log "actionlint v${ACTIONLINT_VERSION} installed."
