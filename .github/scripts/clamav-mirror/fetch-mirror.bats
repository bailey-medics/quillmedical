#!/usr/bin/env bats
# Tests for fetch-mirror.sh
#
# docker is stubbed: what matters is which image is asked for, that its
# files land where the build or the scan looks, and that an image with no
# definitions, or a package other than the one pinned, is refused rather
# than used.

bats_require_minimum_version 1.5.0

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/fetch-mirror.sh"
  OUT="${BATS_TEST_TMPDIR}/out"
  CALLS="${BATS_TEST_TMPDIR}/docker-calls"
  DOCKERFILE="${BATS_TEST_TMPDIR}/Dockerfile.scan"
  : > "$CALLS"

  # The packages the stub mirror carries, and the Dockerfile pinning
  # their real checksums, so a good mirror passes the check.
  AMD64_BODY="amd64 package"
  ARM64_BODY="arm64 package"
  pin_dockerfile "$(printf '%s' "$AMD64_BODY" | sha256sum | cut -d' ' -f1)" \
    "$(printf '%s' "$ARM64_BODY" | sha256sum | cut -d' ' -f1)"

  STUB_DIR="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "$STUB_DIR"
  PATH="${STUB_DIR}:${PATH}"
}

# Writes a Dockerfile.scan pinning version 1.4.6 and the two checksums.
pin_dockerfile() {
  local amd64_sum="$1"
  local arm64_sum="$2"

  {
    printf 'ARG CLAMAV_VERSION=1.4.6\n'
    printf 'ARG CLAMAV_SHA256_AMD64=%s\n' "$amd64_sum"
    printf 'ARG CLAMAV_SHA256_ARM64=%s\n' "$arm64_sum"
  } > "$DOCKERFILE"
}

# A docker that records its arguments, and on `cp` writes a mirror's files:
# definitions unless WITH_DB=0, the two packages, and a VERSION.
# AMD64 overrides the x86_64 package's contents; VERSION its version.
stub_docker() {
  local with_db="${1:-1}"
  local amd64="${AMD64:-$AMD64_BODY}"
  local version="${VERSION:-1.4.6}"

  cat > "${STUB_DIR}/docker" <<STUB
#!/usr/bin/env bash
echo "\$*" >> "${CALLS}"
case "\$1" in
  create) echo "container-1" ;;
  cp)
    mkdir -p "\$3/db"
    echo "${version}" > "\$3/VERSION"
    printf '%s' "${amd64}" > "\$3/clamav-1.4.6.linux.x86_64.deb"
    printf '%s' "${ARM64_BODY}" > "\$3/clamav-1.4.6.linux.aarch64.deb"
    if [ "${with_db}" = "1" ]; then echo x > "\$3/db/main.cvd"; fi
    ;;
esac
STUB
  chmod +x "${STUB_DIR}/docker"
}

@test "fails without its arguments" {
  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage: fetch-mirror.sh"* ]]
}

@test "fails when the Dockerfile pins no version" {
  stub_docker
  : > "$DOCKERFILE"

  run bash "$SCRIPT" bailey-medics "$DOCKERFILE" "$OUT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"does not pin CLAMAV_VERSION"* ]]
}

@test "asks for the mirror tagged with the pinned version, owner lower-cased" {
  stub_docker

  run bash "$SCRIPT" Bailey-Medics "$DOCKERFILE" "$OUT"

  [ "$status" -eq 0 ]
  grep -q "pull --quiet ghcr.io/bailey-medics/clamav-mirror:1.4.6" "$CALLS"
}

@test "copies the mirror's files out and removes the container" {
  stub_docker

  run bash "$SCRIPT" bailey-medics "$DOCKERFILE" "$OUT"

  [ "$status" -eq 0 ]
  [ -f "${OUT}/db/main.cvd" ]
  grep -q "cp container-1:/clamav/. ${OUT}" "$CALLS"
  grep -q "rm container-1" "$CALLS"
}

@test "fails closed when the mirror holds no definitions" {
  stub_docker 0

  run ! bash "$SCRIPT" bailey-medics "$DOCKERFILE" "$OUT"

  [[ "$output" == *"holds no definitions"* ]]
}

@test "passes when both packages match the pinned checksums" {
  stub_docker

  run bash "$SCRIPT" bailey-medics "$DOCKERFILE" "$OUT"

  [ "$status" -eq 0 ]
  [[ "$output" == *"its packages checked"* ]]
}

@test "fails closed when a package does not match its pinned checksum" {
  AMD64="a package somebody swapped in" stub_docker

  run ! bash "$SCRIPT" bailey-medics "$DOCKERFILE" "$OUT"

  [[ "$output" == *"x86_64 package does not match the checksum"* ]]
}

@test "fails closed when the mirror is missing a package" {
  stub_docker
  sed -i 's/aarch64.deb"/aarch64.deb.gone"/' "${STUB_DIR}/docker"

  run ! bash "$SCRIPT" bailey-medics "$DOCKERFILE" "$OUT"

  [[ "$output" == *"holds no aarch64 package"* ]]
}

@test "fails closed when the mirror holds another version" {
  VERSION="9.9.9" stub_docker

  run ! bash "$SCRIPT" bailey-medics "$DOCKERFILE" "$OUT"

  [[ "$output" == *"not the 1.4.6 pinned"* ]]
}

@test "fails when the Dockerfile pins no checksums" {
  stub_docker
  printf 'ARG CLAMAV_VERSION=1.4.6\n' > "$DOCKERFILE"

  run ! bash "$SCRIPT" bailey-medics "$DOCKERFILE" "$OUT"

  [[ "$output" == *"does not pin CLAMAV_SHA256_AMD64 and CLAMAV_SHA256_ARM64"* ]]
}
