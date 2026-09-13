# modules/teaching-video-pipeline/variables.tf

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "project_number" {
  description = "GCP project number, used to construct the Google-managed service account addresses"
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

variable "source_retention_days" {
  description = "Days to keep raw uploads in the source bucket before deletion. They exist only until the transcode job has produced its renditions."
  type        = number
  default     = 90
}

variable "app_origin" {
  description = "Origin the admin UI is served from, e.g. https://teaching.quill-medical.com. Named explicitly in the source bucket's CORS policy: the browser uploads straight to GCS, which is cross-origin from the app, so without this the preflight is refused and no upload can start."
  type        = string
}
