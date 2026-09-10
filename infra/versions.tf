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
    # Required until the spike's two `time_sleep` resources have actually been
    # destroyed. Terraform refuses to plan while state references a provider
    # that is not declared, so removing this in the same change that removes
    # them fails with "Missing required provider". Delete it in a follow-up,
    # once this revert has applied and state no longer mentions them.
    time = {
      source  = "hashicorp/time"
      version = "~> 0.13"
    }
  }
}
