# variables.tf — Root-level input variables

variable "project_id" {
  description = "GCP project ID for this environment"
  type        = string
}

variable "region" {
  description = "GCP region for resources"
  type        = string
  default     = "europe-west2" # London
}

variable "environment" {
  description = "Environment name: prod, staging, or teaching"
  type        = string

  validation {
    condition     = contains(["prod", "staging", "teaching"], var.environment)
    error_message = "Environment must be prod, staging, or teaching."
  }
}

variable "domain" {
  description = "Root domain for the application"
  type        = string
  default     = "quill-medical.com"
}

variable "db_tier" {
  description = "Cloud SQL machine tier"
  type        = string
  default     = "db-f1-micro"
}

variable "enable_fhir" {
  description = "Whether to create Compute Engine VM for FHIR + EHRbase (false for teaching)"
  type        = bool
  default     = true
}

variable "enable_ha" {
  description = "Enable high availability on Cloud SQL (doubles cost)"
  type        = bool
  default     = false
}

variable "cloud_run_max_instances" {
  description = "Maximum Cloud Run instances per service"
  type        = number
  default     = 10
}

variable "backend_image" {
  description = "Container image for the backend service"
  type        = string
  default     = "gcr.io/cloudrun/hello:latest"
}

variable "frontend_image" {
  description = "Container image for the frontend service"
  type        = string
  default     = "gcr.io/cloudrun/hello:latest"
}

variable "monitored_hostnames" {
  description = "Hostnames to create uptime checks for (e.g. api, app subdomains)"
  type        = list(string)
  default     = []
}

variable "alert_email" {
  description = "Email address to receive uptime failure alerts"
  type        = string
  default     = ""
}
