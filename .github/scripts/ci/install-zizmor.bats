#!/usr/bin/env bats
# Tests for install-zizmor.sh
#
# Nothing is downloaded, and nothing is installed outside the test's own
# folder. The `sudo` stand-in comes from install-tool.bash. Its `curl`
# stand-in is replaced: zizmor's archive is checked against a hash pinned
# in the script, not against a checksums file, so the test builds the
# archive first and runs a copy of the script pinned to that archive's
# hash.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/install-zizmor.sh"
  TOOL="zizmor"
  load install-tool
  install_tool_setup

  # The version the script pins, read from the script so that a bump
  # there does not need one here.
  VERSION="$(sed -n -E 's/^ZIZMOR_VERSION="([^"]+)"$/\1/p' "$SCRIPT")"

  ARCHIVE="${BATS_TEST_TMPDIR}/zizmor.tar.gz"
  printf '#!/usr/bin/env bash\necho "zizmor $*"\n' > "${STAGING}/zizmor"
  chmod +x "${STAGING}/zizmor"
  tar -czf "$ARCHIVE" -C "$STAGING" zizmor
  export ARCHIVE

  cat > "${STUB}/curl" <<'CURL'
#!/usr/bin/env bash
echo "$*" >> "$ASKED"
[ -z "${DOWNLOAD_FAILS:-}" ] || exit 22

while [ "$#" -gt 0 ]; do
  [ "$1" = "-o" ] && out="$2"
  shift
done
cp "$ARCHIVE" "$out"
CURL
  chmod +x "${STUB}/curl"

  # A copy beside the real logging helper, pinned to the test archive.
  COPY="${BATS_TEST_TMPDIR}/scripts/ci/install-zizmor.sh"
  mkdir -p "$(dirname "$COPY")" "${BATS_TEST_TMPDIR}/scripts/shared"
  cp "${BATS_TEST_DIRNAME}/../shared/logging.sh" "${BATS_TEST_TMPDIR}/scripts/shared/"
  sum="$(sha256sum "$ARCHIVE" | cut -d' ' -f1)"
  sed -E "s/^ZIZMOR_SHA256=\"[0-9a-f]+\"$/ZIZMOR_SHA256=\"${sum}\"/" "$SCRIPT" > "$COPY"
}

@test "installs zizmor and runs it to show the version" {
  run bash "$COPY"

  [ "$status" -eq 0 ]
  [ -x "${INSTALLED}/zizmor" ]
  [ "$(cat "${INSTALLED}/.asked-for")" = "/usr/local/bin/zizmor" ]
  [[ "$output" == *"zizmor --version"* ]]
  [[ "$output" == *"zizmor v${VERSION} installed."* ]]
}

@test "downloads the pinned release from the project's own releases" {
  run bash "$COPY"

  [ -n "$VERSION" ]
  grep -qF "https://github.com/zizmorcore/zizmor/releases/download/v${VERSION}/zizmor-x86_64-unknown-linux-gnu.tar.gz" "$ASKED"
}

@test "the download is tried again once if the first try fails" {
  run bash "$COPY"

  [ "$(grep -c -- "--retry 1 --retry-delay 30" "$ASKED")" = "1" ]
}

@test "an archive that does not match the pinned hash is not installed" {
  # The real script, whose hash is the published release's, not this
  # test archive's.
  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Checksum verification failed"* ]]
  [ ! -e "${INSTALLED}/zizmor" ]
}

@test "the pinned hash is a whole SHA-256" {
  grep -qE '^ZIZMOR_SHA256="[0-9a-f]{64}"$' "$SCRIPT"
}

@test "the pre-commit hook pins the same version" {
  grep -qF -A1 "zizmorcore/zizmor-pre-commit" "${BATS_TEST_DIRNAME}/../../../.pre-commit-config.yaml"
  [ "$(grep -A1 "zizmorcore/zizmor-pre-commit" "${BATS_TEST_DIRNAME}/../../../.pre-commit-config.yaml" | sed -n -E 's/^ +rev: v(.+)$/\1/p')" = "$VERSION" ]
}

@test "a download that fails stops the script with nothing installed" {
  DOWNLOAD_FAILS=1 run bash "$COPY"

  [ "$status" -ne 0 ]
  [ ! -e "${INSTALLED}/zizmor" ]
}
