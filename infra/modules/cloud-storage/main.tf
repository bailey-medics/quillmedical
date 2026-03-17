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

  lifecycle_rule {
    condition {
      age = 365 # Clean up old versions after 1 year
    }
    action {
      type = "Delete"
    }
  }
}
