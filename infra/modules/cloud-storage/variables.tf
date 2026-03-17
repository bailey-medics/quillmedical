# modules/cloud-storage/variables.tf

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

variable "bucket_suffix" {
  description = "Bucket name suffix (e.g. images)"
  type        = string
  default     = "images"
}
