#!/usr/bin/env bats
# Tests for wait-for-ancestor-decisions.sh

# shellcheck disable=SC2329,SC2030,SC2031

setup() {
  source "${BATS_TEST_DIRNAME}/wait-for-ancestor-decisions.sh"

  # A complete, valid environment. Each guard test removes exactly one piece,
  # so no test reaches the `gh` calls.
  export GH_TOKEN="fake-token-never-used"
  export GITHUB_REPOSITORY="owner/repo"
  export GITHUB_HEAD_REF="feature/example"
  export GITHUB_WORKFLOW_REF="owner/repo/.github/workflows/gate-breaking.yml@refs/pull/1/merge"
}

VALID_JOB="Destructive-migration Slack notification decision"
VALID_SHA="aaaa111"
VALID_RUN_ID="500"

@test "errors when no job name is given" {
  run main

  [ "$status" -eq 1 ]
  [[ "$output" == *"No job name provided"* ]]
}

@test "errors when no head SHA is given" {
  run main "$VALID_JOB"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No head SHA provided"* ]]
}

@test "errors when no run id is given" {
  run main "$VALID_JOB" "$VALID_SHA"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No run id provided"* ]]
}

@test "errors when GH_TOKEN is not set" {
  unset GH_TOKEN

  run main "$VALID_JOB" "$VALID_SHA" "$VALID_RUN_ID"

  [ "$status" -eq 1 ]
  [[ "$output" == *"GH_TOKEN is not set"* ]]
}

@test "errors when GITHUB_REPOSITORY is not set" {
  unset GITHUB_REPOSITORY

  run main "$VALID_JOB" "$VALID_SHA" "$VALID_RUN_ID"

  [ "$status" -eq 1 ]
  [[ "$output" == *"GITHUB_REPOSITORY not set"* ]]
}

@test "errors when GITHUB_HEAD_REF is not set" {
  unset GITHUB_HEAD_REF

  run main "$VALID_JOB" "$VALID_SHA" "$VALID_RUN_ID"

  [ "$status" -eq 1 ]
  [[ "$output" == *"GITHUB_HEAD_REF not set"* ]]
}

@test "errors when GITHUB_WORKFLOW_REF is not set" {
  unset GITHUB_WORKFLOW_REF

  run main "$VALID_JOB" "$VALID_SHA" "$VALID_RUN_ID"

  [ "$status" -eq 1 ]
  [[ "$output" == *"GITHUB_WORKFLOW_REF not set"* ]]
}

@test "errors when GITHUB_WORKFLOW_REF has no file name in it" {
  # Cutting the "@..." suffix off this leaves nothing, so there is no workflow
  # to ask GitHub about. Without the check we would query an empty path, get
  # nothing back, and wrongly conclude no ancestor is running.
  export GITHUB_WORKFLOW_REF="@refs/pull/1/merge"

  run main "$VALID_JOB" "$VALID_SHA" "$VALID_RUN_ID"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Could not derive a workflow file name"* ]]
}

# ---- ancestor_run_ids: who must I wait for? ----

# Treat every candidate as an ancestor, so these tests exercise the filtering
# this script owns rather than git's ancestry rules.
stub_all_ancestors() {
  is_ancestor_commit() { return 0; }
}

stub_no_ancestors() {
  is_ancestor_commit() { return 1; }
}

RUNS_JSON='{"workflow_runs":[
  {"id":100,"head_sha":"aaa","status":"in_progress"},
  {"id":200,"head_sha":"bbb","status":"queued"},
  {"id":300,"head_sha":"ccc","status":"completed"},
  {"id":500,"head_sha":"eee","status":"in_progress"}
]}'

