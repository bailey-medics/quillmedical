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

variable "server_error_threshold" {
  description = "5xx responses in a 5-minute window before the server error alert fires"
  type        = number
  default     = 5
}

variable "alert_sms_number" {
  description = "E.164 phone number for escalated alerts, e.g. +447700900000. Must be verified by code in the Cloud console before it delivers. Leave empty to disable the escalation tier."
  type        = string
  default     = ""

  # Kept sensitive so the number never renders in plan output, which is
  # posted publicly as a pull request comment. See infra/variables.tf.
  sensitive = true
}

variable "escalation_duration" {
  description = "How long an outage must persist before escalating past Slack and email"
  type        = string
  default     = "900s"
}
