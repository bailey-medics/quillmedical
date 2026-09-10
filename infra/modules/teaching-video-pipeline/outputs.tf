# modules/teaching-video-pipeline/outputs.tf

output "backend_bucket_id" {
  description = "Backend bucket ID for the URL map's /videos/* path rule"
  value       = google_compute_backend_bucket.videos.id

  # A URL map cannot reference a backend bucket until it is ready, so consumers
  # wait by consuming this output rather than the resource directly.
  depends_on = [time_sleep.wait_for_backend_bucket]
}

output "source_bucket_name" {
  description = "Raw upload bucket, written by the backend"
  value       = google_storage_bucket.source.name
}

output "processed_bucket_name" {
  description = "Rendition bucket, served through the CDN"
  value       = google_storage_bucket.processed.name
}

output "signing_key_name" {
  description = "Signed-URL key name, which the backend puts in the KeyName field of each cookie"
  value       = google_compute_backend_bucket_signed_url_key.videos.name
}