@test "ancestor_run_ids returns nothing for an empty run list" {
  stub_all_ancestors

  run ancestor_run_ids '{"workflow_runs":[]}' "zzz" "500"

  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "ancestor_run_ids returns nothing when the payload has no runs key" {
  # A failed `gh api` call falls back to '{}'; that must not crash the poll.
  stub_all_ancestors

  run ancestor_run_ids '{}' "zzz" "500"

  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "ancestor_run_ids skips completed runs" {
  # Run 300 is completed, so it has already posted (or decided not to) and
  # there is nothing to wait for.
  stub_all_ancestors

  run ancestor_run_ids "$RUNS_JSON" "zzz" "999"

  [ "$status" -eq 0 ]
  [[ "$output" != *"300"* ]]
}

@test "ancestor_run_ids includes both in-progress and queued runs" {
  # A queued run has not started deciding yet, so it is very much still ahead
  # of us - excluding it would let us post before it.
  stub_all_ancestors

  run ancestor_run_ids "$RUNS_JSON" "zzz" "999"

  [ "$status" -eq 0 ]
  [[ "$output" == *"100 aaa"* ]]
  [[ "$output" == *"200 bbb"* ]]
}

@test "ancestor_run_ids excludes this run itself" {
  # Without this a run would wait for its own decide job, which cannot finish
  # until the wait does - a deadlock resolved only by the deadline.
  stub_all_ancestors

  run ancestor_run_ids "$RUNS_JSON" "zzz" "500"

  [ "$status" -eq 0 ]
  [[ "$output" != *"500"* ]]
  [[ "$output" == *"100 aaa"* ]]
}

@test "ancestor_run_ids excludes runs whose commit is not an ancestor" {
  # A run on a sibling branch, or a commit force-pushed away, must not block
  # us.
  stub_no_ancestors

  run ancestor_run_ids "$RUNS_JSON" "zzz" "999"

  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

# ---- decide_job_finished: has that one finished? ----

@test "decide_job_finished is true for a completed decide job" {
  local jobs='{"jobs":[
    {"name":"DB destructive migration check","status":"completed"},
    {"name":"Destructive-migration Slack notification decision","status":"completed"}
  ]}'

  run decide_job_finished "$jobs" "$VALID_JOB"

  [ "$status" -eq 0 ]
}

@test "decide_job_finished is false while the decide job is still running" {
  local jobs='{"jobs":[
    {"name":"Destructive-migration Slack notification decision","status":"in_progress"}
  ]}'

  run decide_job_finished "$jobs" "$VALID_JOB"

  [ "$status" -ne 0 ]
}

@test "decide_job_finished is false while the decide job is queued" {
  local jobs='{"jobs":[
    {"name":"Destructive-migration Slack notification decision","status":"queued"}
  ]}'

  run decide_job_finished "$jobs" "$VALID_JOB"

  [ "$status" -ne 0 ]
}

@test "decide_job_finished is false when the job is not listed yet" {
  # The run exists but its decide job has not been created - it is still
  # behind its detection job. Not finished, so keep waiting.
  local jobs='{"jobs":[
    {"name":"DB destructive migration check","status":"in_progress"}
  ]}'

  run decide_job_finished "$jobs" "$VALID_JOB"

  [ "$status" -ne 0 ]
}

@test "decide_job_finished is false for an unparseable payload" {
  # A failed `gh api` call falls back to '{}'. Treating that as unfinished
  # retries on the next poll rather than posting out of order.
  run decide_job_finished '{}' "$VALID_JOB"

  [ "$status" -ne 0 ]
}

@test "decide_job_finished treats a cancelled decide job as finished" {
  # GitHub reports a cancelled job as status=completed with a cancelled
  # conclusion. It will never post, so waiting on it would burn the deadline
  # for nothing.
  local jobs='{"jobs":[
    {"name":"Destructive-migration Slack notification decision","status":"completed","conclusion":"cancelled"}
  ]}'

  run decide_job_finished "$jobs" "$VALID_JOB"

  [ "$status" -eq 0 ]
}

@test "decide_job_finished treats a failed decide job as finished" {
  local jobs='{"jobs":[
    {"name":"Destructive-migration Slack notification decision","status":"completed","conclusion":"failure"}
  ]}'

  run decide_job_finished "$jobs" "$VALID_JOB"

  [ "$status" -eq 0 ]
}

@test "decide_job_finished ignores the other gate's decide job" {
  # Both gates run in the same workflow, so a run's job list holds both
  # decide jobs. Waiting on the wrong one would couple gates that have no
  # reason to block each other.
  local jobs='{"jobs":[
    {"name":"Breaking-change Slack notification decision","status":"in_progress"},
    {"name":"Destructive-migration Slack notification decision","status":"completed"}
  ]}'

  run decide_job_finished "$jobs" "$VALID_JOB"

  [ "$status" -eq 0 ]

  run decide_job_finished "$jobs" "Breaking-change Slack notification decision"

  [ "$status" -ne 0 ]
}
