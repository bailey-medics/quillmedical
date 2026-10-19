#!/usr/bin/env bash
# Fetches the pinned ClamAV packages and today's definitions into a
# directory, ready to be pushed as the clamav-mirror image.
#
# Usage: build-mirror.sh <Dockerfile.scan> <out-directory>
#
# The one thing that asks ClamAV's servers for anything: once a day, from
# the clamav-mirror workflow. The version and the two checksums are read
# from backend/Dockerfile.scan, where Renovate watches them, so there is
# one pin and not two. Each package is checked against its checksum, and
# the definitions are proved against EICAR before anything is pushed.
#
# Leaves in <out-directory>:
#   clamav-<version>.linux.x86_64.deb
#   clamav-<version>.linux.aarch64.deb
#   db/            the definitions freshclam fetched
#   VERSION        the ClamAV version
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "build-mirror"

# Prints the value of one ARG in a Dockerfile.
arg_value() {
  local dockerfile="$1"
  local name="$2"

  sed -n -E "s/^ARG[[:space:]]+${name}=([^[:space:]]+).*$/\\1/p" "$dockerfile" | head -n 1
}

# Downloads one package and checks it against its pinned checksum.
fetch_package() {
  local version="$1"
  local arch="$2"
  local checksum="$3"
  local out_dir="$4"
  local name="clamav-${version}.linux.${arch}.deb"
  local url="https://github.com/Cisco-Talos/clamav/releases/download/clamav-${version}/${name}"

  log "Downloading ${name}"
  curl --fail --silent --show-error --location --retry 3 --output "${out_dir}/${name}" "$url"

  echo "${checksum}  ${out_dir}/${name}" | sha256sum --check --quiet -
}

# Writes a freshclam.conf that keeps the definitions in <db-directory>.
write_freshclam_conf() {
  local conf="$1"
  local db_dir="$2"

  {
    echo "DatabaseDirectory ${db_dir}"
    echo "DatabaseMirror database.clamav.net"
    echo "Foreground yes"
  } > "$conf"
}

# Fails unless ClamAV, with these definitions, flags the EICAR test file.
# Written here rather than checked in, so no file in the repository trips
# a scanner.
prove_detects_eicar() {
  local db_dir="$1"
  local work="$2"
  local found=""
  local signature=""
  local status=0

  # The `$` in the EICAR string is part of the string, which must reach
  # the file byte for byte, so it is quoted to stop it expanding.
  # shellcheck disable=SC2016
  printf '%s' 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > "${work}/sample"

  found="$(clamscan --database="$db_dir" --no-summary --infected "${work}/sample")" || status=$?
  rm -f "${work}/sample"

  # The signature, after the path, so a name in the path cannot pass for
  # one in what was found.
  signature="${found##*: }"

  if [ "$status" -ne 1 ] || [[ "${signature,,}" != *eicar* ]]; then
    error "ClamAV did not detect the EICAR test file with these definitions (clamscan exited ${status})"
    exit 1
  fi

  log "The definitions detect EICAR"
}

main() {
  local dockerfile="${1:-}"
  local out_dir="${2:-}"
  local version=""
  local sum_amd64=""
  local sum_arm64=""

  if [ -z "$dockerfile" ] || [ -z "$out_dir" ]; then
    error "Usage: build-mirror.sh <Dockerfile.scan> <out-directory>"
    exit 1
  fi

  if [ ! -f "$dockerfile" ]; then
    error "${dockerfile} does not exist"
    exit 1
  fi

  version="$(arg_value "$dockerfile" CLAMAV_VERSION)"
  sum_amd64="$(arg_value "$dockerfile" CLAMAV_SHA256_AMD64)"
  sum_arm64="$(arg_value "$dockerfile" CLAMAV_SHA256_ARM64)"

  if [ -z "$version" ] || [ -z "$sum_amd64" ] || [ -z "$sum_arm64" ]; then
    error "${dockerfile} does not pin CLAMAV_VERSION, CLAMAV_SHA256_AMD64 and CLAMAV_SHA256_ARM64"
    exit 1
  fi

  mkdir -p "${out_dir}/db"
  echo "$version" > "${out_dir}/VERSION"

  fetch_package "$version" x86_64 "$sum_amd64" "$out_dir"
  fetch_package "$version" aarch64 "$sum_arm64" "$out_dir"

  log "Installing ClamAV ${version} on this runner"
  sudo dpkg -i "${out_dir}/clamav-${version}.linux.x86_64.deb" >/dev/null

  write_freshclam_conf "${out_dir}/freshclam.conf" "$(cd "${out_dir}/db" && pwd)"

  log "Fetching today's definitions"
  freshclam --config-file="${out_dir}/freshclam.conf"
  rm -f "${out_dir}/freshclam.conf"

  prove_detects_eicar "${out_dir}/db" "$out_dir"

  log "Mirror ready: ClamAV ${version}, $(clamscan --database="${out_dir}/db" --version)"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
