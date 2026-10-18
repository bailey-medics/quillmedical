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
    Which traffic leaves through the VPC.

    PRIVATE_RANGES_ONLY, the default, sends only private-range traffic
    through the VPC and lets public traffic leave directly. Right for a
    job that calls nothing inside the project: its public calls skip the
    VPC and the NAT.

    ALL_TRAFFIC routes everything through the VPC, so requests arrive as
    internal VPC traffic. A job that has to reach a Cloud Run
    service set to INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER needs this,
    because that setting accepts same-project VPC traffic but not a
    request that has been out to the internet and back. Every job that
    calls the backend is set this way: the admin job for the deploy's
    smoke test, and the transcode and caption jobs for their completion
    reports. Google APIs such as GCS are still reached on Google's own
    network, through the subnet's Private Google Access, and only
    genuinely public destinations go out through the NAT.
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
  description = <<-EOT
    Serverless VPC connector ID. Give this or vpc_subnetwork_id: a job
    always reaches the VPC one way or the other, never both ways.
  EOT
  type        = string
  default     = ""
}

variable "vpc_subnetwork_id" {
  description = <<-EOT
    Subnet for Direct VPC egress: each task takes an address on it and
    reaches the VPC with no connector in between. Give this or
    vpc_connector_id.
  EOT
  type        = string
  default     = ""

  validation {
    condition     = (var.vpc_subnetwork_id != "") != (var.vpc_connector_id != "")
    error_message = "Give exactly one of vpc_subnetwork_id and vpc_connector_id."
  }
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

variable "service_account_email" {
  description = "Service account the job runs as. Empty uses the default Compute Engine account."
  type        = string
  default     = ""
}
