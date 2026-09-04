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
  required_version = ">= 1.6.1"

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

      # Python (matrix: pre-commit, unit)
      required_check {
        context = "Python pre-commit"
      }
      required_check {
        context = "Python unit"
      }
      required_check {
        context = "Alembic autogenerate drift check"
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
        context = "Storybook interaction tests"
      }

      # Security
      required_check {
        context = "Semgrep (frontend SAST)"
      }

      # E2E
      required_check {
        context = "E2E (Playwright)"
      }

      # API compatibility (item 15 — see docs/docs/backend/api-compatibility.md)
      required_check {
        context = "API breaking-change check"
      }
      required_check {
        context = "API breaking-change review gate"
      }

      # Destructive DB migrations (see
      # docs/docs/plans/2026-08-25-db-destructive-migration-review-plan.md)
      required_check {
        context = "DB destructive migration check"
      }
      required_check {
        context = "DB destructive migration review gate"
      }
      # A merged migration's code does not change (comments may). The
      # destructive gate above only inspects migrations ADDED on a PR, so a
      # drop_column edited into a file already on main would be invisible to
      # it. Unlike the gates this has no approval path - there is no
      # legitimate case to approve.
      required_check {
        context = "DB migration immutability check"
      }
    }

    # Block force pushes (rewriting history on protected branches)
    non_fast_forward = true

    # Block branch deletion
    deletion = true

    # Merge queue — replaces the old manual "rebase, wait for CI, merge,
    # repeat" loop. GitHub builds a temporary merge-group ref (PR + latest
    # main) and re-runs the required checks above against it before merging,
    # so a PR is always tested against current main without anyone force-
    # pushing a rebase onto the PR branch by hand. See
    # .claude/rules/ci.md for the full flow.
    #
    # Batching deliberately disabled (min/max_entries_to_merge = 1): each PR
    # is tested and merged one at a time. With batching, a failure part-way
    # through a group forces GitHub to bisect the group to find the culprit,
    # which costs more time than it saves for a repo where PRs are reviewed
    # and queued individually rather than in bulk.
    #
    # merge_method = MERGE keeps queued PRs landing the way this repo
    # already merges them (the "Create a merge commit" button).
    #
    # Worth knowing: this does change the shape of main's history. The old
    # flow rebased the PR branch up to date before merging, so its merge
    # commit joined two tips already in a straight line. The queue replaces
    # that manual rebase with a temporary merge-group ref, so a PR's merge
    # commit now joins a branch that diverged earlier: the graph shows real
    # branch-and-merge diamonds rather than a straight line. REBASE or
    # SQUASH would keep the history linear instead, at the cost of no longer
    # matching the merge button used today.
    merge_queue {
      check_response_timeout_minutes    = 60
      grouping_strategy                 = "ALLGREEN"
      max_entries_to_build              = 5
      max_entries_to_merge              = 1
      merge_method                      = "MERGE"
      min_entries_to_merge              = 1
      min_entries_to_merge_wait_minutes = 0
    }
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
