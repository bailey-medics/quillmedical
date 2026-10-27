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
# The account has no key. The organisation enforces
# iam.disableServiceAccountKeyCreation, found on 2026-10-27 when
# `keys create` was refused, and a key file on a home machine is what that
# rule exists to stop. The box authenticates with a client certificate
# instead, through the workload identity pool below.
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

# ---------- How the box signs in: a certificate, not a key ----------
# Workload identity federation with an X.509 certificate. The box holds a
# client certificate and private key under ~/.config/quill-alert-watcher/pki/,
# signed by a private certificate authority made on the box with openssl.
# The authority's public certificate is checked in beside the environment's
# tfvars and registered here as the pool's one trust anchor, so a certificate
# it signed, and nothing else, can be swapped at Google's token service for a
# short-lived token that acts as alert-watcher-logs.
#
# No long-lived secret leaves the box, and nothing expires daily: the client
# certificate is valid for a year (Google stops accepting one after 390
# days), so renewing it is a yearly openssl command, with no change here.
#
# Only in an environment whose folder holds the authority's certificate.
locals {
  alert_watcher_ca_path = "${path.module}/environments/${var.environment}/alert-watcher-ca.pem"
  alert_watcher_subject = "quill-alert-watcher"
}

resource "google_iam_workload_identity_pool" "alert_watcher" {
  count = fileexists(local.alert_watcher_ca_path) ? 1 : 0

  project                   = var.project_id
  workload_identity_pool_id = "alert-watcher"
  display_name              = "Alert watcher on the home box"
  description               = "The home box reads App production's logs as alert-watcher-logs, authenticating with a client certificate. See infra/alert-watcher.tf."
}

# google.subject is the certificate's common name, and the condition admits
# that one name only, so a second certificate from the same authority with
# another name gets nothing until it is named here too.
resource "google_iam_workload_identity_pool_provider" "alert_watcher_x509" {
  count = length(google_iam_workload_identity_pool.alert_watcher)

  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.alert_watcher[0].workload_identity_pool_id
  workload_identity_pool_provider_id = "home-box-certificate"
  display_name                       = "Home box client certificate"

  attribute_mapping = {
    "google.subject" = "assertion.subject.dn.cn"
  }
  attribute_condition = "assertion.subject.dn.cn == \"${local.alert_watcher_subject}\""

  x509 {
    trust_store {
      trust_anchors {
        pem_certificate = file(local.alert_watcher_ca_path)
      }
    }
  }
}

# The certificate's identity may act as the log reader. This is a grant on
# the service account, not on the project, which the Terraform account's
# roles/editor may set; the two project and bucket grants above stay by hand.
resource "google_service_account_iam_member" "alert_watcher_certificate_acts_as_log_reader" {
  count = length(google_iam_workload_identity_pool.alert_watcher)

  service_account_id = google_service_account.alert_watcher_logs.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principal://iam.googleapis.com/projects/${data.google_project.project.number}/locations/global/workloadIdentityPools/${google_iam_workload_identity_pool.alert_watcher[0].workload_identity_pool_id}/subject/${local.alert_watcher_subject}"
}
