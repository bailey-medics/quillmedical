#!/usr/bin/env bats
# Tests for install-actionlint.sh
#
# With the stand-ins in install-tool.bash: nothing is downloaded, and
# nothing is installed outside the test's own folder.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/install-actionlint.sh"
  TOOL="actionlint"
  load install-tool
  install_tool_setup

  # The version the script pins, read from the script so that a bump
  # there does not need one here.
  VERSION="$(sed -n -E 's/^(readonly )?[A-Z]+_VERSION="([^"]+)"$/\2/p' "$SCRIPT")"
}

@test "installs actionlint and runs it to show the version" {
  run bash "$SCRIPT"

  [ "$status" -eq 0 ]
  [ -x "${INSTALLED}/actionlint" ]
  [ "$(cat "${INSTALLED}/.asked-for")" = "/usr/local/bin/actionlint" ]
  [[ "$output" == *"actionlint -version"* ]]
  [[ "$output" == *"actionlint v${VERSION} installed."* ]]
}

@test "downloads the pinned release, and its checksums, from the project's own releases" {
  run bash "$SCRIPT"

  [ -n "$VERSION" ]
  grep -qF "https://github.com/rhysd/actionlint/releases/download/v${VERSION}/actionlint_${VERSION}_linux_amd64.tar.gz" "$ASKED"
  grep -qF "/v${VERSION}/actionlint_${VERSION}_checksums.txt" "$ASKED"
}

@test "each download is tried again once if the first try fails" {
  run bash "$SCRIPT"

  [ "$(grep -c -- "--retry 1 --retry-delay 30" "$ASKED")" = "2" ]
}

@test "an archive that does not match its checksum is not installed" {
  WRONG_CHECKSUM=1 run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Checksum verification failed"* ]]
  [ ! -e "${INSTALLED}/actionlint" ]
}

@test "an archive the checksums file does not list is not installed" {
  # No line to check against is not the same as a line that matches.
  CHECKSUM_FOR_ANOTHER_FILE=1 run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Checksum verification failed"* ]]
  [ ! -e "${INSTALLED}/actionlint" ]
}

@test "a download that fails stops the script with nothing installed" {
  DOWNLOAD_FAILS=1 run bash "$SCRIPT"

  [ "$status" -ne 0 ]
  [ ! -e "${INSTALLED}/actionlint" ]
}
