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
  description = "How long raw analytics rows are kept. Short, because load-balancer logs carry client IP addresses, which are personal data. Long-run trends come from the log-based metric instead, which holds no IP."
  type        = number
  default     = 90
}
