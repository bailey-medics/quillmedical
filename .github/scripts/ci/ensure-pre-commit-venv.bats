#!/usr/bin/env bats
# Tests for ensure-pre-commit-venv.sh
#
# `python` is a stub on PATH. Asked for `-m venv .venv` it makes a .venv
# whose own python is a second stub, which records each pip call and can
# be told to fail its first one. Nothing is downloaded.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/ensure-pre-commit-venv.sh"
  STUB="${BATS_TEST_TMPDIR}/bin"
  WORK="${BATS_TEST_TMPDIR}/work"
  export CALLS="${BATS_TEST_TMPDIR}/calls"
  export RETRY_WAIT_SECONDS=0
  mkdir -p "$STUB" "$WORK"
  : > "$CALLS"

  cat > "${STUB}/python" <<'PYTHON'
#!/usr/bin/env bash
if [ "$1 $2" = "-m venv" ]; then
  mkdir -p "$3/bin"
  cat > "$3/bin/python" <<'VENV_PYTHON'
#!/usr/bin/env bash
echo "$*" >> "$CALLS"
if [ -n "${FIRST_INSTALL_FAILS:-}" ] && [ "$(wc -l < "$CALLS")" -eq 1 ]; then
  exit 1
fi
[ -z "${EVERY_INSTALL_FAILS:-}" ] || exit 1
VENV_PYTHON
  chmod +x "$3/bin/python"
fi
PYTHON
  chmod +x "${STUB}/python"
  PATH="${STUB}:${PATH}"
  cd "$WORK"
}

@test "makes a venv and installs pip, then pre-commit at its pin" {
  run bash "$SCRIPT"

  [ "$status" -eq 0 ]
  [ -x .venv/bin/python ]
  [ "$(sed -n 1p "$CALLS")" = "-m pip install -U pip" ]
  [ "$(sed -n 2p "$CALLS")" = "-m pip install pre-commit>=3,<5" ]
}

@test "a venv left from before is thrown away, not reused" {
  # A restored venv points at a Python that may have been rebuilt.
  mkdir -p .venv
  echo stale > .venv/left-over

  run bash "$SCRIPT"

  [ "$status" -eq 0 ]
  [ ! -e .venv/left-over ]
}

@test "an install that fails once is tried again and the script carries on" {
  FIRST_INSTALL_FAILS=1 run bash "$SCRIPT"

  [ "$status" -eq 0 ]
  [ "$(grep -c "^-m pip install -U pip$" "$CALLS")" = "2" ]
  [ "$(grep -c "pre-commit" "$CALLS")" = "1" ]
}

@test "an install that keeps failing fails the script" {
  EVERY_INSTALL_FAILS=1 run bash "$SCRIPT"

  [ "$status" -ne 0 ]
  [ "$(grep -c "pre-commit" "$CALLS")" = "0" ]
}
