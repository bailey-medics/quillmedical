# modules/teaching-video-spike/main.tf — Phase 0 spike, temporary by design
#
# Proves one thing before Phase 1 is written around it: that Cloud CDN can
# serve a *private* bucket through our existing load balancer, via the Cloud
# CDN fill service account. A backend bucket historically required a public
# bucket, which would defeat the point of an auth gate entirely.
#
# Everything here is meant to be reverted once the probes have been run and
# their outcome recorded in the plan. It exists as Terraform rather than as
# hand-made resources so that both its creation and its removal pass through
# the pull-request gate, and so tear-down is an apply rather than a promise.
#
# See docs/docs/plans/2026-08-31-gcp-video-auth-gate-plan.md, Phase 0.

# ---------- Private bucket ----------
# The opposite of the landing bucket, which is granted `allUsers` read. Public
# access prevention is enforced, so the only way to this object is through the
# load balancer.
resource "google_storage_bucket" "spike" {
  project  = var.project_id
  name     = "quill-video-spike-${var.environment}"
  location = var.region

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  # The whole module is temporary, so removal has to actually work.
  force_destroy = true
}

# ---------- The grant this spike exists to test ----------
# If Cloud CDN cannot read the bucket with this, the design in the plan does
# not work and the fallback is a Cloud Run range-proxy.
resource "google_storage_bucket_iam_member" "cdn_fill" {
  bucket = google_storage_bucket.spike.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:service-${var.project_number}@cloud-cdn-fill.iam.gserviceaccount.com"
}

# ---------- Backend bucket with CDN ----------
resource "google_compute_backend_bucket" "spike" {
  project     = var.project_id
  name        = "quill-video-spike-${var.environment}"
  bucket_name = google_storage_bucket.spike.name
  enable_cdn  = true

  cdn_policy {
    cache_mode  = "CACHE_ALL_STATIC"
    default_ttl = 86400
  }
}

# ---------- Signed-URL key ----------
# Attaching a key is what makes the edge reject unsigned requests, which is the
# second half of the probe: unsigned 403, correctly signed 200.
resource "random_bytes" "signing_key" {
  length = 16
}

locals {
  signing_key_base64url = replace(
    replace(trimsuffix(random_bytes.signing_key.base64, "=="), "+", "-"),
    "/", "_"
  )
}

resource "google_compute_backend_bucket_signed_url_key" "spike" {
  project        = var.project_id
  name           = "quill-video-spike-key"
  backend_bucket = google_compute_backend_bucket.spike.name

  # Cloud CDN wants base64url. `random_bytes` only exposes standard base64, so
  # translate the two differing characters and strip the padding.
  key_value = local.signing_key_base64url

  lifecycle {
    # The key value is the whole secret; replacing it silently would invalidate
    # every cookie minted against it.
    create_before_destroy = true
  }
}
