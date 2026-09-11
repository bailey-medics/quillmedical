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
