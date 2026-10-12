# scheduled-jobs.tf - the work that runs each day with nobody asking
#
# Two actions on the admin Cloud Run job are run on a timer:
#
#   apply-retention           deletes what the privacy policy says is no
#                             longer kept (backend/app/retention.py)
#   send-teaching-reminders   reminds somebody enrolled who has not started,
#                             and tells somebody whose pass is due to be
#                             repeated (backend/app/features/teaching/
#                             reminders.py)
#
# Cloud Scheduler starts them, and not a scheduled GitHub workflow, which is
# how both began. Nothing in the repository decides who is due a reminder:
# the app knows and the app sends, so GitHub was only an alarm clock, and
# not a dependable one. GitHub describes its schedule as best effort, a run
# can start late or be dropped under load, and scheduled workflows are
# switched off in a repository with no activity for sixty days. The EoEETA
# agreement says a delegate is told "automatically" when a pass is due to
# be repeated.
#
# The two workflows are gone altogether. Neither action is started from
# GitHub in any way. To see what an action would do without doing it, run
# the job by hand with its apply flag left out, which is a report:
#
#   gcloud run jobs execute quill-admin-<environment> \
#     --project=<project> --region=<region> --wait \
#     --update-env-vars=ADMIN_ACTION=apply-retention
#
# and read the three counts in the execution's log. The same with
# ADMIN_ACTION=send-teaching-reminders. Cloud Scheduler's own "Force run"
# starts the real thing.
#
# accessibility-review.yml stays in GitHub. It reads a date out of a file
# in the repository to decide whether it is due, so its trigger lives
# there.

locals {
  # One entry for each scheduled action. `env` is what the execution is
  # started with, as overrides for that one run: the job's own
  # configuration is not changed, so a deploy running migrations on the
  # same job at the same moment is not handed these values.
  scheduled_admin_actions = {
    retention = {
      description = "Delete data past its retention period"
      # 03:30 UTC, when nobody is using the service.
      schedule = "30 3 * * *"
      env = {
        ADMIN_ACTION    = "apply-retention"
        RETENTION_APPLY = "true"
      }
    }
    teaching-reminders = {
      description = "Send enrolment reminders and renewal notices"
      # 07:00 UTC: the start of the working day in the UK, summer or
      # winter.
      schedule = "0 7 * * *"
      env = {
        ADMIN_ACTION    = "send-teaching-reminders"
        REMINDERS_APPLY = "true"
      }
    }
  }
}

# Terraform enables no other API in this project: the rest were switched on
# by hand when it was set up. This one is here because nothing used Cloud
# Scheduler before, so there is no earlier hand to rely on.
resource "google_project_service" "cloud_scheduler" {
  project = var.project_id
  service = "cloudscheduler.googleapis.com"

  # Removing this file should not switch the API off under anything else
  # that has come to use it.
  disable_on_destroy = false
}

# The scheduler's own identity. It may start the admin job and do nothing
# else. The workflows this replaces signed in as the deploy service
# account, which can do a great deal more than start one job.
resource "google_service_account" "scheduler" {
  project      = var.project_id
  account_id   = "scheduler-admin-job"
  display_name = "Cloud Scheduler: runs the admin job"
  description  = "Starts the scheduled actions on the admin Cloud Run job. Holds only the right to run that job; see infra/scheduled-jobs.tf."
}

# `jobsExecutorWithOverrides`, not `invoker`: the action is named by an
# override on the execution, and running with overrides is a separate
# permission. See the same role, and how it was found, in
# runtime-identities.tf.
resource "google_cloud_run_v2_job_iam_member" "scheduler_runs_admin_job" {
  project  = var.project_id
  location = var.region
  name     = module.cloud_run_admin_job.job_name
  role     = "roles/run.jobsExecutorWithOverrides"
  member   = "serviceAccount:${google_service_account.scheduler.email}"
}

resource "google_cloud_scheduler_job" "admin_action" {
  for_each = local.scheduled_admin_actions

  project     = var.project_id
  region      = var.region
  name        = "quill-${each.key}-${var.environment}"
  description = each.value.description
  schedule    = each.value.schedule
  time_zone   = "Etc/UTC"

  # Long enough for the call that starts the execution to answer. It
  # returns once the execution is created, not when it finishes.
  attempt_deadline = "180s"

  # Never tried again the same day. Both actions are safe to run twice,
  # but a start that failed is better seen than papered over, and the
  # next day's run picks up whatever this one left.
  retry_config {
    retry_count = 0
  }

  http_target {
    http_method = "POST"
    uri         = "https://run.googleapis.com/v2/projects/${var.project_id}/locations/${var.region}/jobs/${module.cloud_run_admin_job.job_name}:run"

    headers = {
      "Content-Type" = "application/json"
    }

    body = base64encode(jsonencode({
      overrides = {
        containerOverrides = [
          {
            env = [
              for name, value in each.value.env : { name = name, value = value }
            ]
          }
        ]
      }
    }))

    oauth_token {
      service_account_email = google_service_account.scheduler.email
      scope                 = "https://www.googleapis.com/auth/cloud-platform"
    }
  }

  depends_on = [
    google_project_service.cloud_scheduler,
    google_cloud_run_v2_job_iam_member.scheduler_runs_admin_job,
  ]
}
