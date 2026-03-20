# branch_rules.tf — GitHub branch protection via Repository Rulesets
#
# This file manages branch protection for the quillmedical repository using
# GitHub Rulesets (the modern replacement for classic branch protection rules).
#
# Clinical safety context (DCB 0129):
#   These rulesets form part of the auditable change-control process required
#   by DCB 0129. They ensure that all changes to protected branches go through
#   pull-request review, creating an approval record in the repository history.
#   The naming convention ruleset prevents ad-hoc branch names, keeping the
#   commit graph traceable for hazard-log and incident-response audits.
#
# Usage:
#   cd infra/github/
#   terraform init
#   terraform plan -var-file=terraform.tfvars
#   terraform apply -var-file=terraform.tfvars

# ---------------------------------------------------------------------------
# Terraform and provider configuration
# ---------------------------------------------------------------------------

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
  }
}

provider "github" {
  owner = var.github_owner
  # Authentication: set the GITHUB_TOKEN environment variable or use a
  # GitHub App. Never commit tokens to version control.
}

# ---------------------------------------------------------------------------
# Variables
# ---------------------------------------------------------------------------

variable "github_owner" {
  description = "GitHub organisation or user that owns the repository"
  type        = string
}

variable "github_repository" {
  description = "Name of the GitHub repository to apply rulesets to"
  type        = string
  default     = "quillmedical"
}

# ---------------------------------------------------------------------------
# Ruleset 1 — Protected branches
# ---------------------------------------------------------------------------
# Targets: main, clinical-live, release/**
#
# Purpose:
#   Prevents direct pushes, force pushes, and branch deletion on branches that
#   represent production-grade code or release candidates. All changes must go
#   through a pull request with at least one approving review, and stale
#   approvals are dismissed when new commits are pushed. This creates an
#   auditable paper trail of who approved each change — a key requirement for
#   DCB 0129 clinical safety compliance.
#
# No bypass actors are configured so that these rules apply to everyone,
# including repository administrators.

resource "github_repository_ruleset" "protected_branches" {
  name        = "protected-branches"
  repository  = var.github_repository
  target      = "branch"
  enforcement = "active"

  conditions {
    ref_name {
      include = [
        "refs/heads/main",
        "refs/heads/clinical-live",
        "refs/heads/release/**",
      ]
      exclude = []
    }
  }

  rules {
    # Require a pull request before merging (0 approvals while solo developer;
    # increase to 1+ when additional team members join — see docs/docs/plans/todo.md)
    pull_request {
      required_approving_review_count   = 0
      dismiss_stale_reviews_on_push     = true
      require_code_owner_review         = false
      require_last_push_approval        = false
      required_review_thread_resolution = false
    }

    # Block force pushes (rewriting history on protected branches)
    non_fast_forward = true

    # Block branch deletion
    deletion = true
  }
}

# ---------------------------------------------------------------------------
# Ruleset 2 — Branch naming convention
# ---------------------------------------------------------------------------
# Targets: all branches EXCEPT the protected ones above
#
# Purpose:
#   Enforces a consistent naming convention across the repository. Any branch
#   that is not in the protected set (main, clinical-live, release/**) must
#   match the pattern feature/<description> or hotfix/<description>. Branches
#   that don't conform are rejected at creation time.
#
#   This keeps the commit graph clean and predictable, making it easier to
#   trace changes during clinical safety audits and incident investigations.

resource "github_repository_ruleset" "branch_naming" {
  name        = "branch-naming-convention"
  repository  = var.github_repository
  target      = "branch"
  enforcement = "active"

  conditions {
    ref_name {
      include = ["~ALL"]
      exclude = [
        "refs/heads/main",
        "refs/heads/clinical-live",
        "refs/heads/release/**",
      ]
    }
  }

  rules {
    branch_name_pattern {
      operator = "regex"
      pattern  = "^(feature|hotfix)/.+"
      name     = "Branch names must follow feature/* or hotfix/* convention"
      negate   = false
    }
  }
}
