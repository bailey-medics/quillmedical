# ---------------------------------------------------------------------------
# Organisation-level rulesets for the passport framework repositories
# ---------------------------------------------------------------------------
#
# One repository per publisher, each ending -framework, each calling Quill's
# framework-pipeline.yml. The same rules as the teaching repositories in
# teaching_rulesets.tf: main changes only by pull request, after the
# pipeline's two checks pass on a branch up to date with main. There are no
# stacks in these repositories, so each change is one branch off main and
# one pull request.
#
# Listed by name, not by a wildcard such as ~*-framework, for the reason
# teaching_rulesets.tf gives: GitHub's fnmatch wildcards are unreliable in
# organisation-level repository_name conditions.
#
# Apply only after each repository's first commit is on main. An empty
# repository has no main for a pull request to target, so its first commit
# is pushed straight to main, and these rules refuse that push. See Phase 6
# of docs/docs/plans/2026-11-01-passport-record-and-catalogue-plan.md.

locals {
  framework_repos = [
    "gloucestershire-radiotherapy-record-framework",
    "royal-united-hospitals-bath-sact-passport-framework",
    "uk-sact-board-prescribing-framework",
    "general-clinical-skills-quill-medical-framework",
    # Quill's own, for tests: not read by App production.
    "quill-medical-framework-testing",
    "quill-medical-2-framework-testing",
  ]
}

# The required check names are composed from the caller's job name,
# `pipeline`, plus the job names in Quill's framework-pipeline.yml.
# Renaming either leaves a pull request waiting on a check that never
# reports.
resource "github_organization_ruleset" "framework_protected_branches" {
  name        = "framework-protected-branches"
  target      = "branch"
  enforcement = "active"

  conditions {
    ref_name {
      include = ["refs/heads/main"]
      exclude = []
    }

    repository_name {
      include = local.framework_repos
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

resource "github_organization_ruleset" "framework_branch_naming" {
  name        = "framework-branch-naming"
  target      = "branch"
  enforcement = "active"

  conditions {
    ref_name {
      include = ["~ALL"]
      exclude = ["refs/heads/main"]
    }

    repository_name {
      include = local.framework_repos
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
