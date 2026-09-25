# runtime-identities.tf — one service account per Cloud Run workload
#
# Every service and job used to run as the default Compute Engine account,
# which held roles/secretmanager.secretAccessor on the whole project. So the
# frontend, which serves static files and reads no secret, could read the
# Cloud SQL password and the JWT signing key. This file gives each workload
# its own identity and grants it only what that workload uses.
#
# Built expand-then-contract, because switching the identity a live service
# runs as breaks it on apply if any permission is missed:
#
#   1. This file: create the accounts and their grants. Nothing runs as them
#      yet, so it changes nothing that serves traffic.
#   2. Point each workload at its account. The default account keeps its old
#      grants meanwhile, as a safety net.
#   3. Remove the default account's grants, once 2 has run live. Done on
#      2026-09-24, after the bank sync and a video upload were proven on the
#      new accounts.
#
# Batch 9, Phase 6 of
# docs/docs/plans/2026-09-18-environment-isolation-and-iap-plan.md.

locals {
  # Each workload's secrets, as environment variable => secret name. Defined
  # once here and read both by the module that mounts them and by the grants
  # below, so a secret added to a workload cannot be forgotten in its grants.
  backend_secret_env_vars = merge(
    {
      JWT_SECRET       = "jwt-secret"
      CORE_DB_PASSWORD = "core-db-password"
      VAPID_PRIVATE    = "vapid-private"
      RESEND_API_KEY   = "resend-api-key"
    },
    var.enable_fhir ? {
      FHIR_DB_PASSWORD           = "fhir-db-password"
      EHRBASE_DB_PASSWORD        = "ehrbase-db-password"
      EHRBASE_API_PASSWORD       = "ehrbase-api-password"
      EHRBASE_API_ADMIN_PASSWORD = "ehrbase-admin-password"
    } : {},
    local.is_teaching_product ? {
      TEACHING_SYNC_TOKEN        = "teaching-sync-token"
      TEACHING_VIDEO_SIGNING_KEY = "teaching-video-signing-key"
      # The other end of the transcode job's completion report. Same
      # secret on both sides — the job presents it, this verifies it.
      TEACHING_TRANSCODE_CALLBACK_TOKEN = "teaching-transcode-callback-token"
    } : {}
  )

  admin_secret_env_vars = {
    CORE_DB_PASSWORD = "core-db-password"
    JWT_SECRET       = "jwt-secret"
  }

  transcode_secret_env_vars = {
    TRANSCODE_CALLBACK_TOKEN = "teaching-transcode-callback-token"
  }

  caption_secret_env_vars = {
    CAPTION_CALLBACK_TOKEN = "teaching-transcode-callback-token"
  }

  # Workload => the secrets it reads. The frontend reads none, which is the
  # point of this file.
  runtime_workload_secrets = merge(
    {
      backend  = values(local.backend_secret_env_vars)
      frontend = []
      admin    = values(local.admin_secret_env_vars)
    },
    local.is_teaching_product ? {
      transcode = values(local.transcode_secret_env_vars)
      caption   = values(local.caption_secret_env_vars)
    } : {}
  )

  # One entry per (workload, secret), keyed so a plan names both.
  runtime_secret_access = merge([
    for workload, secrets in local.runtime_workload_secrets : {
      for secret in distinct(secrets) : "${workload}/${secret}" => {
        workload = workload
        secret   = secret
      }
    }
  ]...)
}

resource "google_service_account" "runtime" {
  for_each = local.runtime_workload_secrets

  project      = var.project_id
  account_id   = "run-${each.key}"
  display_name = "Cloud Run runtime: ${each.key}"
  description  = "The identity the ${each.key} workload runs as. Holds only what ${each.key} uses; see infra/runtime-identities.tf."
}

# ---------- Secrets, per secret rather than project-wide ----------
resource "google_secret_manager_secret_iam_member" "runtime" {
  for_each = local.runtime_secret_access

  project = var.project_id
  # Read through the module's output rather than written as a literal, so a
  # secret the module does not create fails the plan instead of the apply.
  secret_id = module.secrets.secret_ids[each.value.secret]
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime[each.value.workload].email}"
}

