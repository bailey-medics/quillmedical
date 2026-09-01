# modules/analytics/outputs.tf

output "dataset_id" {
  description = "BigQuery dataset holding the raw analytics archive"
  value       = google_bigquery_dataset.analytics.dataset_id
}

output "public_site_visits_metric" {
  description = "Name of the log-based metric counting public site visits"
  value       = google_logging_metric.public_site_visits.name
}
