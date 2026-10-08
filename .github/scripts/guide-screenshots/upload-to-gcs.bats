#!/usr/bin/env bats
# Tests for upload-to-gcs.sh
#
# gsutil is stubbed. An rsync is recorded with the folders it was given to
# upload, because what matters here is which guide's pictures go to which
# bucket - and above all that none goes to the public one by mistake.

bats_require_minimum_version 1.5.0

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/upload-to-gcs.sh"
  CALLS="${BATS_TEST_TMPDIR}/gsutil-calls"
  : > "$CALLS"

  STUB_DIR="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "$STUB_DIR"
  # For an rsync, the two last arguments are the source and the bucket:
  # record the bucket with the folders the source holds.
  cat > "${STUB_DIR}/gsutil" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "${CALLS}"
if [[ " \$* " == *" rsync "* ]]; then
  args=("\$@")
  count=\${#args[@]}
  source="\${args[\$((count - 2))]}"
  bucket="\${args[\$((count - 1))]}"
  echo "\${bucket} <- \$(ls "\$source" | sort | tr '\n' ' ')" >> "${CALLS}.sorted"
fi
EOF
  chmod +x "${STUB_DIR}/gsutil"
  PATH="${STUB_DIR}:${PATH}"
  : > "${CALLS}.sorted"

  # The script syncs from a relative "guide-assets" directory, so run from a
  # scratch directory rather than the repository.
  cd "$BATS_TEST_TMPDIR" || exit 1
}

# A guide's folder with one screenshot in it.
make_guide() {
  local guide="$1"

  mkdir -p "guide-assets/${guide}"
  echo "png" > "guide-assets/${guide}/shot.png"
}

# The list of public guides, one argument per guide.
make_public_list() {
  : > guide-assets/public-guides.txt

  local guide
  for guide in "$@"; do
    echo "$guide" >> guide-assets/public-guides.txt
  done
}

@test "fails without a project id" {
  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No GCP project ID provided"* ]]
}

@test "refuses to sync when there is no guide-assets directory" {
  run bash "$SCRIPT" my-project

  [ "$status" -eq 1 ]
  [[ "$output" == *"refusing to sync"* ]]
  [ ! -s "$CALLS" ]
}

@test "refuses to sync when the run took no screenshots" {
  mkdir -p guide-assets/join-a-course
  echo "not a picture" > guide-assets/join-a-course/notes.txt
  make_public_list join-a-course

  run bash "$SCRIPT" my-project

  [ "$status" -eq 1 ]
  [[ "$output" == *"refusing to sync"* ]]
  [ ! -s "$CALLS" ]
}

@test "refuses to sync without the list of public guides" {
  make_guide join-a-course

  run bash "$SCRIPT" my-project

  [ "$status" -eq 1 ]
  [[ "$output" == *"without knowing which guides are public"* ]]
  [ ! -s "$CALLS" ]
}

@test "sends a public guide's screenshots to the public bucket" {
  make_guide join-a-course
  make_public_list join-a-course

  run bash "$SCRIPT" my-project

  [ "$status" -eq 0 ]
  grep -qxF -- "gs://my-project-guide-assets/ <- join-a-course " "${CALLS}.sorted"
}

@test "sends every other guide's screenshots to the private bucket" {
  make_guide join-a-course
  make_guide add-a-delegate-by-hand
  make_public_list join-a-course

  run bash "$SCRIPT" my-project

  [ "$status" -eq 0 ]
  grep -qxF -- "gs://my-project-guide-assets-private/ <- add-a-delegate-by-hand " "${CALLS}.sorted"
}

@test "keeps a signed-in guide's screenshots out of the public bucket" {
  make_guide join-a-course
  make_guide add-a-delegate-by-hand
  make_public_list join-a-course

  run bash "$SCRIPT" my-project

  [ "$status" -eq 0 ]
  run ! grep -q -- "gs://my-project-guide-assets/ <- .*add-a-delegate-by-hand" "${CALLS}.sorted"
}

@test "treats a guide the list does not name as private" {
  make_guide a-new-guide
  make_public_list

  run bash "$SCRIPT" my-project

  [ "$status" -eq 0 ]
  grep -qxF -- "gs://my-project-guide-assets-private/ <- a-new-guide " "${CALLS}.sorted"
  grep -qxF -- "gs://my-project-guide-assets/ <- " "${CALLS}.sorted"
}

@test "does not take a guide for public because its name starts like one that is" {
  make_guide join
  make_guide join-a-course
  make_public_list join-a-course

  run bash "$SCRIPT" my-project

  [ "$status" -eq 0 ]
  grep -qxF -- "gs://my-project-guide-assets-private/ <- join " "${CALLS}.sorted"
}

@test "mirrors both buckets, so a picture that no longer belongs is removed" {
  make_guide join-a-course
  make_public_list join-a-course

  run bash "$SCRIPT" my-project

  [ "$status" -eq 0 ]
  [ "$(grep -c -- "rsync -r -d " "$CALLS")" -eq 2 ]
}

@test "uploads with a five-minute cache" {
  make_guide join-a-course
  make_public_list join-a-course

  run bash "$SCRIPT" my-project

  [ "$status" -eq 0 ]
  grep -q -- "Cache-Control:public, max-age=300" "$CALLS"
}
