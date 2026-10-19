#!/usr/bin/env bats
# Tests for build-mirror.sh
#
# curl, sudo, dpkg, freshclam and clamscan are stubbed: what matters is
# that the pinned checksums are checked, that the definitions are proved
# against EICAR before anything is pushed, and that each failure stops the
# run. sha256sum is the real one, since checking is the point.

bats_require_minimum_version 1.5.0

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/build-mirror.sh"
  OUT="${BATS_TEST_TMPDIR}/out"
  DOCKERFILE="${BATS_TEST_TMPDIR}/Dockerfile.scan"

  # The stub curl writes the package's own name as its contents, so the
  # pinned checksum of each is known here.
  local amd64
  local arm64
  amd64="$(printf 'clamav-1.4.6.linux.x86_64.deb' | sha256sum | cut -d' ' -f1)"
  arm64="$(printf 'clamav-1.4.6.linux.aarch64.deb' | sha256sum | cut -d' ' -f1)"
  {
    echo "ARG CLAMAV_VERSION=1.4.6"
    echo "ARG CLAMAV_SHA256_AMD64=${amd64}"
    echo "ARG CLAMAV_SHA256_ARM64=${arm64}"
  } > "$DOCKERFILE"

  STUB_DIR="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "$STUB_DIR"
  PATH="${STUB_DIR}:${PATH}"

  stub curl '
out=""
url=""
while [ $# -gt 0 ]; do
  case "$1" in
    --output) out="$2"; shift 2 ;;
    http*) url="$1"; shift ;;
    *) shift ;;
  esac
done
printf "%s" "${url##*/}" > "$out"'
  stub sudo '"$@"'
  stub dpkg 'exit 0'
  stub freshclam 'echo x > "$(sed -n "s/^DatabaseDirectory //p" "${1#--config-file=}")/main.cvd"'
  stub_clamscan 1 "/x/sample: Eicar-Test-Signature FOUND"
}

# Writes an executable stub with the given body.
stub() {
  local name="$1"
  local body="$2"

  printf '#!/usr/bin/env bash\n%s\n' "$body" > "${STUB_DIR}/${name}"
  chmod +x "${STUB_DIR}/${name}"
}

# A clamscan that answers --version, and otherwise prints $2 and exits $1.
stub_clamscan() {
  stub clamscan "
for arg in \"\$@\"; do
  if [ \"\$arg\" = --version ]; then echo 'ClamAV 1.4.6/28158'; exit 0; fi
done
printf '%s' '$2'
exit $1"
}

@test "fails without its arguments" {
  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage: build-mirror.sh"* ]]
}

@test "fails when the Dockerfile does not pin the version and checksums" {
  echo "ARG CLAMAV_VERSION=1.4.6" > "$DOCKERFILE"

  run bash "$SCRIPT" "$DOCKERFILE" "$OUT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"does not pin"* ]]
}

@test "leaves both packages, the definitions and the version" {
  run bash "$SCRIPT" "$DOCKERFILE" "$OUT"

  [ "$status" -eq 0 ]
  [ -f "${OUT}/clamav-1.4.6.linux.x86_64.deb" ]
  [ -f "${OUT}/clamav-1.4.6.linux.aarch64.deb" ]
  [ -f "${OUT}/db/main.cvd" ]
  [ "$(cat "${OUT}/VERSION")" = "1.4.6" ]
  [ ! -f "${OUT}/freshclam.conf" ]
}

@test "refuses a package that does not match its pinned checksum" {
  sed -i.bak 's/^ARG CLAMAV_SHA256_AMD64=.*/ARG CLAMAV_SHA256_AMD64=0000/' "$DOCKERFILE"

  run ! bash "$SCRIPT" "$DOCKERFILE" "$OUT"

  [ ! -f "${OUT}/db/main.cvd" ]
}

@test "refuses definitions that do not detect EICAR" {
  stub_clamscan 0 ""

  run ! bash "$SCRIPT" "$DOCKERFILE" "$OUT"

  [[ "$output" == *"did not detect the EICAR test file"* ]]
}

@test "refuses a scanner that exits 1 without naming EICAR" {
  stub_clamscan 1 "/x/eicar-named-file: Some-Other FOUND"

  run ! bash "$SCRIPT" "$DOCKERFILE" "$OUT"

  [[ "$output" == *"did not detect the EICAR test file"* ]]
}
