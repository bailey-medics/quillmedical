#!/usr/bin/env bash
# Downloads and installs a pinned version of gitleaks for CI use.
#
# Usage: install-gitleaks.sh
#
# Installed from its GitHub release, which the runner can always reach,
# and not run from a Docker image: see install-actionlint.sh for why.
#
# Verifies the downloaded archive against gitleaks' published checksums
# before installing, so CI never runs an unverified binary. Installs to
# /usr/local/bin/gitleaks. The version is the one the pre-commit hook
# uses (`rev` under the gitleaks repo in .pre-commit-config.yaml), so a
# commit meets the same rules on a laptop and in CI. Bump the two
# together, deliberately.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "install-gitleaks"

readonly GITLEAKS_VERSION="8.30.1"
readonly OS="linux"
readonly ARCH="x64"

main() {
  local base_url="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}"
  local archive="gitleaks_${GITLEAKS_VERSION}_${OS}_${ARCH}.tar.gz"
  local checksums="gitleaks_${GITLEAKS_VERSION}_checksums.txt"

  local work_dir=""
  work_dir="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '${work_dir}'" EXIT

  log "Downloading gitleaks v${GITLEAKS_VERSION} for ${OS}/${ARCH}..."
  curl -fsSL -o "${work_dir}/${archive}" "${base_url}/${archive}"
  curl -fsSL -o "${work_dir}/${checksums}" "${base_url}/${checksums}"

  log "Verifying checksum against gitleaks' published checksums..."
  if ! (cd "$work_dir" && grep " ${archive}\$" "$checksums" | sha256sum -c -); then
    error "Checksum verification failed for ${archive}"
    exit 1
  fi

  log "Extracting and installing to /usr/local/bin/gitleaks..."
  tar -xzf "${work_dir}/${archive}" -C "$work_dir" gitleaks
  sudo install -m 0755 "${work_dir}/gitleaks" /usr/local/bin/gitleaks

  gitleaks version
  log "gitleaks v${GITLEAKS_VERSION} installed."
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
