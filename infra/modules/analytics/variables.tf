# modules/analytics/variables.tf

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "environment" {
  description = "Environment name (prod, staging, teaching)"
  type        = string
}

variable "landing_domain" {
  description = "Public marketing site domain, used to count visits to it separately from app traffic"
  type        = string
}

variable "app_domain" {
  description = "Hostname the authenticated application is served from, used to count app page loads separately from marketing site visits"
  type        = string
}

# London, and it took two applies to get here. Moving a dataset replaces
# it, and the destroy half needs delete_contents_on_destroy to be true in
# the state already: see the comment on the dataset. The change that set
# it and the change that moved the dataset first reached main in the same
# apply, on 11 October 2026, so the destroy read the old value, met the
# sink's table and was refused with "still in use". Every apply failed on
# it for a day, and with it everything else waiting to be applied.
#
# It was put back to "EU" for one apply, which recorded the flag, and
# then moved. Anything that replaces this dataset again needs the flag
# applied first, on its own, in the same way.
variable "dataset_location" {
  description = "BigQuery dataset location. London, because the rows carry visitors' IP addresses and the privacy policy says everything Google holds for Quill is in its London region. A dataset cannot change location in place: changing this destroys and recreates it."
  type        = string
  default     = "europe-west2"
}

variable "retention_days" {
  description = "How long raw request rows are kept. Deliberately short: these rows carry client IP addresses, and their purpose is recent investigation, not long-term trend. The per-page visit history lives in the log-based metric instead, which holds no IP and is retained for far longer."
  type        = number
  default     = 30
}
