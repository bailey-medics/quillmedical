# modules/teaching-video-spike/outputs.tf
#
# The probes need these. Exposing them as outputs means they can be read with
# `terraform output` rather than by digging through state by hand.

output "bucket_name" {
  description = "Name of the private spike bucket"
  value       = google_storage_bucket.spike.name
}

output "backend_bucket_id" {
  description = "Backend bucket ID, for the URL map path rule"
  value       = google_compute_backend_bucket.spike.id

  # The URL map cannot reference the backend bucket until it is ready, so the
  # consumer waits by consuming this output rather than the resource directly.
  depends_on = [time_sleep.wait_for_backend_bucket]
}

output "signing_key_name" {
  description = "Signed-URL key name, needed to build a Cloud-CDN-Cookie"
  value       = google_compute_backend_bucket_signed_url_key.spike.name
}

output "signing_key_value" {
  description = "Signed-URL key material, needed to sign a probe cookie"
  value       = local.signing_key_base64url
  sensitive   = true
}
