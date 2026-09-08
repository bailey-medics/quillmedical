#!/usr/bin/env bats
# Tests for deploy-to-gcs.sh
#
# gsutil is stubbed and its invocations recorded. What matters here is which
# files exist to be uploaded and what metadata the clean URLs are given — not
# that gsutil itself works.

bats_require_minimum_version 1.5.0

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/deploy-to-gcs.sh"
  CALLS="${BATS_TEST_TMPDIR}/gsutil-calls"
  : > "$CALLS"

  STUB_DIR="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "$STUB_DIR"
  cat > "${STUB_DIR}/gsutil" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "${CALLS}"
EOF
  chmod +x "${STUB_DIR}/gsutil"
  PATH="${STUB_DIR}:${PATH}"

  # The script syncs from a relative "public-site" directory, so run from a
  # scratch directory rather than the repository.
  cd "$BATS_TEST_TMPDIR" || exit 1
}

make_site() {
  mkdir -p public-site/assets
  echo "home" > public-site/index.html
  local page
  for page in "$@"; do
    echo "$page" > "public-site/${page}.html"
  done
  echo "body{}" > public-site/assets/style.css
  echo "icon" > public-site/favicon.ico
}

@test "fails without a project id" {
  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No GCP project ID provided"* ]]
}

@test "refuses to sync when the build is missing its index" {
  mkdir -p public-site
  echo "orphan" > public-site/about.html

  run bash "$SCRIPT" my-project

  [ "$status" -eq 1 ]
  [[ "$output" == *"refusing to sync"* ]]
  [ ! -s "$CALLS" ]
}

@test "renames every page to its clean URL" {
  make_site about pricing privacy-policy

  run bash "$SCRIPT" my-project

  [ "$status" -eq 0 ]
  [ -f public-site/about ]
  [ -f public-site/pricing ]
  [ -f public-site/privacy-policy ]
  [ "$(cat public-site/about)" = "about" ]
}

@test "the .html original does not survive the rename" {
  # A copy would leave two URLs for one page. The bucket is mirrored from this
  # directory, so the absent .html is what deletes the old object.
  make_site about

  run bash "$SCRIPT" my-project

  [ "$status" -eq 0 ]
  [ ! -e public-site/about.html ]
}

@test "keeps the two names the bucket configuration refers to" {
  # main_page_suffix is index.html and not_found_page is not-found.html.
  # Renaming either would break the front page or the 404.
  make_site about not-found

  run bash "$SCRIPT" my-project

  [ "$status" -eq 0 ]
  [ -f public-site/index.html ]
  [ -f public-site/not-found.html ]
  [ ! -e public-site/index ]
  [ ! -e public-site/not-found ]
}

@test "retypes the clean URLs as HTML and stops them being cached" {
  # Without this they arrive as application/octet-stream, which a browser
  # offers to download, and with the 30-day cache of the non-HTML pass.
  make_site about pricing

  run bash "$SCRIPT" my-project

  [ "$status" -eq 0 ]
  grep -q "setmeta" "$CALLS"
  grep -q "Content-Type:text/html" "$CALLS"
  grep -q "Cache-Control:no-cache .*gs://my-project-landing/about" "$CALLS"
  grep -q "gs://my-project-landing/pricing" "$CALLS"
  run ! grep -q "gs://my-project-landing/index\b" "$CALLS"
}

@test "renames before the sync, so mirror-delete does the rest" {
  # Renaming afterwards would leave the old .html objects in the bucket and
  # the new ones deleted on the next deploy for not being in the source.
  make_site about

  run bash "$SCRIPT" my-project

  [ "$status" -eq 0 ]
  local first_sync setmeta_line
  first_sync="$(grep -n "rsync" "$CALLS" | head -1 | cut -d: -f1)"
  setmeta_line="$(grep -n "setmeta" "$CALLS" | head -1 | cut -d: -f1)"
  [ -n "$first_sync" ]
  [ -n "$setmeta_line" ]
  [ "$setmeta_line" -gt "$first_sync" ]
  [[ "$output" == *"Renamed 1 pages to clean URLs"* ]]
}

@test "does nothing extra for a site of only an index" {
  make_site

  run bash "$SCRIPT" my-project

  [ "$status" -eq 0 ]
  [[ "$output" == *"No clean URLs to retype"* ]]

  run ! grep -q "setmeta" "$CALLS"
}
