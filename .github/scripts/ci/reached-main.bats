#!/usr/bin/env bats
# Tests for reached-main.sh
#
# With a stand-in for GitHub's compare, which answers from a file one line
# at a time, so a test can make the first answer differ from the second.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/reached-main.sh"
  source "$SCRIPT"

  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/output"
  export RETRY_WAIT_SECONDS=0
  ANSWERS="${BATS_TEST_TMPDIR}/answers"
  ASKED="${BATS_TEST_TMPDIR}/asked"
  : > "$GITHUB_OUTPUT"
  : > "$ASKED"
  SHA="0a1b2c3d4e5f60718293a4b5c6d7e8f901234567"

  compare_with_main() {
    echo "$1 $2" >> "$ASKED"
    sed -n "$(wc -l < "$ASKED" | tr -d ' ')p" "$ANSWERS"
  }
}

answers() {
  printf '%s\n' "$@" > "$ANSWERS"
}

@test "a commit main is ahead of has reached main" {
  answers ahead

  run main bailey-medics/quillmedical "$SHA"

  [ "$status" -eq 0 ]
  [ "$(cat "$GITHUB_OUTPUT")" = "reached=true" ]
}

@test "a commit that is main's tip has reached main" {
  answers identical

  run main bailey-medics/quillmedical "$SHA"

  [ "$(cat "$GITHUB_OUTPUT")" = "reached=true" ]
}

@test "a commit only a feature branch holds has not reached main" {
  # What the alarm is for: merged into the branch beneath it, and main
  # has moved on without it.
  answers diverged diverged

  run main bailey-medics/quillmedical "$SHA"

  [ "$status" -eq 0 ]
  [ "$(cat "$GITHUB_OUTPUT")" = "reached=false" ]
}

@test "a commit ahead of main has not reached main" {
  answers behind behind

  run main bailey-medics/quillmedical "$SHA"

  [ "$(cat "$GITHUB_OUTPUT")" = "reached=false" ]
}

@test "it asks again before saying no, and takes the second answer" {
  answers diverged ahead

  run main bailey-medics/quillmedical "$SHA"

  [ "$(cat "$GITHUB_OUTPUT")" = "reached=true" ]
  [ "$(wc -l < "$ASKED" | tr -d ' ')" = "2" ]
}

@test "it does not ask twice when the first answer is yes" {
  answers ahead

  run main bailey-medics/quillmedical "$SHA"

  [ "$(wc -l < "$ASKED" | tr -d ' ')" = "1" ]
}

@test "a commit GitHub cannot compare counts as not reached" {
  answers "" ""

  run main bailey-medics/quillmedical "$SHA"

  [ "$status" -eq 0 ]
  [ "$(cat "$GITHUB_OUTPUT")" = "reached=false" ]
}

@test "no merge commit counts as not reached, and GitHub is not asked" {
  run main bailey-medics/quillmedical ""

  [ "$status" -eq 0 ]
  [ "$(cat "$GITHUB_OUTPUT")" = "reached=false" ]
  [ ! -s "$ASKED" ]
}

@test "something that is not a commit is not sent to GitHub" {
  run main bailey-medics/quillmedical "main; rm -rf /"

  [ "$(cat "$GITHUB_OUTPUT")" = "reached=false" ]
  [ ! -s "$ASKED" ]
}

@test "it asks about the repository and commit it was given" {
  answers ahead

  run main bailey-medics/quillmedical "$SHA"

  [ "$(cat "$ASKED")" = "bailey-medics/quillmedical ${SHA}" ]
}

@test "no repository is an error" {
  run main

  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage:"* ]]
}
