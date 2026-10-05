# modules/guide-assets/outputs.tf

output "backend_bucket_id" {
  description = "Backend bucket ID for the URL map's /guide-assets/* path rule"
  value       = google_compute_backend_bucket.guide_assets.id

  # A URL map cannot reference a backend bucket until it is ready, so consumers
  # wait by consuming this output rather than the resource directly.
  depends_on = [time_sleep.wait_for_backend_bucket]
}

output "bucket_name" {
  description = "Public bucket, for the pictures of guides read without an account"
  value       = google_storage_bucket.guide_assets.name
}

output "private_bucket_name" {
  description = "Private bucket, for the pictures of guides read signed in. The backend reads it."
  value       = google_storage_bucket.guide_assets_private.name
}
