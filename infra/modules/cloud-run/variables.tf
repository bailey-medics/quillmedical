# modules/cloud-run/variables.tf

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

variable "service_name" {
  description = "Cloud Run service name (e.g. backend, frontend)"
  type        = string
}

variable "image" {
  description = "Container image to deploy"
  type        = string
}

variable "port" {
  description = "Container port"
  type        = number
  default     = 8000
}

variable "memory" {
  description = "Memory limit (e.g. 512Mi)"
  type        = string
  default     = "512Mi"
}

variable "cpu" {
  description = "CPU limit (e.g. 1)"
  type        = string
  default     = "1"
}

variable "min_instances" {
  description = "Minimum number of instances (0 = scale to zero)"
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum number of instances"
  type        = number
  default     = 10
}

variable "concurrency" {
  description = "Maximum concurrent requests per instance"
  type        = number
  default     = 80
}

variable "vpc_connector_id" {
  description = "Serverless VPC connector ID"
  type        = string
}

variable "env_vars" {
  description = "Environment variables for the container"
  type        = map(string)
  default     = {}
}

variable "secret_env_vars" {
  description = "Environment variables sourced from Secret Manager (name => secret_id)"
  type        = map(string)
  default     = {}
}

variable "service_account_email" {
  description = "Service account email for the Cloud Run service"
  type        = string
  default     = ""
}

variable "ingress" {
  description = "Ingress setting: INGRESS_TRAFFIC_ALL, INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER, INGRESS_TRAFFIC_INTERNAL_ONLY"
  type        = string
  default     = "INGRESS_TRAFFIC_ALL"
}
