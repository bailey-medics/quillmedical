#!/usr/bin/env bats
# Tests for copy-llm-config.sh
#
# Each test builds a throwaway source tree and output directory. The real
# repository is mounted read-only when this suite runs, and a test must not
# depend on which rules and skills this branch happens to contain.

bats_require_minimum_version 1.5.0

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/copy-llm-config.sh"
  SOURCE="${BATS_TEST_TMPDIR}/repo"
  OUTPUT="${BATS_TEST_TMPDIR}/llm"

  mkdir -p "${SOURCE}/.claude/rules"
  mkdir -p "${SOURCE}/.claude/skills/crpd"
  mkdir -p "${SOURCE}/.claude/skills/tldr"
  mkdir -p "${SOURCE}/.claude/hooks"

  echo "project instructions" > "${SOURCE}/CLAUDE.md"
  echo "backend rule" > "${SOURCE}/.claude/rules/backend.md"
  echo "crpd skill" > "${SOURCE}/.claude/skills/crpd/SKILL.md"
  echo "tldr skill" > "${SOURCE}/.claude/skills/tldr/SKILL.md"
  echo "hooks readme" > "${SOURCE}/.claude/hooks/README.md"
}

@test "CLAUDE.md is copied as claude.md" {
  run bash "$SCRIPT" "$SOURCE" "$OUTPUT"

  [ "$status" -eq 0 ]
  [ "$(cat "${OUTPUT}/claude.md")" = "project instructions" ]
}

@test "each rule is copied under its own name" {
  run bash "$SCRIPT" "$SOURCE" "$OUTPUT"

  [ "$status" -eq 0 ]
  [ "$(cat "${OUTPUT}/rules/backend.md")" = "backend rule" ]
}

@test "each skill is flattened to the name of its directory" {
  run bash "$SCRIPT" "$SOURCE" "$OUTPUT"

  [ "$status" -eq 0 ]
  [ "$(cat "${OUTPUT}/skills/crpd.md")" = "crpd skill" ]
  [ "$(cat "${OUTPUT}/skills/tldr.md")" = "tldr skill" ]
}

@test "the hooks README is copied as hooks.md" {
  run bash "$SCRIPT" "$SOURCE" "$OUTPUT"

  [ "$status" -eq 0 ]
  [ "$(cat "${OUTPUT}/hooks.md")" = "hooks readme" ]
}

@test "a missing hooks README is not an error" {
  rm "${SOURCE}/.claude/hooks/README.md"

  run bash "$SCRIPT" "$SOURCE" "$OUTPUT"

  [ "$status" -eq 0 ]
  run ! test -e "${OUTPUT}/hooks.md"
}

@test "a skill directory with no SKILL.md produces no page" {
  mkdir -p "${SOURCE}/.claude/skills/empty"

  run bash "$SCRIPT" "$SOURCE" "$OUTPUT"

  [ "$status" -eq 0 ]
  run ! test -e "${OUTPUT}/skills/empty.md"
}

@test "a source with no rules and no skills still copies CLAUDE.md" {
  rm -r "${SOURCE}/.claude"

  run bash "$SCRIPT" "$SOURCE" "$OUTPUT"

  [ "$status" -eq 0 ]
  [ -f "${OUTPUT}/claude.md" ]
}

@test "a skill deleted since the last run does not linger as a page" {
  bash "$SCRIPT" "$SOURCE" "$OUTPUT"
  rm -r "${SOURCE}/.claude/skills/tldr"

  run bash "$SCRIPT" "$SOURCE" "$OUTPUT"

  [ "$status" -eq 0 ]
  [ -f "${OUTPUT}/skills/crpd.md" ]
  run ! test -e "${OUTPUT}/skills/tldr.md"
}

@test "the copied Copilot prompts from before the change are removed" {
  mkdir -p "${OUTPUT}/prompts"
  echo "old" > "${OUTPUT}/prompts/run-all-tests.prompt.md"

  run bash "$SCRIPT" "$SOURCE" "$OUTPUT"

  [ "$status" -eq 0 ]
  run ! test -e "${OUTPUT}/prompts"
}

@test "a file the script does not own is left alone" {
  mkdir -p "$OUTPUT"
  echo "hand-written" > "${OUTPUT}/index.md"

  run bash "$SCRIPT" "$SOURCE" "$OUTPUT"

  [ "$status" -eq 0 ]
  [ "$(cat "${OUTPUT}/index.md")" = "hand-written" ]
}

@test "a source root with no CLAUDE.md is refused, and nothing is written" {
  rm "${SOURCE}/CLAUDE.md"

  run bash "$SCRIPT" "$SOURCE" "$OUTPUT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No CLAUDE.md"* ]]
  run ! test -e "$OUTPUT"
}

@test "a missing output directory argument is refused" {
  run bash "$SCRIPT" "$SOURCE"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage"* ]]
}

@test "no arguments at all is refused" {
  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage"* ]]
}
