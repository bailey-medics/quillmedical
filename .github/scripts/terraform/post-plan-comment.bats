#!/usr/bin/env bats
# Tests for post-plan-comment.sh — the Terraform plan PR-comment step.
#
# The pure formatting logic (truncate_plan, plan_summary, build_body) is tested
# directly. resolve_job_url is tested against a `gh` stub, because its stdout is
# its return value and anything else leaking there lands in the comment body.
# The `gh pr comment` side effect in main() is not exercised here.

bats_require_minimum_version 1.5.0

setup() {
  source "${BATS_TEST_DIRNAME}/post-plan-comment.sh"

  STUB_DIR="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$STUB_DIR"
  PATH="$STUB_DIR:$PATH"

  GITHUB_REPOSITORY="o/r"
  GITHUB_RUN_ID="42"
  GITHUB_RUN_ATTEMPT="1"
}

# Put a `gh` on PATH that prints $1 for `gh api` and exits with $2.
stub_gh() {
  local output="$1"
  local status="${2:-0}"

  cat >"$STUB_DIR/gh" <<STUB
#!/usr/bin/env bash
printf '%s' '${output}'
exit ${status}
STUB
  chmod +x "$STUB_DIR/gh"
}

# A plan as Terraform actually prints one: refresh noise, a diff, then the one
# line that says what will happen.
sample_plan() {
  cat <<'PLAN'
module.secrets.google_secret_manager_secret.secrets["jwt-secret"]: Refreshing state... [id=projects/p/secrets/jwt-secret]
module.monitoring.google_monitoring_alert_policy.uptime: Refreshing state... [id=projects/p/alertPolicies/1]

Terraform will perform the following actions:

  # module.analytics[0].google_monitoring_dashboard.quill will be updated in-place
  ~ resource "google_monitoring_dashboard" "quill" {
      ~ columns = "2" -> 2
    }

Plan: 0 to add, 1 to change, 0 to destroy.
PLAN
}

@test "truncate_plan passes short plans through unchanged" {
  run truncate_plan <<<"Plan: 1 to add, 0 to change, 0 to destroy."
  [ "$status" -eq 0 ]
  [ "$output" = "Plan: 1 to add, 0 to change, 0 to destroy." ]
}

@test "truncate_plan cuts oversized plans and appends a marker" {
  local big
  big="$(printf 'x%.0s' $(seq 1 70000))"
  run truncate_plan <<<"$big"
  [ "$status" -eq 0 ]
  [[ "$output" == *"... (truncated)" ]]
  # 60000 chars + "\n\n... (truncated)" (17 chars) = 60017
  [ "${#output}" -eq 60017 ]
}

@test "plan_summary pulls the outcome line out of a full plan" {
  run plan_summary < <(sample_plan)
  [ "$status" -eq 0 ]
  [ "$output" = "Plan: 0 to add, 1 to change, 0 to destroy." ]
}

@test "plan_summary recognises a plan with no changes" {
  run plan_summary <<'PLAN'
module.networking.google_compute_network.vpc: Refreshing state... [id=projects/p/networks/vpc]

No changes. Your infrastructure matches the configuration.
PLAN
  [ "$status" -eq 0 ]
  [ "$output" = "No changes. Your infrastructure matches the configuration." ]
}

@test "plan_summary takes the last outcome line when several are present" {
  run plan_summary <<'PLAN'
Plan: 5 to add, 0 to change, 0 to destroy.
Plan: 0 to add, 2 to change, 1 to destroy.
PLAN
  [ "$status" -eq 0 ]
  [ "$output" = "Plan: 0 to add, 2 to change, 1 to destroy." ]
}

@test "plan_summary ignores the same words quoted inside a diff" {
  run plan_summary <<'PLAN'
  ~ description = "No changes. This is a resource attribute, not an outcome."
      + note     = "Plan: 1 to add, 0 to change, 0 to destroy."
PLAN
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "plan_summary prints nothing when the plan reached no conclusion" {
  run plan_summary <<'PLAN'
╷
│ Error: Invalid function argument
│
│   on main.tf line 5, in resource "google_monitoring_dashboard" "quill":
╵
PLAN
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "build_body posts the outcome line and the job link, not the whole plan" {
  local plan
  plan="$(sample_plan)"
  run build_body "Plan: 0 to add, 1 to change, 0 to destroy." \
    "https://github.com/o/r/actions/runs/42/job/99" "$plan"
  [ "$status" -eq 0 ]
  [[ "$output" == *'### Terraform Plan: `teaching`'* ]]
  [[ "$output" == *'Plan: 0 to add, 1 to change, 0 to destroy.'* ]]
  [[ "$output" == *'See the plan job for full details: https://github.com/o/r/actions/runs/42/job/99'* ]]
  # The point of the change: none of the refresh noise or diff reaches the PR.
  [[ "$output" != *'Refreshing state'* ]]
  [[ "$output" != *'google_monitoring_dashboard'* ]]
}

@test "build_body stays short — a summary comment is a handful of lines" {
  local plan
  plan="$(sample_plan)"
  run build_body "No changes. Your infrastructure matches the configuration." \
    "https://github.com/o/r/actions/runs/42/job/99" "$plan"
  [ "$status" -eq 0 ]
  [ "${#lines[@]}" -le 8 ]
}

@test "build_body falls back to the full output when there is no summary" {
  local plan
  plan="$(sample_plan)"
  run build_body "" "https://github.com/o/r/actions/runs/42/job/99" "$plan"
  [ "$status" -eq 0 ]
  [[ "$output" == *'the plan did not complete'* ]]
  # A failed plan must not be reduced to a reassuring empty comment.
  [[ "$output" == *'Refreshing state'* ]]
  [[ "$output" == *'See the plan job for full details: https://github.com/o/r/actions/runs/42/job/99'* ]]
}

@test "resolve_job_url returns the job link and nothing else" {
  stub_gh "https://github.com/o/r/actions/runs/42/job/99"

  JOB_NAME="Plan (teaching)" run --separate-stderr resolve_job_url \
    "https://github.com/o/r/actions/runs/42"

  [ "$status" -eq 0 ]
  # Exact match, not a substring: a diagnostic logged to stdout here would be
  # captured by the caller and spliced into the comment body.
  [ "$output" = "https://github.com/o/r/actions/runs/42/job/99" ]
}

@test "resolve_job_url falls back to the run URL when the job name does not match" {
  stub_gh ""

  JOB_NAME="Plan (renamed)" run --separate-stderr resolve_job_url \
    "https://github.com/o/r/actions/runs/42"

  [ "$status" -eq 0 ]
  [ "$output" = "https://github.com/o/r/actions/runs/42" ]
  [[ "$stderr" == *"Could not resolve the job URL"* ]]
}

@test "resolve_job_url falls back to the run URL when the API call fails" {
  stub_gh "" 1

  JOB_NAME="Plan (teaching)" run --separate-stderr resolve_job_url \
    "https://github.com/o/r/actions/runs/42"

  [ "$status" -eq 0 ]
  [ "$output" = "https://github.com/o/r/actions/runs/42" ]
  [[ "$stderr" == *"Could not resolve the job URL"* ]]
}

@test "resolve_job_url falls back to the run URL when JOB_NAME is unset" {
  stub_gh "https://github.com/o/r/actions/runs/42/job/99"

  JOB_NAME="" run --separate-stderr resolve_job_url \
    "https://github.com/o/r/actions/runs/42"

  [ "$status" -eq 0 ]
  [ "$output" = "https://github.com/o/r/actions/runs/42" ]
  [[ "$stderr" == *"Could not resolve the job URL"* ]]
}
