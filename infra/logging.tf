# logging.tf - where the project's logs are kept
#
# The privacy policy says everything Google holds for Quill Medical is in
# its London region. Cloud Logging did not keep that promise on its own:
# every project starts with a `_Default` log bucket in `global`, and on
# 20 October 2026 App production's request logs, with visitors' IP
# addresses, and the browser error reports were all there. A bucket's
# location cannot be changed, so the logs go to a bucket of our own in
# London instead, and Google's `_Default` sink is pointed at it.
#
# The `_Default` bucket is left as it is and empties itself: nothing new
# arrives, and what is there is gone within its 30 days. The `_Required`
# bucket stays `global`, because Google allows nothing else. It holds
# only the audit trail of changes to the infrastructure, not anything
# about the people using the app.
#
# Three things read these logs and were checked after the move: Error
# Reporting (which reads a regional bucket fed by a sink in the same
# project), the log-match alert policies in modules/monitoring, and the
# `gcloud logging read` calls in the Justfile, which name this bucket.
# The analytics sink in modules/analytics is a route of its own, to
# BigQuery in London, and does not pass through here.

resource "google_logging_project_bucket_config" "logs" {
  project   = var.project_id
  location  = var.region
  bucket_id = "quill-logs"

  # The same 30 days the `_Default` bucket kept, and the period section 7
  # of the privacy policy gives for server logs and error reports.
  retention_days = 30

  description = "Every log entry except the infrastructure audit trail, kept in London for 30 days."
}

# Google makes the `_Default` sink with every project. Importing adopts it,
# so the only change Terraform makes is its destination.
import {
  to = google_logging_project_sink.default
  id = "projects/${var.project_id}/sinks/_Default"
}

resource "google_logging_project_sink" "default" {
  project = var.project_id
  name    = "_Default"

  destination = "logging.googleapis.com/projects/${var.project_id}/locations/${var.region}/buckets/${google_logging_project_bucket_config.logs.bucket_id}"

  # Google's own filter, unchanged: everything except the six audit logs
  # the `_Required` sink takes.
  filter = join(" AND ", [
    for id in [
      "cloudaudit.googleapis.com/activity",
      "externalaudit.googleapis.com/activity",
      "cloudaudit.googleapis.com/system_event",
      "externalaudit.googleapis.com/system_event",
      "cloudaudit.googleapis.com/access_transparency",
      "externalaudit.googleapis.com/access_transparency",
    ] : "NOT LOG_ID(\"${id}\")"
  ])

  # The destination is a log bucket in this project, which needs no
  # writer identity of its own, and the sink has never had one.
  unique_writer_identity = false

  lifecycle {
    # Removing this resource would delete Google's default route, and
    # every log entry after that would be dropped.
    prevent_destroy = true
  }
}
