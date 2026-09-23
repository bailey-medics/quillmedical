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
#   3. Remove the default account's grants, once 2 has run live.
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
# WebVTT file beside it.
resource "google_storage_bucket_iam_member" "runtime_video_processed" {
  for_each = local.is_teaching_product ? toset(["transcode", "caption"]) : toset([])

  bucket = module.teaching_video_pipeline[0].processed_bucket_name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.runtime[each.key].email}"
}

# ---------- The backend starts the transcode and caption jobs ----------
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
