# ---------------------------------------------------------------------------
# Organisation-level rulesets for the teaching content repositories
# ---------------------------------------------------------------------------
#
# Moved here from teaching-tooling/infra/main.tf when the teaching pipeline
# was consolidated into Quill. The repositories they protect now call Quill's
# workflow, so the rules that gate them belong in the same state as the
# workflow rather than in a repository that no longer runs anything.
#
# These rulesets already exist in GitHub. The import blocks below adopt them
# into this state rather than creating duplicates — `terraform plan` should
# report two imports and no changes. Once applied, delete the corresponding
# resources from teaching-tooling before that repository goes.
#
# GitHub's fnmatch wildcards (e.g. ~*-teaching) are unreliable in org-level
# repository_name conditions, so the repositories are listed explicitly. Add
# a new content repository here when onboarding one.

locals {
  teaching_repos = [
    "eoeeta-teaching",
    "respiratory-teaching",
  ]
}

# The required check names are composed from the caller's job name plus the
# job names in Quill's teaching-pipeline.yml. Both were deliberately
# preserved through the consolidation so these contexts stay valid; renaming
# either leaves a pull request waiting on a check that never reports.
import {
  to = github_organization_ruleset.teaching_protected_branches
  id = "17038589"
}

resource "github_organization_ruleset" "teaching_protected_branches" {
  name        = "teaching-content-protected-branches"
  target      = "branch"
  enforcement = "active"

  conditions {
    ref_name {
      include = ["refs/heads/main"]
      exclude = []
    }

    repository_name {
      include = local.teaching_repos
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

    required_status_checks {
      strict_required_status_checks_policy = true

      required_check {
        context = "pipeline / validate"
      }

      required_check {
        context = "pipeline / check-protection"
      }
    }

    non_fast_forward = true
    deletion         = true
  }
}

import {
  to = github_organization_ruleset.teaching_branch_naming
  id = "17038587"
}

resource "github_organization_ruleset" "teaching_branch_naming" {
  name        = "teaching-content-branch-naming"
  target      = "branch"
  enforcement = "active"

  conditions {
    ref_name {
      include = ["~ALL"]
      exclude = ["refs/heads/main"]
    }

    repository_name {
      include = local.teaching_repos
      exclude = []
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
