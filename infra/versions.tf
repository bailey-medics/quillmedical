# versions.tf — Provider version constraints

terraform {
  required_version = ">= 1.15.1"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.4"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.4"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}
