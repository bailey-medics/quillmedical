# modules/passport-storage/outputs.tf

output "bucket_name" {
  description = "Passport bucket, set as PASSPORT_GCS_BUCKET on the backend"
  value       = google_storage_bucket.passports.name
}

output "archive_bucket_name" {
  description = "Where deleted test passports are kept for 30 days, set as PASSPORT_ARCHIVE_GCS_BUCKET on the admin job"
  value       = google_storage_bucket.archive.name
}
