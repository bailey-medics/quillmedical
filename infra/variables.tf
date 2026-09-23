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
  description = "Environment name: prod, staging, or app"
  type        = string

  # `teaching` was removed on 2026-09-23, when the project it named was
  # retired. It and `app` were the same product in two projects while it
  # moved between them.
  validation {
    condition = contains(
      ["prod", "staging", "app"], var.environment
    )
    error_message = "Environment must be prod, staging, or app."
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

variable "transcode_image" {
  description = "Container image for the video transcode Cloud Run Job (built from Dockerfile transcode target). Like admin_image, the real image is pushed by CI and set by `gcloud run jobs execute --image` at call time; Terraform does not track it."
  type        = string
  default     = "gcr.io/cloudrun/hello:latest"
}

variable "caption_image" {
  description = "Container image for the video caption Cloud Run Job (built from backend/Dockerfile.caption, which carries Whisper and is deliberately separate from the backend image). Pushed by CI and set at call time, like the other job images; Terraform does not track it."
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

variable "slack_channel_display_name" {
  description = "Display name of a Slack notification channel created by hand in the Cloud console (optional). See docs/docs/infrastructure/monitoring.md."
  type        = string
  default     = ""
}

variable "cloud_run_services" {
  description = "Cloud Run service names to monitor for startup failures"
  type        = list(string)
  default     = []
}

variable "enable_sms_channel" {
  description = "Create the SMS alert notification channel. Set per environment rather than inferred from whether the secret holds a value, which a count cannot test at plan time."
  type        = bool
  default     = false
}

variable "enable_pagerduty_channel" {
  description = "Create the PagerDuty alert notification channel. Set per environment, for the same reason as enable_sms_channel."
  type        = bool
  default     = false
}

variable "content_ci_service_account" {
  description = <<-EOT
    The service account the teaching content pipeline uploads as, granted
    write access to the images bucket. Empty grants nothing.

    Passed in rather than derived: while the environment moves between
    projects the pipeline still authenticates as the old project's account,
    so the writer and the bucket are in different projects.
  EOT
  type        = string
  default     = ""
}
