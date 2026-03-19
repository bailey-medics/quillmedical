# modules/load-balancer/variables.tf

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for the serverless NEGs"
  type        = string
}

variable "environment" {
  description = "Environment name (prod, staging, teaching)"
  type        = string
}

variable "domains" {
  description = "Domain names for SSL certificate and URL map host routing"
  type        = list(string)
}

variable "backend_service_name" {
  description = "Cloud Run backend service name (e.g. quill-backend-staging)"
  type        = string
}

variable "frontend_service_name" {
  description = "Cloud Run frontend service name (e.g. quill-frontend-staging)"
  type        = string
}

variable "log_sample_rate" {
  description = "Fraction of requests to log (0.0 to 1.0)"
  type        = number
  default     = 1.0
}

variable "landing_domain" {
  description = "Apex domain for the static landing page (e.g. quill-medical.com). When set, creates a GCS-hosted landing page with its own host rule."
  type        = string
  default     = null
}
