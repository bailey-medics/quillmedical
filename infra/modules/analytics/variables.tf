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

# Back at "EU" for one apply, on the way to London ("europe-west2").
#
# The move to London replaces the dataset, and the destroy half of that
# needs delete_contents_on_destroy to be true in the state already: see
# the comment on the dataset. The change that set it and the change that
# moved the dataset reached main in the same apply, on 11 October 2026,
# so the destroy read the old value, met the sink's table and was refused
# with "still in use". Every apply since has failed on it, and with it
# everything else waiting to be applied.
#
# So this apply leaves the dataset where it is and records the flag. The
# next change sets this to "europe-west2" and nothing else, and the
# replacement then goes through.
variable "dataset_location" {
  description = "BigQuery dataset location. To be London, because the rows carry visitors' IP addresses and the privacy policy says everything Google holds for Quill is in its London region. A dataset cannot change location in place: changing this destroys and recreates it."
  type        = string
  default     = "EU"
}

variable "retention_days" {
  description = "How long raw request rows are kept. Deliberately short: these rows carry client IP addresses, and their purpose is recent investigation, not long-term trend. The per-page visit history lives in the log-based metric instead, which holds no IP and is retained for far longer."
  type        = number
  default     = 30
}
