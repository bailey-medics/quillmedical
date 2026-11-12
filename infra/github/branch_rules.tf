# branch_rules.tf - GitHub branch protection via Repository Rulesets
#
# This file manages branch protection for the quillmedical repository using
# GitHub Rulesets (the modern replacement for classic branch protection rules).
#
# Usage: `just terraform-github` (alias tf-gh), from any checkout. It plans,
# asks, then applies. State is remote, so every checkout shares it, but the
# code applied is from the checkout you are on: run it from the latest main,
# or from the branch being applied, and read the plan, since an older checkout
# may undo whatever merged after it.

# ---------------------------------------------------------------------------
# Terraform and provider configuration
# ---------------------------------------------------------------------------

terraform {
  required_version = ">= 1.17.1"

  # Terraform state sits beside the GCP state, in the same bucket under its
  # own prefix. Applies are manual; .github/workflows/github-rulesets.yml says
  # why.
  backend "gcs" {
    bucket = "quill-medical-app-terraform-state"
    prefix = "terraform/github"
  }

  required_providers {
    github = {
      source  = "integrations/github"
      version = "~> 6.13"
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

variable "merge_queue_enabled" {
  description = <<-EOT
    Whether the merge queue is active on main.

    The escape hatch for a deadlock this repository has already hit twice: a
    fix to the rulesets or workflows the queue depends on cannot reach main
    through the queue, because the queue is broken by the very bug being
    fixed, and an active queue removes the ordinary merge button.

    To break it, set this to false in terraform.tfvars WITHOUT committing the
    change, apply, merge the pull request with the merge button that comes
    back, then `git checkout infra/github/terraform.tfvars` and apply again.
    Terraform reads the file from disk, so no pull request is needed to flip
    it, and main keeps the queue enabled throughout.
  EOT
  type        = bool
  default     = true
}

variable "block_merges_into_feature_branches" {
  description = <<-EOT
    Whether a pull request can be merged into a branch other than main.

    A stacked pull request's base is the branch below it, and a merge goes
    into that base: a feature branch no ruleset protects, so the work never
    reaches main.

    True requires linear history on every branch but main, and switches off
    squash and rebase merging, so a merge has nowhere to land but main. It
    does not work: a branch cut from main carries main's own merge commits,
    and linear history then refuses its push. So this must stay false.

    Kept, switched off, so the idea is not tried again without a different
    way round main's history.
  EOT
  type        = bool
  default     = false
}

# ---------------------------------------------------------------------------
# Ruleset 1 - Protected branches (main only)
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
    # increase to 1+ when additional team members join
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
        context = "SAST"
      }

      # E2E
      required_check {
        context = "E2E (Playwright)"
      }

      # API compatibility
      required_check {
        context = "API breaking-change check"
      }
      required_check {
        context = "API breaking-change review gate"
      }

      # Destructive DB migrations
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

      # Stops a competency being deleted from the shared catalogue: one is
      # retired, never deleted. Deleting it revokes nothing - everyone
      # holding it keeps the access, it merely stops being describable -
      # and it destroys the vocabulary the audit trail needs. Like the check
      # above, no approval path: there is no legitimate case to approve.
      required_check {
        context = "Competency catalogue check"
      }
    }

    # Block force pushes (rewriting history on protected branches)
    non_fast_forward = true

    # Block branch deletion
    deletion = true

    # Merge queue: each PR is re-tested against the latest main before it
    # merges, so nobody rebases by hand.
    #
    # - Batching off (min/max_entries_to_merge = 1): a failed batch would
    #   have to be split to find the culprit.
    # - MERGE matches the merge button; main's graph shows diamonds, not a
    #   straight line.
    # - max_entries_to_build = 6 tests a whole stack at once. A failure
    #   reruns everything behind it, so lower it if that happens often.
    # - check_response_timeout_minutes = 60: the slowest chain,
    #   heavy_e2e_images then heavy_e2e, can take 40, leaving room for runner
    #   queueing. Raise it first if entries drop.
    # - Dynamic, so var.merge_queue_enabled can switch it off.
    dynamic "merge_queue" {
      for_each = var.merge_queue_enabled ? [1] : []

      content {
        check_response_timeout_minutes    = 60
        grouping_strategy                 = "ALLGREEN"
        max_entries_to_build              = 6
        max_entries_to_merge              = 1
        merge_method                      = "MERGE"
        min_entries_to_merge              = 1
        min_entries_to_merge_wait_minutes = 0
      }
    }
  }
}

# ---------------------------------------------------------------------------
# Ruleset 2 - Branch naming convention
# ---------------------------------------------------------------------------
# Targets: all branches EXCEPT main and the merge queue's own refs
#
# Purpose:
#   Enforces a consistent naming convention across the repository. Any branch
#   that is not main must match the pattern feature/*, hotfix/* or renovate/*
#   (automated dependency updates), plus gh-readonly-queue/* for the
#   merge queue's own branches. Branches that don't conform are rejected at
#   creation time.
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
        # The merge queue builds each entry on a temporary branch,
        # gh-readonly-queue/main/pr-<number>-<sha>. Without this exemption
        # the naming rule rejects it, and the queue drops the entry with only
        # "failing Branch Protection rules" to explain it.
        #
        # Two patterns, because `**` alone did not match the two levels under
        # the prefix (main/pr-…). The regex below allows the prefix too, in
        # case neither does.
        "refs/heads/gh-readonly-queue/**",
        "refs/heads/gh-readonly-queue/**/*",
      ]
    }
  }

  rules {
    branch_name_pattern {
      operator = "regex"
      # gh-readonly-queue is the merge queue's own prefix, not a branch anyone
      # creates by hand. It is matched here as well as excluded above so the
      # queue does not depend on fnmatch semantics to function.
      pattern = "^(feature|hotfix|renovate|gh-readonly-queue)/.+"
      name    = "Branch names must follow feature/*, hotfix/*, or renovate/* convention (gh-readonly-queue/* is reserved for the merge queue)"
      negate  = false
    }

    # Refuses a merge commit on any branch but main, which with squash and
    # rebase merging off (security.tf) leaves no way to merge a pull
    # request into a feature branch. See the variable above.
    required_linear_history = var.block_merges_into_feature_branches
  }
}
