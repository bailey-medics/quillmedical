#!/usr/bin/env bats
# framework-pipeline.yml's failure notice tells apart a deploy that failed
# before the sync job started from a sync job that ran and failed. Only the
# second may say a refused version is named in the job's log, because only
# then did anything look at a version. The wording is one expression in the
# workflow, so these tests read the workflow.

setup() {
  ROOT="${BATS_TEST_DIRNAME}/../../.."
  WORKFLOW="${ROOT}/.github/workflows/framework-pipeline.yml"
}

# The lines of the notify-deploy-failure job's message.
notice() {
  awk '
    /^  notify-deploy-failure:$/ { found = 1 }
    found && /^    secrets:$/ { exit }
    found { print }
  ' "$WORKFLOW"
}

@test "a refused version is mentioned only when the sync job started" {
  run notice

  [[ "$output" == *"A refused version is named in its log."* ]]
  [ "$(echo "$output" | grep -c 'A refused version')" -eq 1 ]
  [[ "$(echo "$output" | grep 'A refused version')" == *"needs.deploy.outputs.execution != '' && 'The sync job ran and failed."* ]]
}

@test "a deploy that never started the sync job says so" {
  run notice

  [[ "$output" == *"|| 'The run failed before the sync job started"* ]]
  [[ "$output" == *"The framework version was not looked at."* ]]
}

@test "the sync job line links the execution, or says it did not start" {
  run notice

  [[ "$output" == *"format('<{0}|{1}>', needs.deploy.outputs.log_url, needs.deploy.outputs.execution) || 'not started'"* ]]
}
