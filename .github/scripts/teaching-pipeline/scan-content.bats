#!/usr/bin/env bats
# Tests for scan-content.sh
#
# clamscan is stubbed and its invocation recorded, because what matters
# here is what the script does with each of clamscan's answers - not that
# ClamAV itself works. The scan image's own build proves that, with EICAR.

bats_require_minimum_version 1.5.0

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/scan-content.sh"
  MODULES="${BATS_TEST_TMPDIR}/modules"
  CALLS="${BATS_TEST_TMPDIR}/clamscan-calls"
  mkdir -p "${MODULES}/a-module/images"
  DB="${BATS_TEST_TMPDIR}/db"
  mkdir -p "$DB"
  echo "x" > "${DB}/main.cvd"
  echo "x" > "${MODULES}/a-module/images/figure.png"
  : > "$CALLS"

  STUB_DIR="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "$STUB_DIR"
  PATH="${STUB_DIR}:${PATH}"
}

# A clamscan that records its arguments, prints $2 and exits with $1.
stub_clamscan() {
  local code="$1"
  local output="${2:-}"

  cat > "${STUB_DIR}/clamscan" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "${CALLS}"
printf '%s' "${output}"
exit ${code}
EOF
  chmod +x "${STUB_DIR}/clamscan"
}

@test "fails without a modules directory argument" {
  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No modules directory provided"* ]]
}

@test "fails when the modules directory does not exist" {
  stub_clamscan 0

  run bash "$SCRIPT" "${BATS_TEST_TMPDIR}/absent" "$DB"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Modules directory not found"* ]]
}

@test "fails without a definitions directory argument" {
  stub_clamscan 0

  run bash "$SCRIPT" "$MODULES"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No definitions directory provided"* ]]
}

@test "fails closed when the definitions directory is empty" {
  stub_clamscan 0
  rm -f "${DB}/main.cvd"

  run bash "$SCRIPT" "$MODULES" "$DB"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No definitions in"* ]]
  [ ! -s "$CALLS" ]
}

@test "scans with the definitions it was given" {
  stub_clamscan 0

  run bash "$SCRIPT" "$MODULES" "$DB"

  [ "$status" -eq 0 ]
  grep -q -- "--database=${DB}" "$CALLS"
}

@test "scans the whole modules directory, recursively" {
  stub_clamscan 0

  run bash "$SCRIPT" "$MODULES" "$DB"

  [ "$status" -eq 0 ]
  grep -q -- "--recursive" "$CALLS"
  grep -q -- "$MODULES" "$CALLS"
}

@test "passes when clamscan finds nothing" {
  stub_clamscan 0

  run bash "$SCRIPT" "$MODULES" "$DB"

  [ "$status" -eq 0 ]
  [[ "$output" == *"No malware found"* ]]
}

@test "fails and names the file when clamscan finds malware" {
  stub_clamscan 1 "${MODULES}/a-module/images/figure.png: Eicar-Test-Signature FOUND"

  run bash "$SCRIPT" "$MODULES" "$DB"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Malware found"* ]]
  [[ "$output" == *"figure.png: Eicar-Test-Signature FOUND"* ]]
}

@test "fails closed when clamscan itself errors" {
  stub_clamscan 2 "LibClamAV Error: cl_load(): No such file or directory"

  run bash "$SCRIPT" "$MODULES" "$DB"

  [ "$status" -eq 1 ]
  [[ "$output" == *"could not finish (clamscan exited 2)"* ]]
}

@test "fails closed when clamscan is missing" {
  # 127 is what the shell answers for a command it cannot find.
  stub_clamscan 127 "clamscan: command not found"

  run ! bash "$SCRIPT" "$MODULES" "$DB"

  [[ "$output" == *"could not finish (clamscan exited 127)"* ]]
}
