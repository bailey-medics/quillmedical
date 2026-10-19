#!/usr/bin/env bats
# Tests for fetch-mirror.sh
#
# docker is stubbed: what matters is which image is asked for, that its
# files land where the build or the scan looks, and that an image with no
# definitions is refused rather than scanned with.

bats_require_minimum_version 1.5.0

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/fetch-mirror.sh"
  OUT="${BATS_TEST_TMPDIR}/out"
  CALLS="${BATS_TEST_TMPDIR}/docker-calls"
  DOCKERFILE="${BATS_TEST_TMPDIR}/Dockerfile.scan"
  : > "$CALLS"
  printf 'ARG CLAMAV_VERSION=1.4.6\n' > "$DOCKERFILE"

  STUB_DIR="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "$STUB_DIR"
  PATH="${STUB_DIR}:${PATH}"
}

# A docker that records its arguments, and on `cp` writes a mirror's files,
# with definitions unless WITH_DB=0.
stub_docker() {
  local with_db="${1:-1}"

  cat > "${STUB_DIR}/docker" <<STUB
#!/usr/bin/env bash
echo "\$*" >> "${CALLS}"
case "\$1" in
  create) echo "container-1" ;;
  cp)
    mkdir -p "\$3/db"
    echo "1.4.6" > "\$3/VERSION"
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
