# modules/passport-storage/variables.tf

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "service_account_email" {
  description = "Cloud Run backend service account, granted objectAdmin on the bucket. It does not inherit object-level access from project editor, so the binding has to name it."
  type        = string
}
