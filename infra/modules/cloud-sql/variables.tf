# modules/cloud-sql/variables.tf

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "environment" {
  description = "Environment name (prod, staging, teaching)"
  type        = string
}

variable "instance_name" {
  description = "Cloud SQL instance name suffix (e.g. auth, fhir, ehrbase)"
  type        = string
}

variable "db_name" {
  description = "Database name to create"
  type        = string
}

variable "db_user" {
  description = "Database user to create"
  type        = string
}

variable "db_password_secret_id" {
  description = "Secret Manager secret ID containing the database password"
  type        = string
}

variable "tier" {
  description = "Cloud SQL machine tier"
  type        = string
  default     = "db-f1-micro"
}

variable "database_version" {
  description = "PostgreSQL version"
  type        = string
  default     = "POSTGRES_18"
}

variable "enable_ha" {
  description = "Enable high availability (regional) — roughly doubles cost"
  type        = bool
  default     = false
}

variable "vpc_network_id" {
  description = "VPC network ID for private IP"
  type        = string
}

variable "private_vpc_connection" {
  description = "Private VPC connection dependency (from networking module)"
  type        = any
}

variable "backup_enabled" {
  description = "Enable automated backups"
  type        = bool
  default     = true
}

variable "backup_retained_count" {
  description = "Number of daily backups to retain"
  type        = number
  default     = 30
}

variable "pitr_enabled" {
  description = "Enable point-in-time recovery"
  type        = bool
  default     = true
}

variable "pitr_days" {
  description = "Number of days for point-in-time recovery retention"
  type        = number
  default     = 7
}

variable "secret_depends_on" {
  description = "Resource to depend on before writing secret versions (e.g. secrets module output)"
  type        = any
  default     = null
}
