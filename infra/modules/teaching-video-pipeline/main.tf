# modules/teaching-video-pipeline/main.tf — hosted video for the learning centre
#
# Two buckets and a CDN-backed path on the existing load balancer. The access
# decision stays in FastAPI: it mints a Cloud CDN signed cookie scoped to one
# module's URL prefix, and the edge validates that cookie before any origin
# fetch. Neither bucket is ever public.
#
# See docs/docs/plans/2026-08-31-gcp-video-auth-gate-plan.md, Phase 1. Phase 0
# proved the mechanism this module relies on — that Cloud CDN can serve a
# private bucket through the load balancer via the fill service account.

# ---------- Source bucket: raw uploads ----------
# Written by the backend, which mints resumable upload URLs for the admin UI.
# Nothing reads it but the transcode job, so objects are transient: once
# renditions exist in the processed bucket, the original has no further use.
resource "google_storage_bucket" "source" {
  project  = var.project_id
  name     = "quill-teaching-videos-source-${var.environment}"
  location = var.region

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  # No versioning: a raw upload that is replaced is simply a new upload.
  lifecycle_rule {
    condition {
      age = var.source_retention_days
    }
    action {
      type = "Delete"
    }
  }

  # The browser uploads straight here rather than through Cloud Run, so
  # the request is cross-origin from the app and the browser sends a
  # preflight first. A bucket with no CORS policy refuses that, and the
  # upload fails before a byte is sent — with nothing in our logs, since
  # the request never reaches us.
  #
  # POST begins a resumable upload and PUT sends the chunks to the
  # session URL it returns; both are needed. The exposed header is what
  # carries that session URL back to the browser, and without it the
  # first step succeeds and the second has nowhere to go.
  cors {
    origin          = [var.app_origin]
    method          = ["POST", "PUT", "OPTIONS"]
    response_header = ["Content-Type", "Location", "x-goog-resumable"]
    max_age_seconds = 3600
  }
}

# ---------- Processed bucket: what learners are served ----------
# Renditions, poster frames and WebVTT captions. Versioned, because losing a
# transcode means re-running a job over a source that the lifecycle rule above
# may already have deleted.
resource "google_storage_bucket" "processed" {
  project  = var.project_id
  name     = "quill-teaching-videos-processed-${var.environment}"
  location = var.region

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }
}

# ---------- Cloud CDN reads the processed bucket ----------
# The grant that makes a private-bucket origin work at all. Proven in Phase 0.
resource "google_storage_bucket_iam_member" "cdn_fill" {
  bucket = google_storage_bucket.processed.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:service-${var.project_number}@cloud-cdn-fill.iam.gserviceaccount.com"
}

# ---------- The backend writes uploads to the source bucket ----------
# `objectAdmin` on the source bucket only. It needs no role whatever on the
# processed bucket: signing a CDN cookie is an HMAC over a shared secret, not a
# GCP API call, so the backend never talks to GCS to release a video. That is a
# real reduction in blast radius versus v4 signed URLs, which would need
# `objectViewer` plus `serviceAccountTokenCreator`.
resource "google_storage_bucket_iam_member" "backend_source_writer" {
  bucket = google_storage_bucket.source.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${var.project_number}-compute@developer.gserviceaccount.com"
}

# ---------- Backend bucket with CDN ----------
resource "google_compute_backend_bucket" "videos" {
  project     = var.project_id
  name        = "quill-teaching-videos-${var.environment}"
  bucket_name = google_storage_bucket.processed.name
  enable_cdn  = true

  cdn_policy {
    cache_mode  = "CACHE_ALL_STATIC"
    default_ttl = 86400
  }
}

# A backend bucket is not immediately referenceable by a URL map — Phase 0 hit
# `resourceNotReady` doing exactly that, and Terraform's graph does not model
# the wait. The URL map consumes the output below rather than the resource, so
# this sits between them.
resource "time_sleep" "wait_for_backend_bucket" {
  depends_on      = [google_compute_backend_bucket.videos]
  create_duration = "60s"
}

# ---------- Signing key, shared between the edge and the backend ----------
# One secret, two consumers: the load balancer validates cookies with it, and
# the backend mints them with it. They must be the same bytes, so Terraform
# generates it and writes the version, rather than the usual convention here of
# creating an empty container for a human to fill.
resource "random_bytes" "signing_key" {
  length = 16
}

locals {
  # Cloud CDN wants base64url. `random_bytes` exposes standard base64 only, so
  # translate the two differing characters and drop the padding. 16 bytes
  # always encodes with a `==` suffix.
  signing_key_base64url = replace(
    replace(trimsuffix(random_bytes.signing_key.base64, "=="), "+", "-"),
    "/", "_"
  )
}

resource "google_compute_backend_bucket_signed_url_key" "videos" {
  project        = var.project_id
  name           = "teaching-video-key"
  backend_bucket = google_compute_backend_bucket.videos.name
  key_value      = local.signing_key_base64url

  lifecycle {
    # Replacing this silently would invalidate every cookie already minted.
    create_before_destroy = true
  }
}

resource "google_secret_manager_secret_version" "signing_key" {
  secret      = "projects/${var.project_id}/secrets/teaching-video-signing-key"
  secret_data = local.signing_key_base64url
}
