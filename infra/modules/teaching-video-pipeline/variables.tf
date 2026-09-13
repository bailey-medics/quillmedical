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
  description = "Days to keep raw uploads in the source bucket before deletion. A backstop, not the routine path: the transcode job deletes its own source once it has verified the renditions, so anything still here is an upload whose job never ran or never finished. Short deliberately — a never-transcoded upload then fails loudly within a week, while re-uploading is still merely annoying, rather than silently at 90 days when the master is unrecoverable."
  type        = number
  default     = 7
}

variable "app_origin" {
  description = "Origin the admin UI is served from, e.g. https://teaching.quill-medical.com. Named explicitly in the source bucket's CORS policy: the browser uploads straight to GCS, which is cross-origin from the app, so without this the preflight is refused and no upload can start."
  type        = string
}
