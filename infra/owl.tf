# owl.tf - the read-only identity Owl, the alert watcher, reads logs as
#
# Owl on the dev box (scripts/owl/) is told
# only which policy fired. To say why, its /alert skill reads the logs over
# the window with `gcloud logging read`, as this account.
#
# Read-only, and only logs. The databases are never queried, and the rule
# that no log line carries PHI stays the boundary. Mark's own login was
# rejected for this because it would give the watcher everything his
# account can do.
#
# The account has no key. The organisation enforces
# iam.disableServiceAccountKeyCreation, which refuses `keys create`, and a
# key file on a home machine is what that rule exists to stop. The box
# authenticates with a client certificate instead, through the workload
# identity pool below.
resource "google_service_account" "owl_watcher_logs" {
  project      = var.project_id
  account_id   = "owl-logs"
  display_name = "Owl: reads logs"
  description  = "Read by Owl, the alert watcher on the dev box, to find out why an alert fired. May read logs and nothing else; see infra/owl.tf."
}

# Its two grants were made by hand, as Mark, not here. They are:
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

# ---------- How the box signs in: a certificate, not a key ----------
# Workload identity federation with an X.509 certificate. The box holds a
# client certificate and private key under ~/.config/quill-owl/pki/,
# signed by a private certificate authority made on the box with openssl.
# The authority's public certificate is checked in beside the environment's
# tfvars and registered here as the pool's one trust anchor, so a certificate
# it signed, and nothing else, can be swapped at Google's token service for a
# short-lived token that acts as owl-logs.
#
# No long-lived secret leaves the box, and nothing expires daily: the client
# certificate is valid for a year (Google stops accepting one after 390
# days), so renewing it is a yearly openssl command, with no change here.
#
# Only in an environment whose folder holds the authority's certificate.
#
# The pool, its provider, the account and the grant below were all made by
# hand, as Mark, and are imported. CI's apply account, github-actions, may
# not create or change a pool or provider: it holds
# roles/iam.workloadIdentityPoolViewer, which reads them and changes
# nothing. roles/iam.workloadIdentityPoolAdmin was rejected for it, because
# that role lets its holder create new ways to sign in to the project. So a
# change to either, the trust anchor above all, is made by hand with
# `gcloud iam workload-identity-pools` and then written here to match, or
# the next apply fails. Renewing the client certificate touches neither.
#
# Google refuses an authority without key usage extensions, with
# "Certificate is not in PEM format". It wants keyUsage=keyCertSign and
# extendedKeyUsage=clientAuth on the authority, and digitalSignature on the
# client certificate.
locals {
  owl_ca_path = "${path.module}/environments/${var.environment}/owl-ca.pem"
  owl_subject = "quill-owl"
}

resource "google_iam_workload_identity_pool" "owl_watcher" {
  count = fileexists(local.owl_ca_path) ? 1 : 0

  project                   = var.project_id
  workload_identity_pool_id = "owl-watcher"
  display_name              = "Owl on the dev box"
  description               = "Owl reads App production's logs as owl-logs, signing in with a client certificate. See infra/owl.tf."
}

# google.subject is the certificate's common name, and the condition admits
# that one name only, so a second certificate from the same authority with
# another name gets nothing until it is named here too.
resource "google_iam_workload_identity_pool_provider" "owl_watcher_x509" {
  count = length(google_iam_workload_identity_pool.owl_watcher)

  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.owl_watcher[0].workload_identity_pool_id
  workload_identity_pool_provider_id = "dev-box-certificate"
  display_name                       = "Dev box client certificate"

  attribute_mapping = {
    "google.subject" = "assertion.subject.dn.cn"
  }
  attribute_condition = "assertion.subject.dn.cn == \"${local.owl_subject}\""

  x509 {
    trust_store {
      trust_anchors {
        # Trimmed, because the provider was made from the certificate
        # without its final newline, and any difference here is an update
        # CI may not make.
        pem_certificate = trimspace(file(local.owl_ca_path))
      }
    }
  }
}

# The certificate's identity may act as the log reader. This is a grant on
# the service account, not on the project.
resource "google_service_account_iam_member" "owl_watcher_certificate_acts_as_log_reader" {
  count = length(google_iam_workload_identity_pool.owl_watcher)

  service_account_id = google_service_account.owl_watcher_logs.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principal://iam.googleapis.com/projects/${data.google_project.project.number}/locations/global/workloadIdentityPools/${google_iam_workload_identity_pool.owl_watcher[0].workload_identity_pool_id}/subject/${local.owl_subject}"
}

import {
  to = google_service_account.owl_watcher_logs
  id = "projects/${var.project_id}/serviceAccounts/owl-logs@${var.project_id}.iam.gserviceaccount.com"
}

import {
  for_each = fileexists(local.owl_ca_path) ? toset(["owl-watcher"]) : toset([])

  to = google_iam_workload_identity_pool.owl_watcher[0]
  id = "projects/${var.project_id}/locations/global/workloadIdentityPools/${each.key}"
}

import {
  for_each = fileexists(local.owl_ca_path) ? toset(["owl-watcher"]) : toset([])

  to = google_iam_workload_identity_pool_provider.owl_watcher_x509[0]
  id = "projects/${var.project_id}/locations/global/workloadIdentityPools/${each.key}/providers/dev-box-certificate"
}

import {
  for_each = fileexists(local.owl_ca_path) ? toset(["owl-watcher"]) : toset([])

  to = google_service_account_iam_member.owl_watcher_certificate_acts_as_log_reader[0]
  id = "projects/${var.project_id}/serviceAccounts/owl-logs@${var.project_id}.iam.gserviceaccount.com roles/iam.workloadIdentityUser principal://iam.googleapis.com/projects/${data.google_project.project.number}/locations/global/workloadIdentityPools/${each.key}/subject/${local.owl_subject}"
}

# ---------- The set this replaced ----------
# Owl first signed in through pool alert-watcher, provider
# home-box-certificate, account alert-watcher-logs and a certificate named
# quill-alert-watcher, all named before the alert watcher became Owl.
# Google Cloud fixes those IDs, so they were replaced rather than renamed.
# These blocks drop them from Terraform's state without destroying
# anything: CI may not delete a pool or provider, and the old set is
# deleted by hand once this is applied.
removed {
  from = google_service_account.owl_logs

  lifecycle {
    destroy = false
  }
}

removed {
  from = google_iam_workload_identity_pool.owl

  lifecycle {
    destroy = false
  }
}

removed {
  from = google_iam_workload_identity_pool_provider.owl_x509

  lifecycle {
    destroy = false
  }
}

removed {
  from = google_service_account_iam_member.owl_certificate_acts_as_log_reader

  lifecycle {
    destroy = false
  }
}
