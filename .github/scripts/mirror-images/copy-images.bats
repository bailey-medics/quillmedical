#!/usr/bin/env bats
# Tests for copy-images.sh
#
# With stand-ins for docker and skopeo on PATH, so nothing is pulled or
# pushed. The stand-in for skopeo writes down what it was asked to copy and
# what it was asked to inspect, and finds in the mirror only what HELD
# lists.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/copy-images.sh"
  BIN="${BATS_TEST_TMPDIR}/bin"
  COPIES="${BATS_TEST_TMPDIR}/copies"
  INSPECTS="${BATS_TEST_TMPDIR}/inspects"
  HELD="${BATS_TEST_TMPDIR}/held"
  mkdir -p "$BIN"
  : > "$COPIES"
  : > "$INSPECTS"
  : > "$HELD"

  cat > "${BIN}/skopeo" <<STUB
#!/usr/bin/env bash
if [ "\$1" = "inspect" ]; then
  echo "\$*" >> "${INSPECTS}"
  grep -qxF "\${@: -1}" "${HELD}"
  exit
fi
echo "\$*" >> "${COPIES}"
exit "\${SKOPEO_EXIT:-0}"
STUB
  chmod +x "${BIN}/skopeo"

  PATH="${BIN}:${PATH}"
}

# Has the stand-in mirror hold these references.
hold() {
  printf '%s\n' "$@" > "$HELD"
}

# Puts a docker on PATH whose `compose config --images` prints these lines.
stub_images() {
  printf '%s\n' "$@" > "${BATS_TEST_TMPDIR}/images"

  cat > "${BIN}/docker" <<STUB
#!/usr/bin/env bash
cat "${BATS_TEST_TMPDIR}/images"
STUB
  chmod +x "${BIN}/docker"
}

@test "copies each public image to the mirror, for every platform" {
  stub_images \
    "quillmedical-ci_backend:latest" \
    "public.ecr.aws/docker/library/postgres:18-alpine"

  run bash "$SCRIPT" bailey-medics compose.ci.yml

  [ "$status" -eq 0 ]
  [ "$(cat "$COPIES")" = "copy --all docker://public.ecr.aws/docker/library/postgres:18-alpine docker://ghcr.io/bailey-medics/mirror/postgres:18-alpine" ]
}

@test "an image CI builds itself is left alone" {
  stub_images \
    "quillmedical-ci_backend:latest" \
    "quillmedical-ci_frontend:latest" \
    "public.ecr.aws/docker/library/postgres:18-alpine"

  run bash "$SCRIPT" bailey-medics compose.ci.yml

  [ "$(wc -l < "$COPIES" | tr -d ' ')" -eq 1 ]
  [[ "$(cat "$COPIES")" != *"quillmedical-ci"* ]]
}

@test "a pinned image is copied from its digest to its tag" {
  stub_images "public.ecr.aws/docker/library/caddy:2-alpine@sha256:abc123"

  run bash "$SCRIPT" bailey-medics compose.ci.yml

  [ "$status" -eq 0 ]
  [ "$(cat "$COPIES")" = "copy --all docker://public.ecr.aws/docker/library/caddy@sha256:abc123 docker://ghcr.io/bailey-medics/mirror/caddy:2-alpine" ]
}

@test "an image named twice is copied once" {
  stub_images \
    "public.ecr.aws/docker/library/postgres:18-alpine" \
    "public.ecr.aws/docker/library/postgres:18-alpine"

  run bash "$SCRIPT" bailey-medics compose.ci.yml

  [ "$(wc -l < "$COPIES" | tr -d ' ')" -eq 1 ]
}

# Writes a Dockerfile naming these base images, each in an ARG.
dockerfile_with() {
  local path="${BATS_TEST_TMPDIR}/$1"
  shift
  : > "$path"

  local number=0
  local image=""

  for image in "$@"; do
    number=$((number + 1))
    echo "ARG BASE${number}_IMAGE=${image}" >> "$path"
    echo "FROM \${BASE${number}_IMAGE} AS stage${number}" >> "$path"
  done

  echo "$path"
}

@test "copies the image a Dockerfile builds on, named in an ARG" {
  stub_images "public.ecr.aws/docker/library/postgres:18-alpine"
  dockerfile="$(dockerfile_with Dockerfile "public.ecr.aws/docker/library/python:3.14-slim@sha256:abc")"

  run bash "$SCRIPT" bailey-medics compose.ci.yml "$dockerfile"

  [ "$status" -eq 0 ]
  grep -q "docker://public.ecr.aws/docker/library/python@sha256:abc docker://ghcr.io/bailey-medics/mirror/python:3.14-slim" "$COPIES"
  grep -q "mirror/postgres:18-alpine" "$COPIES"
}

@test "copies every base image of every Dockerfile given" {
  stub_images "public.ecr.aws/docker/library/postgres:18-alpine"
  backend="$(dockerfile_with backend.Dockerfile "public.ecr.aws/docker/library/python:3.14-slim")"
  frontend="$(dockerfile_with frontend.Dockerfile \
    "public.ecr.aws/docker/library/node:24-slim" \
    "public.ecr.aws/docker/library/caddy:2-alpine")"

  run bash "$SCRIPT" bailey-medics compose.ci.yml "$backend" "$frontend"

  [ "$status" -eq 0 ]
  [ "$(wc -l < "$COPIES" | tr -d ' ')" -eq 4 ]
  grep -q "mirror/node:24-slim" "$COPIES"
  grep -q "mirror/caddy:2-alpine" "$COPIES"
}

