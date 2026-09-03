# variables.tf — Root-level input variables

variable "project_id" {
  description = "GCP project ID for this environment"
  type        = string
}

variable "region" {
  description = "GCP region for resources"
  type        = string
  default     = "europe-west2" # London
}

variable "environment" {
  description = "Environment name: prod, staging, or teaching"
  type        = string

  validation {
    condition     = contains(["prod", "staging", "teaching"], var.environment)
    error_message = "Environment must be prod, staging, or teaching."
  }
}

variable "domain" {
  description = "Root domain for the application"
  type        = string
  default     = "quill-medical.com"
}

variable "db_tier" {
  description = "Cloud SQL machine tier"
  type        = string
  default     = "db-f1-micro"
}

variable "enable_fhir" {
  description = "Whether to create Compute Engine VM for FHIR + EHRbase (false for teaching)"
  type        = bool
  default     = true
}

variable "enable_ha" {
  description = "Enable high availability on Cloud SQL (doubles cost)"
  type        = bool
  default     = false
}

variable "cloud_run_max_instances" {
  description = "Maximum Cloud Run instances per service"
  type        = number
  default     = 10
}

variable "backend_image" {
  description = "Container image for the backend service"
  type        = string
  default     = "gcr.io/cloudrun/hello:latest"
}

variable "frontend_image" {
  description = "Container image for the frontend service"
  type        = string
  default     = "gcr.io/cloudrun/hello:latest"
}

variable "admin_image" {
  description = "Container image for the admin Cloud Run Job (built from Dockerfile admin target)"
  type        = string
  default     = "gcr.io/cloudrun/hello:latest"
}

variable "lb_domains" {
  description = "Domain names for the load balancer SSL certificate and routing"
  type        = list(string)
}

variable "app_domain" {
  description = "Hostname the authenticated application is served from. Set explicitly rather than derived from monitored_hostnames, so reordering that list cannot silently point the app metrics at the marketing site."
  type        = string
  default     = ""
}

variable "pagerduty_service_key" {
  description = "PagerDuty Events API v1 integration key. Supplied by CI from a secret, never committed. Leave empty to disable the tier three phone call."
  type        = string
  default     = ""

  # A credential, and this repository is public: the plan job posts its output
  # as a pull request comment. Terraform propagates sensitivity through
  # expressions, so the channel's labels map renders as "(sensitive value)".
  sensitive = true
}

variable "landing_domain" {
  description = "Apex domain for the static landing page (optional, production only)"
  type        = string
  default     = null
}

variable "monitored_hostnames" {
  description = "Hostnames to create uptime checks for (e.g. api, app subdomains)"
  type        = list(string)
  default     = []
}

variable "alert_email" {
  description = "Email address to receive uptime failure alerts"
  type        = string
  default     = ""
}

variable "alert_sms_number" {
  description = "E.164 phone number for escalated alerts on a sustained outage (optional). Requires verification by code in the Cloud console before it delivers. Supplied by CI from a secret, never committed."
  type        = string
  default     = ""

  # This repository is public and the plan job posts its output as a pull
  # request comment. Without this, the number would render in that comment
  # for anyone to read. Terraform propagates sensitivity through
  # expressions, so the notification channel's labels map renders as
  # "(sensitive value)" instead.
  sensitive = true
}

variable "slack_webhook_url" {
  description = "Slack incoming webhook URL for monitoring alerts (optional)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "cloud_run_services" {
  description = "Cloud Run service names to monitor for startup failures"
  type        = list(string)
  default     = []
}
