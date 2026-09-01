# modules/analytics/variables.tf

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "environment" {
  description = "Environment name (prod, staging, teaching)"
  type        = string
}

variable "landing_domain" {
  description = "Public marketing site domain, used to count visits to it separately from app traffic"
  type        = string
}

variable "dataset_location" {
  description = "BigQuery dataset location. EU keeps analytics data in the European Union."
  type        = string
  default     = "EU"
}

variable "retention_days" {
  description = "How long raw request rows are kept. Deliberately short: these rows carry client IP addresses, and their purpose is recent investigation, not long-term trend. The per-page visit history lives in the log-based metric instead, which holds no IP and is retained for far longer."
  type        = number
  default     = 30
}
