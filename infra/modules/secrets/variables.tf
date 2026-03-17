# modules/secrets/variables.tf

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "secrets" {
  description = "Map of secret IDs to create (values are set manually or via CI)"
  type        = list(string)
}
