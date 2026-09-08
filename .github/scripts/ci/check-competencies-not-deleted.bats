#!/usr/bin/env bats
# Tests for check-competencies-not-deleted.sh
#
# Each test builds a throwaway git repository, because the thing under test
# is a comparison between two commits.
#
# Writing these caught the mistake that a hand-check missed. Editing the
# catalogue in the working tree and running the script proves nothing — it
# compares committed refs, so an uncommitted deletion looks like no deletion
# at all, and the script reported success.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/check-competencies-not-deleted.sh"
  REPO="${BATS_TEST_TMPDIR}/repo"

  mkdir -p "${REPO}/shared" "${REPO}/.github/scripts/shared"
  cp "${BATS_TEST_DIRNAME}/../shared/logging.sh" \
    "${REPO}/.github/scripts/shared/logging.sh"
  mkdir -p "${REPO}/.github/scripts/ci"
  cp "$SCRIPT" "${REPO}/.github/scripts/ci/"
  SCRIPT="${REPO}/.github/scripts/ci/check-competencies-not-deleted.sh"

  cd "$REPO" || return 1

  git init -q -b main .
  git config user.email t@t
  git config user.name t

  cat > shared/competencies.yaml <<'YAML'
competencies:
  - id: prescribe_non_controlled
    display_name: "Prescribe Non-Controlled Medications"

  - id: certify_death
    display_name: "Certify Death"

  - id: perform_venepuncture
    display_name: "Perform Venepuncture"
YAML

  git add -A
  git commit -q -m "base"
  git branch -q base-ref
}

commit_all() {
  local message="$1"

  git add -A
  git commit -q -m "$message"
}

@test "an unchanged catalogue passes" {
  commit_all "unrelated change" || true

  run bash "$SCRIPT" base-ref

  [ "$status" -eq 0 ]
  [[ "$output" == *"No competency was removed"* ]]
}

@test "adding a competency passes" {
  cat >> shared/competencies.yaml <<'YAML'

  - id: request_ct_scan
    display_name: "Request CT Scan"
YAML
  commit_all "add a competency"

  run bash "$SCRIPT" base-ref

  [ "$status" -eq 0 ]
}

@test "retiring a competency passes" {
  sed -i.bak 's/    display_name: "Certify Death"/    display_name: "Certify Death"\n    retired_on: 2026-09-08/' \
    shared/competencies.yaml
  rm -f shared/competencies.yaml.bak
  commit_all "retire a competency"

  run bash "$SCRIPT" base-ref

  [ "$status" -eq 0 ]
}

@test "deleting a competency fails and names it" {
  grep -v "certify_death" shared/competencies.yaml \
    | grep -v 'display_name: "Certify Death"' > tmp.yaml
  mv tmp.yaml shared/competencies.yaml
  commit_all "delete a competency"

  run bash "$SCRIPT" base-ref

  [ "$status" -eq 1 ]
  [[ "$output" == *"certify_death"* ]]
}

@test "the failure explains how to retire instead" {
  grep -v "certify_death" shared/competencies.yaml \
    | grep -v 'display_name: "Certify Death"' > tmp.yaml
  mv tmp.yaml shared/competencies.yaml
  commit_all "delete a competency"

  run bash "$SCRIPT" base-ref

  [[ "$output" == *"retired_on"* ]]
}

@test "deleting several competencies names all of them" {
  cat > shared/competencies.yaml <<'YAML'
competencies:
  - id: perform_venepuncture
    display_name: "Perform Venepuncture"
YAML
  commit_all "delete two competencies"

  run bash "$SCRIPT" base-ref

  [ "$status" -eq 1 ]
  [[ "$output" == *"prescribe_non_controlled"* ]]
  [[ "$output" == *"certify_death"* ]]
}

@test "renaming a competency counts as a deletion" {
  sed -i.bak 's/  - id: certify_death/  - id: certify_a_death/' \
    shared/competencies.yaml
  rm -f shared/competencies.yaml.bak
  commit_all "rename a competency"

  run bash "$SCRIPT" base-ref

  [ "$status" -eq 1 ]
  [[ "$output" == *"certify_death"* ]]
}

