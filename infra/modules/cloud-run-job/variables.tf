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

variable "vpc_egress" {
  description = <<-EOT
    Which traffic leaves through the VPC connector.

    PRIVATE_RANGES_ONLY, the default, sends only private-range traffic
    through the connector and lets public traffic leave directly. That is
    what the transcode and caption jobs need: they reach the public GCS
    endpoint and call back to the app's public domain.

    ALL_TRAFFIC routes everything through the connector, so requests
    arrive as internal VPC traffic. A job that has to reach a Cloud Run
    service set to INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER needs this,
    because that setting accepts same-project VPC traffic but not a
    request that has been out to the internet and back.
  EOT
  type        = string
  default     = "PRIVATE_RANGES_ONLY"

  validation {
    condition = contains(
      ["PRIVATE_RANGES_ONLY", "ALL_TRAFFIC"], var.vpc_egress
    )
    error_message = "vpc_egress must be PRIVATE_RANGES_ONLY or ALL_TRAFFIC."
  }
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
