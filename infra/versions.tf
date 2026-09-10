# versions.tf — Provider version constraints

terraform {
  required_version = ">= 1.15.2"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.5"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.5"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.13"
    }
  }
}