@test "an image a Dockerfile and the compose file both use is copied once" {
  stub_images "public.ecr.aws/docker/library/caddy:2-alpine"
  dockerfile="$(dockerfile_with Dockerfile "public.ecr.aws/docker/library/caddy:2-alpine")"

  run bash "$SCRIPT" bailey-medics compose.ci.yml "$dockerfile"

  [ "$status" -eq 0 ]
  [ "$(wc -l < "$COPIES" | tr -d ' ')" -eq 1 ]
}

@test "fails for a Dockerfile that names no base image in an ARG" {
  # Copying nothing for it would look like success.
  stub_images "public.ecr.aws/docker/library/postgres:18-alpine"
  path="${BATS_TEST_TMPDIR}/Dockerfile"
  echo "FROM public.ecr.aws/docker/library/python:3.14-slim" > "$path"

  run bash "$SCRIPT" bailey-medics compose.ci.yml "$path"

  [ "$status" -eq 1 ]
  [[ "$output" == *"names no base image"* ]]
  [ ! -s "$COPIES" ]
}

@test "fails for a Dockerfile that is not there" {
  stub_images "public.ecr.aws/docker/library/postgres:18-alpine"

  run bash "$SCRIPT" bailey-medics compose.ci.yml "${BATS_TEST_TMPDIR}/no-such-file"

  [ "$status" -eq 1 ]
  [[ "$output" == *"does not exist"* ]]
}

@test "reads the real Dockerfiles: each names its base images in ARGs" {
  # The contract between the Dockerfiles and this script, checked against
  # the files themselves, so a FROM changed back to a bare image is caught
  # here and not by a rate limit.
  stub_images "public.ecr.aws/docker/library/postgres:18-alpine"
  root="${BATS_TEST_DIRNAME}/../../.."

  run bash "$SCRIPT" bailey-medics compose.ci.yml \
    "${root}/backend/Dockerfile" \
    "${root}/backend/Dockerfile.caption" \
    "${root}/frontend/Dockerfile"

  [ "$status" -eq 0 ]
  grep -q "mirror/python:" "$COPIES"
  grep -q "mirror/node:" "$COPIES"
  grep -q "mirror/caddy:" "$COPIES"
}

@test "fails when the compose file names no public image" {
  # A check that copies nothing would pass for ever, and the mirror would
  # quietly go stale.
  stub_images "quillmedical-ci_backend:latest"

  run bash "$SCRIPT" bailey-medics compose.ci.yml

  [ "$status" -eq 1 ]
  [[ "$output" == *"nothing to copy"* ]]
  [ ! -s "$COPIES" ]
}

@test "fails when a copy fails" {
  stub_images "public.ecr.aws/docker/library/postgres:18-alpine"

  SKOPEO_EXIT=1 run bash "$SCRIPT" bailey-medics compose.ci.yml

  [ "$status" -ne 0 ]
  [[ "$output" != *"Copied"* ]]
}

@test "a pinned image the mirror already holds is not copied" {
  stub_images "public.ecr.aws/docker/library/caddy:2-alpine@sha256:abc123"
  hold "docker://ghcr.io/bailey-medics/mirror/caddy@sha256:abc123"

  run bash "$SCRIPT" bailey-medics compose.ci.yml

  [ "$status" -eq 0 ]
  [ ! -s "$COPIES" ]
  [[ "$output" == *"Already mirrored"* ]]
  [[ "$output" == *"Copied 0 image(s); 1 already mirrored"* ]]
}

@test "the mirror is asked by digest, not by tag" {
  # The tag could point at an older copy; only the digest proves it is
  # the very image pinned.
  stub_images "public.ecr.aws/docker/library/caddy:2-alpine@sha256:abc123"

  run bash "$SCRIPT" bailey-medics compose.ci.yml

  [ "$(cat "$INSPECTS")" = "inspect --raw docker://ghcr.io/bailey-medics/mirror/caddy@sha256:abc123" ]
}

@test "a pinned image the mirror does not hold is copied" {
  stub_images "public.ecr.aws/docker/library/caddy:2-alpine@sha256:abc123"
  hold "docker://ghcr.io/bailey-medics/mirror/caddy@sha256:older"

  run bash "$SCRIPT" bailey-medics compose.ci.yml

  [ "$status" -eq 0 ]
  [ "$(cat "$COPIES")" = "copy --all docker://public.ecr.aws/docker/library/caddy@sha256:abc123 docker://ghcr.io/bailey-medics/mirror/caddy:2-alpine" ]
}

@test "an image named by tag alone is copied without asking the mirror" {
  # The tag may have moved on upstream, so holding it proves nothing.
  stub_images "public.ecr.aws/docker/library/postgres:18-alpine"
  hold "docker://ghcr.io/bailey-medics/mirror/postgres:18-alpine"

  run bash "$SCRIPT" bailey-medics compose.ci.yml

  [ ! -s "$INSPECTS" ]
  [ "$(wc -l < "$COPIES" | tr -d ' ')" -eq 1 ]
}

@test "copies only the images the mirror lacks" {
  stub_images \
    "public.ecr.aws/docker/library/caddy:2-alpine@sha256:abc123" \
    "public.ecr.aws/docker/library/postgres:18-alpine@sha256:def456"
  hold "docker://ghcr.io/bailey-medics/mirror/caddy@sha256:abc123"

  run bash "$SCRIPT" bailey-medics compose.ci.yml

  [ "$status" -eq 0 ]
  [ "$(cat "$COPIES")" = "copy --all docker://public.ecr.aws/docker/library/postgres@sha256:def456 docker://ghcr.io/bailey-medics/mirror/postgres:18-alpine" ]
  [[ "$output" == *"Copied 1 image(s); 1 already mirrored"* ]]
}

@test "fails without an owner and a compose file" {
  run bash "$SCRIPT" bailey-medics

  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage"* ]]
}
