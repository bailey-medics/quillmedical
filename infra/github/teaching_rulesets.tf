# ---------------------------------------------------------------------------
# Organisation-level rulesets for the teaching content repositories
# ---------------------------------------------------------------------------
#
# Each teaching repository runs its checks using a workflow from this
# Quill Medical repository. These rules make those checks pass before
# anything merges.
#
# GitHub's fnmatch wildcards (e.g. ~*-teaching) are unreliable in org-level
# repository_name conditions, so the repositories are listed explicitly.

# Add any new teaching content repositories here when onboarding one.
locals {
  teaching_repos = [
    "eoeeta-teaching",
    "eoeeta-teaching-testing",
    "respiratory-teaching",
  ]
}

# The required check names are composed from the caller's job name plus the
# job names in Quill's teaching-pipeline.yml. For example, the caller's job
# `pipeline` running the job `validate` reports as "pipeline / validate".
# Renaming either leaves a pull request waiting on a check that never
# reports.
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
      pattern  = "^(feature|hotfix|renovate)/.+"
      name     = "Branch names must follow feature/*, hotfix/*, or renovate/* convention"
      negate   = false
    }
  }
}