# ---------- The CI account's one secret ----------
# The yearly accessibility statement reminder
# (.github/workflows/accessibility-review.yml) emails through Resend, as the
# app does. It reads the key here at run time rather than GitHub holding a
# second copy, so the grant is this one secret and not Secret Manager at large.
resource "google_secret_manager_secret_iam_member" "ci_resend" {
  project   = var.project_id
  secret_id = module.secrets.secret_ids["resend-api-key"]
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:github-actions@${var.project_id}.iam.gserviceaccount.com"
}

# ---------- Buckets ----------
# The backend reads published question banks. Silent when missing: an
# unreadable bucket lists as empty, so the sync reports "No banks found".
resource "google_storage_bucket_iam_member" "runtime_backend_images" {
  count = local.is_teaching_product ? 1 : 0

  bucket = module.cloud_storage[0].bucket_name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.runtime["backend"].email}"
}

resource "google_storage_bucket_iam_member" "runtime_backend_passports" {
  bucket = module.passport_storage.bucket_name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.runtime["backend"].email}"
}

# The backend writes uploaded lecture masters; the transcode job reads them.
resource "google_storage_bucket_iam_member" "runtime_backend_video_source" {
  count = local.is_teaching_product ? 1 : 0

  bucket = module.teaching_video_pipeline[0].source_bucket_name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.runtime["backend"].email}"
}

resource "google_storage_bucket_iam_member" "runtime_transcode_video_source" {
  count = local.is_teaching_product ? 1 : 0

  bucket = module.teaching_video_pipeline[0].source_bucket_name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.runtime["transcode"].email}"
}

# Transcode writes the renditions; caption reads the 720p one and writes the
# WebVTT file beside it; the backend reads and saves that WebVTT file when an
# admin reviews captions (read_caption_object and write_caption_object in
# backend/app/features/teaching/storage.py). The backend was missed from the
# first inventory and found on 2026-09-24 as a 403 reading a .vtt file.
resource "google_storage_bucket_iam_member" "runtime_video_processed" {
  for_each = local.is_teaching_product ? toset(["backend", "transcode", "caption"]) : toset([])

  bucket = module.teaching_video_pipeline[0].processed_bucket_name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.runtime[each.key].email}"
}

# ---------- The backend signs its own URLs ----------
# `backend/app/features/teaching/storage.py` issues V4 signed URLs for the
# teaching images and uploads. Cloud Run has no private key to sign with, so
# the storage library calls the IAM signBytes API as the service's own
# account, which needs roles/iam.serviceAccountTokenCreator on itself.
#
# Missed from the first inventory, and found on 2026-09-24 when /teaching
# returned 500 with "Error calling the IAM signBytes API" straight after the
# switch. The default account had held the same grant on itself.
resource "google_service_account_iam_member" "runtime_backend_signs_as_itself" {
  service_account_id = google_service_account.runtime["backend"].name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.runtime["backend"].email}"
}

# ---------- The backend starts the transcode and caption jobs ----------
# Scoped to these two jobs rather than granted project-wide: the admin job
# runs migrations and is CI's to invoke, not the serving application's.
# Without the grant, `start_transcode` raises inside its own try/except,
# logs, and returns None, so the upload succeeds and the module stays hidden
# with nothing to say why.
#
# **`jobsExecutorWithOverrides`, not `invoker`.** Starting a job as
# configured is `run.jobs.run`, which `roles/run.invoker` confers.
# Starting one with container overrides — which is how the three ids
# reach the job, and the only way they can, since each execution needs
# different ones — is `run.jobs.runWithOverrides`, a separate permission
# that `run.invoker` does not include. Granting the narrower role first
# produced exactly that silent failure, with the
# distinction visible only in the traceback:
#
#   PERMISSION_DENIED: Permission 'run.jobs.runWithOverrides' denied on
#   resource '.../jobs/quill-transcode-teaching'
#
# `roles/run.developer` and `roles/run.admin` also carry it, and both
# carry a great deal else besides. This role is the two permissions and
# nothing more, which is what a serving application should hold.
resource "google_cloud_run_v2_job_iam_member" "runtime_backend_invokes" {
  for_each = local.is_teaching_product ? {
    transcode = module.cloud_run_transcode_job[0].job_name
    caption   = module.cloud_run_caption_job[0].job_name
  } : {}

  project  = var.project_id
  location = var.region
  name     = each.value
  role     = "roles/run.jobsExecutorWithOverrides"
  member   = "serviceAccount:${google_service_account.runtime["backend"].email}"
}
