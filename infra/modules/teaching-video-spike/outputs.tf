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
