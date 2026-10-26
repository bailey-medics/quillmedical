# alert-watcher.tf - the read-only identity the alert watcher reads logs as
#
# The alert watcher on the home box (scripts/alert-watcher/, and the watcher
# phase of docs/docs/plans/2026-10-19-remote-dev-machine-plan.md) is told
# only which policy fired. To say why, its /alert skill reads the logs over
# the window with `gcloud logging read`, as this account.
#
# Read-only, and only logs. The databases are never queried, and the rule
# that no log line carries PHI stays the boundary. Mark's own login was
# rejected for this because it would give the watcher everything his
# account can do.
#
# Terraform makes the account, and never its key: a key made
# by Terraform is kept in the state file. The key is made by hand, once,
# and kept on the box at ~/.config/quill-alert-watcher/logs-reader.json.
resource "google_service_account" "alert_watcher_logs" {
  project      = var.project_id
  account_id   = "alert-watcher-logs"
  display_name = "Alert watcher: reads logs"
  description  = "Read by the alert watcher on the home box to find out why an alert fired. May read logs and nothing else; see infra/alert-watcher.tf."
}

# Its two grants are made by hand, not here. The Terraform account holds
# roles/editor, which cannot change an IAM policy, so a grant written here
# would fail at apply and hold up every apply after it. They are:
#
#   - roles/logging.viewer on the project, for the audit trail, which stays
#     in Google's `_Required` bucket (see logging.tf). That role reads
#     `_Required` and `_Default` and nothing else.
#   - roles/logging.viewAccessor on the `_AllLogs` view of the `quill-logs`
#     bucket, for everything else. Google's "Configure log views on a log
#     bucket" says a custom bucket is reached through a view, not by
#     roles/logging.viewer, and `_AllLogs` is the view Logging makes on
#     every bucket. Granted on that one view rather than project-wide,
#     which would reach every view in every bucket.
#
# The commands are in the watcher phase of the plan above.
