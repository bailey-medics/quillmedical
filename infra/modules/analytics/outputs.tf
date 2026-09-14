# modules/analytics/outputs.tf

output "dataset_id" {
  description = "BigQuery dataset holding the raw analytics archive"
  value       = google_bigquery_dataset.analytics.dataset_id
}

output "public_site_visits_metric" {
  description = "Name of the log-based metric counting public site visits"
  value       = google_logging_metric.public_site_visits.name
}

output "client_errors_metric" {
  description = "Name of the log-based metric counting browser error reports, so the monitoring module can alert on the same counter the dashboard charts"
  value       = google_logging_metric.client_errors.name
}

output "video_not_found_metric" {
  description = "Name of the log-based metric counting 404s for video files, so the monitoring module can alert on rendition drift"
  value       = google_logging_metric.video_not_found.name

  # Held back until Monitoring knows the descriptor. Without this the alert
  # policy consuming it is created in the same apply as the metric and is
  # refused, because Logging and Monitoring learn of a new metric separately.
  # See the resource's comment in main.tf.
  depends_on = [time_sleep.wait_for_video_not_found_metric]
}
