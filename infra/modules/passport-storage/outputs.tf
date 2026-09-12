# modules/passport-storage/outputs.tf

output "bucket_name" {
  description = "Passport bucket, set as PASSPORT_GCS_BUCKET on the backend"
  value       = google_storage_bucket.passports.name
}
