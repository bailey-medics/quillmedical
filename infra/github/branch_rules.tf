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
  required_version = ">= 1.5.7"

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

variable "question_bank_repository" {
  description = "Name of the question bank repository"
  type        = string
  default     = "quill-question-bank"
}

# ---------------------------------------------------------------------------
# Ruleset 1 — Protected branches (main only)
# ---------------------------------------------------------------------------
# Purpose:
#   Prevents direct pushes, force pushes, and branch deletion on the main
#   branch. All changes must go through a pull request. Currently 0 approvals
#   required (solo developer); increase when additional team members join.
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

    # Require CI status checks to pass before merging
    required_status_checks {
      strict_required_status_checks_policy = true

      # Python (matrix: styling, unit)
      required_check {
        context = "Python styling"
      }
      required_check {
        context = "Python unit"
      }

      # TypeScript (matrix: all tasks)
      required_check {
        context = "typescript_checks (eslint)"
      }
      required_check {
        context = "typescript_checks (prettier)"
      }
      required_check {
        context = "typescript_checks (stylelint)"
      }
      required_check {
        context = "typescript_checks (typecheck:all)"
      }
      required_check {
        context = "typescript_checks (unit-test:run)"
      }
      required_check {
        context = "typescript_checks (storybook:build)"
      }
      required_check {
        context = "typescript_checks (storybook:test:ci)"
      }

      # Security
      required_check {
        context = "Semgrep (frontend SAST)"
      }

      # E2E
      required_check {
        context = "E2E (Playwright)"
      }
    }

    # Require merge queue for merging into main
    merge_queue {
      merge_method                     = "SQUASH"
      min_entries_to_merge             = 1
      max_entries_to_merge             = 5
      min_entries_to_merge_wait_minutes = 0
      grouping_strategy                = "ALLGREEN"
      check_response_timeout_minutes   = 60
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
# Targets: all branches EXCEPT main
#
# Purpose:
#   Enforces a consistent naming convention across the repository. Any branch
#   that is not main must match the pattern feature/*, hotfix/*, copilot/*, or
#   renovate/* (automated dependency updates). Branches that don't conform are
#   rejected at creation time.
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
      ]
    }
  }

  rules {
    branch_name_pattern {
      operator = "regex"
      pattern  = "^(feature|hotfix|copilot|renovate)/.+"
      name     = "Branch names must follow feature/*, hotfix/*, copilot/*, or renovate/* convention"
      negate   = false
    }
  }
}

# ---------------------------------------------------------------------------
# Ruleset 3 — Question bank: protected branches
# ---------------------------------------------------------------------------
# Same pattern as quillmedical but for the question bank data repo.
# Only main is protected (no clinical-live or release branches).

resource "github_repository_ruleset" "qb_protected_branches" {
  name        = "protected-branches"
  repository  = var.question_bank_repository
  target      = "branch"
  enforcement = "active"

  conditions {
    ref_name {
      include = ["refs/heads/main"]
      exclude = []
    }
  }

  rules {
    pull_request {
      required_approving_review_count   = 0
      dismiss_stale_reviews_on_push     = true
      require_code_owner_review         = false
      require_last_push_approval        = false
      required_review_thread_resolution = false
    }

    non_fast_forward = true
    deletion         = true
  }
}

# ---------------------------------------------------------------------------
# Ruleset 4 — Question bank: branch naming convention
# ---------------------------------------------------------------------------

resource "github_repository_ruleset" "qb_branch_naming" {
  name        = "branch-naming-convention"
  repository  = var.question_bank_repository
  target      = "branch"
  enforcement = "active"

  conditions {
    ref_name {
      include = ["~ALL"]
      exclude = ["refs/heads/main"]
    }
  }

  rules {
    branch_name_pattern {
      operator = "regex"
      pattern  = "^(feature|hotfix|copilot|renovate)/.+"
      name     = "Branch names must follow feature/*, hotfix/*, copilot/*, or renovate/* convention"
      negate   = false
    }
  }
}
