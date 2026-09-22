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
  description = "Days to keep raw uploads in the source bucket before deletion. A backstop, not the routine path: the transcode job deletes its own source once it has verified the renditions, so anything still here is an upload whose job never ran or never finished. One day is the shortest a lifecycle rule can express — the condition is measured in whole days and evaluated asynchronously, so deletion lands somewhere in the 24 to 48 hour range rather than on the hour. The cost is the re-transcode window: a rendition fault found the next morning can no longer be fixed by re-running the job, and the admin re-uploads instead. Accepted because an abandoned upload should not outlive the person's memory of making it."
  type        = number
  default     = 1
}

variable "app_origin" {
  description = "Origin the admin UI is served from, e.g. https://teaching.quill-medical.com. Named explicitly in the source bucket's CORS policy: the browser uploads straight to GCS, which is cross-origin from the app, so without this the preflight is refused and no upload can start."
  type        = string
}
