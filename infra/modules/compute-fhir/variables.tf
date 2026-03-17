# modules/compute-fhir/variables.tf

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "zone" {
  description = "GCP zone within the region"
  type        = string
  default     = "" # Derived from region if empty
}

variable "environment" {
  description = "Environment name (prod, staging)"
  type        = string
}

variable "machine_type" {
  description = "Compute Engine machine type"
  type        = string
  default     = "e2-small"
}

variable "subnet_id" {
  description = "Subnet ID for the VM"
  type        = string
}

variable "fhir_db_host" {
  description = "Cloud SQL private IP for FHIR database"
  type        = string
}

variable "fhir_db_password_secret" {
  description = "Secret Manager secret ID for FHIR DB password"
  type        = string
}

variable "ehrbase_db_host" {
  description = "Cloud SQL private IP for EHRbase database"
  type        = string
}

variable "ehrbase_db_password_secret" {
  description = "Secret Manager secret ID for EHRbase DB password"
  type        = string
}

variable "ehrbase_api_password_secret" {
  description = "Secret Manager secret ID for EHRbase API password"
  type        = string
}

variable "ehrbase_admin_password_secret" {
  description = "Secret Manager secret ID for EHRbase admin API password"
  type        = string
}
