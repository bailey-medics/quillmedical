#!/usr/bin/env bats
# Tests for use-mirrored-buildkit.sh
#
# With a stand-in for docker on PATH that says which images the registry
# holds, so nothing is asked of a real one.

bats_require_minimum_version 1.5.0

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/use-mirrored-buildkit.sh"
  ROOT="${BATS_TEST_DIRNAME}/../../.."
  BIN="${BATS_TEST_TMPDIR}/bin"
  HELD="${BATS_TEST_TMPDIR}/held"
  BUILDKIT="${BATS_TEST_TMPDIR}/buildkit.Dockerfile"
  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/github_output"
  mkdir -p "$BIN"
  : > "$HELD"
  : > "$GITHUB_OUTPUT"

  cat > "$BUILDKIT" <<'EOF'
ARG BUILDKIT_IMAGE=mirror.gcr.io/moby/buildkit:buildx-stable-1@sha256:abc123
FROM ${BUILDKIT_IMAGE}
EOF

  # `docker manifest inspect <ref>` succeeds only for a line in $HELD.
  cat > "${BIN}/docker" <<EOF
#!/usr/bin/env bash
grep -qxF "\$3" "${HELD}"
EOF
  chmod +x "${BIN}/docker"

  # The script waits between lookups; the tests need not.
  printf '#!/usr/bin/env bash\n' > "${BIN}/sleep"
  chmod +x "${BIN}/sleep"

  PATH="${BIN}:${PATH}"
}

# Prints the value the script wrote for one output, or nothing.
output_value() {
  local name="$1"

  sed -n "s/^${name}=//p" "$GITHUB_OUTPUT"
}

@test "hands Buildx the copy when the mirror holds it" {
  echo "ghcr.io/bailey-medics/mirror/buildkit@sha256:abc123" > "$HELD"

  run bash "$SCRIPT" bailey-medics "$BUILDKIT"

  [ "$status" -eq 0 ]
  [ "$(output_value image)" = "ghcr.io/bailey-medics/mirror/buildkit@sha256:abc123" ]
  [ -z "$(output_value fell_back)" ]
}

@test "the owner is written in lower case, as GHCR needs" {
  echo "ghcr.io/bailey-medics/mirror/buildkit@sha256:abc123" > "$HELD"

  run bash "$SCRIPT" Bailey-Medics "$BUILDKIT"

  [ "$status" -eq 0 ]
  [ "$(output_value image)" = "ghcr.io/bailey-medics/mirror/buildkit@sha256:abc123" ]
}

@test "stays on the public image and says so when the mirror lacks the copy" {
  run bash "$SCRIPT" bailey-medics "$BUILDKIT"

  [ "$status" -eq 0 ]
  [ "$(output_value image)" = "mirror.gcr.io/moby/buildkit:buildx-stable-1@sha256:abc123" ]
  [ "$(output_value fell_back)" = "mirror.gcr.io/moby/buildkit:buildx-stable-1@sha256:abc123" ]
  [[ "$output" == *"does not hold"* ]]
}

@test "a copy of another digest is not used" {
  echo "ghcr.io/bailey-medics/mirror/buildkit@sha256:old999" > "$HELD"

  run bash "$SCRIPT" bailey-medics "$BUILDKIT"

  [ "$status" -eq 0 ]
  [ "$(output_value image)" = "mirror.gcr.io/moby/buildkit:buildx-stable-1@sha256:abc123" ]
}

@test "refuses a Dockerfile that names no BuildKit image" {
  echo "FROM scratch" > "$BUILDKIT"

  run bash "$SCRIPT" bailey-medics "$BUILDKIT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"names no image in ARG BUILDKIT_IMAGE"* ]]
  [ ! -s "$GITHUB_OUTPUT" ]
}

@test "refuses a Dockerfile that does not exist" {
  run bash "$SCRIPT" bailey-medics "${BATS_TEST_TMPDIR}/missing"

  [ "$status" -eq 1 ]
  [[ "$output" == *"does not exist"* ]]
}

@test "refuses without an owner and a Dockerfile" {
  run bash "$SCRIPT" bailey-medics

  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage"* ]]
}

@test "refuses when there is nowhere to write the image" {
  unset GITHUB_OUTPUT

  run bash "$SCRIPT" bailey-medics "$BUILDKIT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"GITHUB_OUTPUT is not set"* ]]
}

@test "the repository's own BuildKit file is pinned and read" {
  run bash "$SCRIPT" bailey-medics "${ROOT}/.github/buildkit/Dockerfile"

  [ "$status" -eq 0 ]
  [[ "$(output_value image)" == *"moby/buildkit"*"@sha256:"* ]]
}
