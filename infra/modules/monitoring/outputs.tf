# modules/monitoring/outputs.tf

output "uptime_check_ids" {
  description = "Map of hostname to uptime check ID"
  value       = { for k, v in google_monitoring_uptime_check_config.health : k => v.uptime_check_id }
}