@test "an uncommitted deletion is not seen, because refs are compared" {
  # Documents the trap rather than a feature. A hand-check that edits the
  # working tree and runs the script gets a pass and proves nothing.
  grep -v "certify_death" shared/competencies.yaml > tmp.yaml
  mv tmp.yaml shared/competencies.yaml

  run bash "$SCRIPT" base-ref

  [ "$status" -eq 0 ]
}

@test "a missing catalogue on the base ref is not a failure" {
  # A branch predating the catalogue. Only the catalogue is removed — an
  # earlier version of this test emptied the repository and took the script
  # under test with it, so bash exited 127 and the assertion was measuring
  # nothing.
  git checkout -q -b no-catalogue-ref
  git rm -q shared/competencies.yaml
  git commit -q -m "before the catalogue existed"
  git checkout -q main

  run bash "$SCRIPT" no-catalogue-ref

  [ "$status" -eq 0 ]
  [[ "$output" == *"nothing to compare"* ]]
}

@test "quoted ids are compared without their quotes" {
  cat > shared/competencies.yaml <<'YAML'
competencies:
  - id: "prescribe_non_controlled"
    display_name: "Prescribe Non-Controlled Medications"

  - id: 'certify_death'
    display_name: "Certify Death"

  - id: perform_venepuncture
    display_name: "Perform Venepuncture"
YAML
  commit_all "quote the ids"

  run bash "$SCRIPT" base-ref

  [ "$status" -eq 0 ]
}

@test "un-retiring a competency fails and names it" {
  # Retire it on the base ref, then bring it back on the branch — the only
  # way to reach this state.
  sed -i.bak 's/    display_name: "Certify Death"/    display_name: "Certify Death"\n    retired_on: 2026-09-08/' \
    shared/competencies.yaml
  rm -f shared/competencies.yaml.bak
  commit_all "retire a competency"
  git branch -q -f retired-ref

  grep -v "retired_on: 2026-09-08" shared/competencies.yaml > tmp.yaml
  mv tmp.yaml shared/competencies.yaml
  commit_all "bring it back"

  run bash "$SCRIPT" retired-ref

  [ "$status" -eq 1 ]
  [[ "$output" == *"certify_death"* ]]
  [[ "$output" == *"current again"* ]]
}

@test "the un-retirement failure says to add a new entry instead" {
  sed -i.bak 's/    display_name: "Certify Death"/    display_name: "Certify Death"\n    retired_on: 2026-09-08/' \
    shared/competencies.yaml
  rm -f shared/competencies.yaml.bak
  commit_all "retire a competency"
  git branch -q -f retired-ref

  grep -v "retired_on: 2026-09-08" shared/competencies.yaml > tmp.yaml
  mv tmp.yaml shared/competencies.yaml
  commit_all "bring it back"

  run bash "$SCRIPT" retired-ref

  [[ "$output" == *"new id"* ]]
}

@test "a competency that stays retired passes" {
  sed -i.bak 's/    display_name: "Certify Death"/    display_name: "Certify Death"\n    retired_on: 2026-09-08/' \
    shared/competencies.yaml
  rm -f shared/competencies.yaml.bak
  commit_all "retire a competency"
  git branch -q -f retired-ref

  echo "# unrelated" >> shared/competencies.yaml
  commit_all "unrelated edit"

  run bash "$SCRIPT" retired-ref

  [ "$status" -eq 0 ]
}

@test "deleting a retired competency is still a deletion" {
  sed -i.bak 's/    display_name: "Certify Death"/    display_name: "Certify Death"\n    retired_on: 2026-09-08/' \
    shared/competencies.yaml
  rm -f shared/competencies.yaml.bak
  commit_all "retire a competency"
  git branch -q -f retired-ref

  grep -v "certify_death" shared/competencies.yaml \
    | grep -v 'display_name: "Certify Death"' \
    | grep -v "retired_on: 2026-09-08" > tmp.yaml
  mv tmp.yaml shared/competencies.yaml
  commit_all "delete the retired competency"

  run bash "$SCRIPT" retired-ref

  [ "$status" -eq 1 ]
  [[ "$output" == *"removes competencies"* ]]
}
