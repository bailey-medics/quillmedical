# versions.tf — Provider version constraints

terraform {
  required_version = ">= 1.14.8"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.1"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.1"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}
