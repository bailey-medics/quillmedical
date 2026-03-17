# modules/dns/variables.tf

variable "project_id" {
  description = "GCP project ID (for Cloud DNS zone, typically the prod project)"
  type        = string
}

variable "domain" {
  description = "Root domain (e.g. quill-medical.com)"
  type        = string
}

variable "subdomains" {
  description = "Map of subdomain prefix to Cloud Run service name (e.g. app => backend-prod)"
  type = map(object({
    cloud_run_service_name = string
    cloud_run_project      = string
    cloud_run_region       = string
  }))
}
