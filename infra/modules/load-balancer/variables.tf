# modules/load-balancer/variables.tf

variable "project_id" {
  description = "GCP project ID (typically the prod project that hosts the LB)"
  type        = string
}

variable "domain" {
  description = "Root domain (e.g. quill-medical.com)"
  type        = string
}

variable "dns_zone_name" {
  description = "Cloud DNS managed zone name"
  type        = string
}

variable "services" {
  description = "Map of hostname to Cloud Run backend (NEG) config"
  type = map(object({
    cloud_run_service_name = string
    cloud_run_project      = string
    cloud_run_region       = string
  }))
  # Example: { "app.quill-medical.com" = { ... }, "staging.quill-medical.com" = { ... } }
}
