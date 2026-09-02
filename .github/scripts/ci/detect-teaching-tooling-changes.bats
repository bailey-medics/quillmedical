#!/usr/bin/env bats
# Tests for detect-teaching-tooling-changes.sh
#
# Each test builds a throwaway git repository, because the thing under test
# is a comparison between two commits. That also keeps the real repository
# out of it: a test must not depend on what this branch happens to contain.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/detect-teaching-tooling-changes.sh"
  REPO="${BATS_TEST_TMPDIR}/repo"
  mkdir -p "${REPO}/backend/app/features/teaching/tooling"
  cd "$REPO" || return 1

  git init -q -b main .
  git config user.email t@t
  git config user.name t

  echo "rules" > backend/app/features/teaching/tooling/validate.py
  echo "parser" > backend/app/features/teaching/mdx_parser.py
  echo "unrelated" > backend/app/main.py

  git add -A
  git commit -q -m "base"
  BASE="$(git rev-parse HEAD)"
}

commit_all() {
  local message="$1"

  git add -A
  git commit -q -m "$message"
}

@test "an unchanged contract does not trigger revalidation" {
  commit_all "no-op" || true

  run bash "$SCRIPT" "$BASE"

  [ "$status" -eq 0 ]
  [[ "$output" == *"changed=false"* ]]
}

@test "changing the validator triggers it" {
  echo "stricter" >> backend/app/features/teaching/tooling/validate.py

  commit_all "tighten"

  run bash "$SCRIPT" "$BASE"
  [[ "$output" == *"changed=true"* ]]
}

@test "changing the MDX parser triggers it, though it sits outside the folder" {
  echo "stricter" >> backend/app/features/teaching/mdx_parser.py

  commit_all "tighten the parser"

  run bash "$SCRIPT" "$BASE"

  [[ "$output" == *"changed=true"* ]]
}

@test "a new file in the tooling package triggers it" {
  echo "x" > backend/app/features/teaching/tooling/new_rule.py

  commit_all "add a rule"

  run bash "$SCRIPT" "$BASE"

  [[ "$output" == *"changed=true"* ]]
}

@test "deleting a contract file triggers it" {
  # Deletion changes what the validator does as surely as an edit.
  rm backend/app/features/teaching/mdx_parser.py
  commit_all "remove the parser"
  run bash "$SCRIPT" "$BASE"
  [[ "$output" == *"changed=true"* ]]
}

@test "a dependency bump triggers it, being inside the package" {
  # The subtle one: validation behaviour moves without our code changing.
  echo "pydantic = 2.14.0" > backend/app/features/teaching/tooling/poetry.lock

  commit_all "bump pydantic"

  run bash "$SCRIPT" "$BASE"

  [[ "$output" == *"changed=true"* ]]
}

@test "unrelated work does not trigger it" {
  echo "more" >> backend/app/main.py

  commit_all "unrelated"

  run bash "$SCRIPT" "$BASE"

  [[ "$output" == *"changed=false"* ]]
}

@test "a branch whose contract is back at base no longer triggers it" {
  # Runs per push. The push carrying the edit answered true and revalidated;
  # this asks again once the contract is back, and the answer has moved with
  # it. Not the same as nothing having happened: the notification gate posts
  # an all-clear on the return.
  echo "stricter" >> backend/app/features/teaching/tooling/validate.py
  commit_all "tighten"
  echo "rules" > backend/app/features/teaching/tooling/validate.py
  commit_all "thought better of it"

  run bash "$SCRIPT" "$BASE"

  [[ "$output" == *"changed=false"* ]]
}

@test "the hash is reported even when nothing changed" {
  # The decision file will be recorded against it, so it is always needed.
  run bash "$SCRIPT" "$BASE"

  [[ "$output" == *"tooling_hash="* ]]
}

@test "the same contract hashes the same from either ref" {
  run bash "$SCRIPT" HEAD

  [[ "$output" == *"changed=false"* ]]
}

@test "a changed contract names the files, so nobody has to guess" {
  echo "stricter" >> backend/app/features/teaching/tooling/validate.py

  commit_all "tighten"

  run bash "$SCRIPT" "$BASE"

  [[ "$output" == *"tooling/validate.py"* ]]
}

@test "fails rather than hashing nothing when the paths are absent" {
  # A silent empty hash would read as "unchanged" for every branch.

  rm -rf backend/app/features/teaching

  commit_all "remove it all"

  run bash "$SCRIPT" "$BASE"

  [ "$status" -eq 1 ]
  [[ "$output" == *"refusing to hash nothing"* ]]
}

@test "fails without a base ref" {
  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No base ref"* ]]
}
