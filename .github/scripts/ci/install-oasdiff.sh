#!/usr/bin/env bash
# Downloads and installs a pinned version of the oasdiff CLI for CI use.
#
# Usage: install-oasdiff.sh
#
# Verifies the downloaded archive against oasdiff's published checksums.txt
# before installing, so CI never runs an unverified binary. Installs to
# /usr/local/bin/oasdiff. Bump OASDIFF_VERSION deliberately, not silently.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "$0")/../shared/logging.sh" "install-oasdiff"

OASDIFF_VERSION="1.29.1"
OS="linux"
ARCH="amd64"

base_url="https://github.com/oasdiff/oasdiff/releases/download/v${OASDIFF_VERSION}"
archive="oasdiff_${OASDIFF_VERSION}_${OS}_${ARCH}.tar.gz"

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

log "Downloading oasdiff v${OASDIFF_VERSION} for ${OS}/${ARCH}..."
curl -fsSL -o "$work_dir/$archive" "$base_url/$archive"
curl -fsSL -o "$work_dir/checksums.txt" "$base_url/checksums.txt"

log "Verifying checksum against oasdiff's published checksums.txt..."
if ! (cd "$work_dir" && grep " ${archive}\$" checksums.txt | sha256sum -c -); then
  error "Checksum verification failed for $archive"
  exit 1
fi

log "Extracting and installing to /usr/local/bin/oasdiff..."
tar -xzf "$work_dir/$archive" -C "$work_dir" oasdiff
sudo install -m 0755 "$work_dir/oasdiff" /usr/local/bin/oasdiff

oasdiff --version
log "oasdiff v${OASDIFF_VERSION} installed."
