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

# ---------- The API that owns the fill service account ----------
# The first apply failed with "Service account
# service-<n>@cloud-cdn-fill.iam.gserviceaccount.com does not exist". That
# account is a Google-managed service agent, brought into existence when the
# service owning it is first enabled, and this project had only
# compute.googleapis.com. Enabling it here keeps the spike self-contained: the
# revert disables it again rather than leaving an API switched on for a
# throwaway.
#
# This is the one `google_project_service` in the repo — APIs are otherwise
# enabled by hand. If the spike graduates into Phase 1, that inconsistency is
# worth settling deliberately rather than inheriting from here.
resource "google_project_service" "network_services" {
  project = var.project_id
  service = "networkservices.googleapis.com"

  # Leave the API enabled if something else comes to depend on it; the revert
  # should not be able to break unrelated infrastructure.
  disable_on_destroy = false
}

# The service agent is created asynchronously after the API is enabled, so the
# grant below cannot run the instant the resource returns.
resource "time_sleep" "wait_for_service_agent" {
  depends_on      = [google_project_service.network_services]
  create_duration = "60s"
}

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

  depends_on = [time_sleep.wait_for_service_agent]
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
# The URL map update failed with "backendBuckets/... is not ready,
# resourceNotReady" even though Terraform reported the backend bucket created
# 30 seconds earlier. A backend bucket takes time to become referenceable and
# Terraform's dependency graph does not model that wait, so make it explicit.
resource "time_sleep" "wait_for_backend_bucket" {
  depends_on      = [google_compute_backend_bucket.spike]
  create_duration = "60s"
}

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
