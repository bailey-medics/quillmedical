#!/usr/bin/env bash
# Downloads and installs a pinned version of zizmor for CI use.
#
# Usage: install-zizmor.sh
#
# zizmor checks the GitHub Actions workflows for security mistakes. The
# pre-commit hook runs the same version from PyPI on a developer's
# machine; CI takes the release archive from GitHub, as it does for
# actionlint.
#
# zizmor publishes no checksums file, so the archive's SHA-256 is pinned
# here instead, copied from the digest GitHub records for the release
# asset. That is stronger than a checksums file downloaded beside the
# archive: a release replaced by somebody else cannot bring a matching
# hash with it. Installs to /usr/local/bin/zizmor. Bump ZIZMOR_VERSION
# and ZIZMOR_SHA256 together, deliberately, and keep the version in
# .pre-commit-config.yaml the same.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "install-zizmor"

ZIZMOR_VERSION="1.31.1"
ZIZMOR_SHA256="d185f726bdaf92df78273217dfdd24ebcd6b0ef48cf3ce776ff5762b6e138c99"
TARGET="x86_64-unknown-linux-gnu"

main() {
  local base_url="https://github.com/zizmorcore/zizmor/releases/download/v${ZIZMOR_VERSION}"
  local archive="zizmor-${TARGET}.tar.gz"
  local work_dir

  work_dir="$(mktemp -d)"
  # shellcheck disable=SC2064 # expanded now, while work_dir is in scope
  trap "rm -rf '$work_dir'" EXIT

  log "Downloading zizmor v${ZIZMOR_VERSION} for ${TARGET}..."
  curl -fsSL --retry 1 --retry-delay 30 -o "$work_dir/$archive" "$base_url/$archive"

  log "Verifying the archive against the pinned SHA-256..."
  if ! (cd "$work_dir" && echo "${ZIZMOR_SHA256}  ${archive}" | sha256sum -c -); then
    error "Checksum verification failed for $archive"
    exit 1
  fi

  log "Extracting and installing to /usr/local/bin/zizmor..."
  tar -xzf "$work_dir/$archive" -C "$work_dir" zizmor
  sudo install -m 0755 "$work_dir/zizmor" /usr/local/bin/zizmor

  zizmor --version
  log "zizmor v${ZIZMOR_VERSION} installed."
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
