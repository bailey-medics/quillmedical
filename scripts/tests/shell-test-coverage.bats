#!/usr/bin/env bats
# Tests for scripts/shell-test-coverage.py
#
# Against a small tree and a kcov report made here, so the figures do not
# move every time a script is added to the repository.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/../shell-test-coverage.py"
  TREE="$(mktemp -d)"
  mkdir -p "${TREE}/.github/scripts/ci" "${TREE}/.claude/hooks" "${TREE}/scripts"
}

teardown() {
  rm -rf "${TREE}"
}

# Writes a kcov report naming one file: path, lines run, lines of code.
kcov_report() {
  printf '{"files": [{"file": "%s", "covered_lines": "%s", "total_lines": "%s"}]}\n' \
    "$1" "$2" "$3" > "${TREE}/coverage.json"
}

# Runs the script's main against the tree made in setup.
report() {
  python3 - "$SCRIPT" "$TREE" "$@" <<'PY'
import importlib.util
import sys
from pathlib import Path

spec = importlib.util.spec_from_file_location("coverage_script", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

sys.exit(module.main(sys.argv[3:], Path(sys.argv[2])))
PY
}

@test "prints each measured script with the share of its lines run" {
  touch "${TREE}/scripts/build.sh"
  kcov_report "${TREE}/scripts/build.sh" 30 40

  run report "${TREE}/coverage.json"

  [ "$status" -eq 0 ]
  [[ "$output" == *" 75.0%  scripts/build.sh"* ]]
  [[ "$output" == *"TOTAL  75%  (30 of 40 lines, in 1 scripts)"* ]]
}

@test "a script no test ran is named, and its lines count as not run" {
  # kcov's own figure would be 100%: it never saw the second script.
  touch "${TREE}/scripts/build.sh"
  printf '#!/usr/bin/env bash\n# a comment\n\necho one\necho two\n' > "${TREE}/.claude/hooks/start.sh"
  kcov_report "${TREE}/scripts/build.sh" 6 6

  run report "${TREE}/coverage.json"

  [[ "$output" == *"Run by no test at all (1):"* ]]
  [[ "$output" == *"0.0%  .claude/hooks/start.sh"* ]]
  [[ "$output" == *"TOTAL  75%  (6 of 8 lines, in 2 scripts)"* ]]
}

@test "leaves out what is not a shell script, and anything outside the tree" {
  touch "${TREE}/scripts/build.sh"
  printf '{"files": [
    {"file": "%s/scripts/build.sh", "covered_lines": "1", "total_lines": "2"},
    {"file": "%s/scripts/tests/build.bats", "covered_lines": "9", "total_lines": "9"},
    {"file": "/usr/local/libexec/bats-core/bats", "covered_lines": "9", "total_lines": "9"}
  ]}\n' "$TREE" "$TREE" > "${TREE}/coverage.json"

  run report "${TREE}/coverage.json"

  [[ "$output" == *"TOTAL  50%  (1 of 2 lines, in 1 scripts)"* ]]
  [[ "$output" != *"build.bats"* ]]
}

@test "a copy of a script run from a throwaway folder counts for the script" {
  # Some tests copy a script into a temporary repository and run it there.
  touch "${TREE}/.github/scripts/ci/check.sh"
  printf '{"files": [
    {"file": "/tmp/first/.github/scripts/ci/check.sh", "covered_lines": "3", "total_lines": "10"},
    {"file": "/tmp/second/.github/scripts/ci/check.sh", "covered_lines": "8", "total_lines": "10"}
  ]}\n' > "${TREE}/coverage.json"

  run report "${TREE}/coverage.json"

  [[ "$output" == *" 80.0%  .github/scripts/ci/check.sh"* ]]
  [[ "$output" != *"Run by no test at all"* ]]
}

@test "a script elsewhere that only shares a name is not taken for ours" {
  touch "${TREE}/scripts/build.sh"
  kcov_report "/tmp/other/build.sh" 5 5

  run report "${TREE}/coverage.json"

  [[ "$output" == *"Run by no test at all (1):"* ]]
}

@test "does not count a script under node_modules as untested" {
  mkdir -p "${TREE}/scripts/node_modules/pkg"
  touch "${TREE}/scripts/node_modules/pkg/install.sh" "${TREE}/scripts/build.sh"
  kcov_report "${TREE}/scripts/build.sh" 2 2

  run report "${TREE}/coverage.json"

  [[ "$output" != *"node_modules"* ]]
  [[ "$output" == *"in 1 scripts"* ]]
}

@test "fails, saying why, when kcov left no report" {
  run report "${TREE}/nothing-here.json"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Could not read kcov's report"* ]]
}

@test "fails when it is not told where the report is" {
  run report

  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage: shell-test-coverage.py <coverage.json>"* ]]
}
