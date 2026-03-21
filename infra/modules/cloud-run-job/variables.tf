# modules/cloud-run-job/variables.tf

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "environment" {
  description = "Environment name (prod, staging, teaching)"
  type        = string
}

variable "job_name" {
  description = "Cloud Run Job name suffix (e.g. admin → quill-admin-staging)"
  type        = string
}

variable "image" {
  description = "Container image to run"
  type        = string
}

variable "memory" {
  description = "Memory limit (e.g. 512Mi)"
  type        = string
  default     = "512Mi"
}

variable "cpu" {
  description = "CPU limit (e.g. 1)"
  type        = string
  default     = "1"
}

variable "timeout" {
  description = "Maximum execution time (e.g. 300s)"
  type        = string
  default     = "300s"
}

variable "vpc_connector_id" {
  description = "Serverless VPC connector ID for private database access"
  type        = string
}

variable "env_vars" {
  description = "Environment variables for the container"
  type        = map(string)
  default     = {}
}

variable "secret_env_vars" {
  description = "Environment variables sourced from Secret Manager (name => secret_id)"
  type        = map(string)
  default     = {}
}
