# Shared by the tests of install-actionlint.sh, install-gitleaks.sh and
# install-oasdiff.sh, which all do the same thing: download a release
# archive and its checksums, verify one against the other, and install
# the binary inside.
#
# Nothing is downloaded and nothing is installed outside the test's own
# folder. Two stubs on PATH stand in:
#
# - `curl` writes the file asked for. For an archive it makes a real
#   tar.gz holding a small program named after the tool, which prints its
#   name and the arguments it was given. For a checksums file it writes
#   that archive's real SHA-256, or a wrong one when $WRONG_CHECKSUM is
#   set, or a line for some other file when $CHECKSUM_FOR_ANOTHER_FILE is
#   set. It fails when $DOWNLOAD_FAILS is set.
# - `sudo` runs `install` with its destination moved into the test's
#   folder, which is on PATH, so "/usr/local/bin/<tool>" lands there.
#
# A test file sets TOOL before calling install_tool_setup.

install_tool_setup() {
  STUB="${BATS_TEST_TMPDIR}/bin"
  export INSTALLED="${BATS_TEST_TMPDIR}/installed"
  export STAGING="${BATS_TEST_TMPDIR}/staging"
  export ASKED="${BATS_TEST_TMPDIR}/asked"
  export TOOL
  mkdir -p "$STUB" "$INSTALLED" "$STAGING"
  : > "$ASKED"

  cat > "${STUB}/curl" <<'CURL'
#!/usr/bin/env bash
echo "$*" >> "$ASKED"
[ -z "${DOWNLOAD_FAILS:-}" ] || exit 22

out=""
url=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift ;;
    http*) url="$1" ;;
  esac
  shift
done

dir="$(dirname "$out")"
name="$(basename "$url")"

case "$name" in
  *.tar.gz)
    # Built in a folder of its own, so the download folder ends up
    # holding the archive and nothing else.
    printf '#!/usr/bin/env bash\necho "%s $*"\n' "$TOOL" > "${STAGING}/${TOOL}"
    chmod +x "${STAGING}/${TOOL}"
    tar -czf "$out" -C "$STAGING" "$TOOL"
    ;;
  *)
    archive="$(basename "$(find "$dir" -name '*.tar.gz')")"
    sum="$(sha256sum "${dir}/${archive}" | cut -d' ' -f1)"
    if [ -n "${WRONG_CHECKSUM:-}" ]; then
      sum="0000000000000000000000000000000000000000000000000000000000000000"
    fi
    if [ -n "${CHECKSUM_FOR_ANOTHER_FILE:-}" ]; then
      archive="some-other-file.tar.gz"
    fi
    echo "${sum}  ${archive}" > "$out"
    ;;
esac
CURL

  cat > "${STUB}/sudo" <<'SUDO'
#!/usr/bin/env bash
# sudo install -m 0755 <from> /usr/local/bin/<tool>
[ "$1" = "install" ] || exit 64
from="${*: -2:1}"
to="${*: -1}"
install -m 0755 "$from" "${INSTALLED}/$(basename "$to")"
echo "$to" > "${INSTALLED}/.asked-for"
SUDO

  chmod +x "${STUB}/curl" "${STUB}/sudo"
  PATH="${INSTALLED}:${STUB}:${PATH}"
}
