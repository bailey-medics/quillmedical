# modules/guide-assets/variables.tf

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

variable "backend_service_account_email" {
  description = "The backend's own service account, which reads the private bucket to serve a signed-in reader a guide's pictures."
  type        = string
}
