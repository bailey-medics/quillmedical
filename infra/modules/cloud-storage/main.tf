# modules/cloud-storage/main.tf — GCS bucket (teaching images)

resource "google_storage_bucket" "bucket" {
  project  = var.project_id
  name     = "quill-${var.bucket_suffix}-${var.environment}"
  location = var.region

  # Prevent accidental deletion
  force_destroy = var.environment != "prod"

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  # Clean up superseded versions after a year.
  #
  # `with_state` is the load-bearing part, and its absence was a bug. The
  # condition defaults to ANY, which matches the live object as well as the
  # noncurrent ones this rule is meant to clear. On a versioned bucket a
  # Delete against a live object does not erase it — the bytes become a
  # noncurrent version, as they would on any overwrite — but the live object
  # is gone, so the application reads the file as missing. A question's image
  # would 404 while its bytes sat in the bucket, recoverable only by hand.
  #
  # Nothing has been lost to it: the oldest objects here date from May 2026,
  # so the first would have been affected around May 2027, and only those CI
  # had not re-uploaded since — an upload resets the age, so actively
  # maintained content kept saving itself. The stale corners were the ones at
  # risk, which is exactly where nobody would have noticed quickly.
  #
  # ARCHIVED matches only versions that are already superseded, which is what
  # the original comment claimed this rule did.
  lifecycle_rule {
    condition {
      age        = 365
      with_state = "ARCHIVED"
    }
    action {
      type = "Delete"
    }
  }
}

# ---------- Who may read and write this bucket ----------
#
# Both of these existed only as manual grants until 2026-09-22, and their
# absence on a new project is how an hour was lost. `modules/teaching-video-pipeline`
# grants its own bindings and worked first time; this module created the
# bucket and granted nothing, so the same content pipeline that worked in
# one project failed in the next.
#
# The backend reads, through `run-backend`'s grant in
# infra/runtime-identities.tf. Without it the failure is silent rather than
# loud: `list_banks_in_gcs` lists a bucket it may not see, gets nothing back,
# and the sync returns `200 {"synced": [], "message": "No banks found"}`,
# which is indistinguishable from an empty bucket.
#
# The content pipeline writes. This one fails loudly, a 403 on
# `storage.objects.list` while `rsync` runs, so it is the easier of the two
# to diagnose.
resource "google_storage_bucket_iam_member" "ci_writer" {
  count  = var.ci_service_account != "" ? 1 : 0
  bucket = google_storage_bucket.bucket.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${var.ci_service_account}"
}
