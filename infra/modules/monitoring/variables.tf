# modules/monitoring/variables.tf

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "environment" {
  description = "Environment name (prod, staging, teaching)"
  type        = string
}

variable "monitored_hostnames" {
  description = "List of hostnames to create uptime checks for"
  type        = list(string)
}

variable "alert_email" {
  description = "Email address for uptime failure alerts"
  type        = string
}

variable "slack_webhook_url" {
  description = "Slack incoming webhook URL for alert notifications (optional)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "cloud_run_services" {
  description = "Cloud Run service names to monitor for startup failures"
  type        = list(string)
  default     = []
}
