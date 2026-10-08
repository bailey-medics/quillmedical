# modules/guide-assets/main.tf - screenshots for the in-app guides
#
# The guides at /guides show screenshots that Playwright retakes from seeded
# data after each merge. They are not in the repository, because a set retaken
# on every merge would grow it without limit, so they live here. See
# docs/docs/plans/2026-10-05-in-app-guides-plan.md.
#
# Two buckets, because the guides have two kinds of reader:
#
# - A guide marked public, such as how to join a course, is read by somebody
#   with no account. Its pictures are in the public bucket, which the load
#   balancer serves at /guide-assets/* on the application's own host.
# - Every other guide is read signed in, and its pictures show what the
#   screens of an admin or an operator look like. Those are in the private
#   bucket, which nothing serves: the backend reads them and hands them out
#   at /api/guides/assets/* to somebody with a session.
#
# Every picture in either is of data backend/scripts/seed_guides.py made up,
# so what the private bucket keeps from the public is the look of the screens
# and not anybody's data.

# ---------- The public bucket ----------
# Not versioned and free to destroy: every object in it is remade by the next
# run of the screenshot workflow, so there is nothing here to protect.
resource "google_storage_bucket" "guide_assets" {
  project  = var.project_id
  name     = "${var.project_id}-guide-assets"
  location = var.region

  uniform_bucket_level_access = true
  force_destroy               = true
}

# Public, unlike the teaching video beside it, which is private and signed.
# A public guide is read by somebody with no account, so there is no session
# to sign a cookie for. Only the pictures of guides marked public are
# uploaded here: the screenshot workflow sorts them, and a guide's pictures
# become public by its entry in frontend/src/guides/registry.ts saying so.
resource "google_storage_bucket_iam_member" "public" {
  bucket = google_storage_bucket.guide_assets.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# The screenshot workflow writes, and removes what a guide no longer shows.
# Granted on these two buckets alone, to the account GitHub Actions already
# deploys as, named as infra/runtime-identities.tf names it.
resource "google_storage_bucket_iam_member" "ci_writer" {
  bucket = google_storage_bucket.guide_assets.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:github-actions@${var.project_id}.iam.gserviceaccount.com"
}

# ---------- The private bucket ----------
# The pictures of every guide that is read signed in. No public grant and no
# backend bucket: `public_access_prevention` refuses one even if somebody adds
# it later, so these cannot become public by a slip in this file.
resource "google_storage_bucket" "guide_assets_private" {
  project  = var.project_id
  name     = "${var.project_id}-guide-assets-private"
  location = var.region

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = true
}

resource "google_storage_bucket_iam_member" "ci_writer_private" {
  bucket = google_storage_bucket.guide_assets_private.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:github-actions@${var.project_id}.iam.gserviceaccount.com"
}

# The backend reads, to serve a picture to somebody signed in. Read only: it
# never writes one.
resource "google_storage_bucket_iam_member" "backend_reader_private" {
  bucket = google_storage_bucket.guide_assets_private.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${var.backend_service_account_email}"
}

# ---------- Backend bucket with CDN ----------
resource "google_compute_backend_bucket" "guide_assets" {
  project     = var.project_id
  name        = "quill-guide-assets-${var.environment}"
  bucket_name = google_storage_bucket.guide_assets.name
  enable_cdn  = true

  # Five minutes, where the video beside it is cached for a day. A screenshot
  # keeps its name when it is retaken, so whatever is cached is the old
  # picture: this is how long a guide may show a screen that has just changed.
  cdn_policy {
    cache_mode  = "CACHE_ALL_STATIC"
    default_ttl = 300
    client_ttl  = 300
    max_ttl     = 300
  }

  # Security headers, set here for the reason they are on the video and
  # landing backend buckets: these responses come straight from the bucket
  # and never pass through Caddy. Images load nothing, so there is no
  # Content-Security-Policy; nothing frames one, so `DENY` is safe.
  # Strict-Transport-Security is the value Caddy already sends for this
  # hostname, so it makes no new promise.
  custom_response_headers = [
    "Strict-Transport-Security: max-age=63072000; includeSubDomains",
    "X-Content-Type-Options: nosniff",
    "Referrer-Policy: strict-origin-when-cross-origin",
    "X-Frame-Options: DENY",
  ]
}

# A backend bucket is not immediately referenceable by a URL map: the video
# pipeline hit `resourceNotReady` doing exactly that. The URL map consumes
# the output rather than the resource, so this sits between them.
resource "time_sleep" "wait_for_backend_bucket" {
  depends_on      = [google_compute_backend_bucket.guide_assets]
  create_duration = "60s"
}
