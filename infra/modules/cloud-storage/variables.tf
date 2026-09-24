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

variable "ci_service_account" {
  description = <<-EOT
    The service account the content pipeline uploads as, or "" to grant
    nothing.

    Not derivable from the project number: while the environment is moving
    between projects the pipeline still authenticates as the old project's
    account, so this is passed in rather than assumed.
  EOT
  type        = string
  default     = ""
}
