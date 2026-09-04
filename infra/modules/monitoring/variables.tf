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

variable "slack_channel_display_name" {
  description = "Display name of a Slack notification channel created by hand in the Cloud console (optional). Looked up, not created — see docs/docs/infrastructure/monitoring.md. Leave empty to disable the Slack rung of tier one."
  type        = string
  default     = ""
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

variable "app_domain" {
  description = "Hostname serving the application. Only this host is probed at /api/health; every other monitored host is probed at / because it has no API."
  type        = string
  default     = ""
}

variable "sql_disk_threshold" {
  description = "Cloud SQL disk utilisation (0.0-1.0) above which to alert. 0.8 leaves room to resize before writes start failing."
  type        = number
  default     = 0.8
}

variable "pagerduty_service_key" {
  description = "PagerDuty Events API v1 integration key for the on-call service. Leave empty to disable tier three entirely."
  type        = string
  default     = ""

  # A credential, and this repository is public: plan output is posted as a
  # pull request comment. See infra/variables.tf.
  sensitive = true
}

variable "critical_duration" {
  description = "How long an outage must persist before the on-call phone rings"
  type        = string
  default     = "1800s"
}
