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
