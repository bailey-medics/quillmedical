# Teaching separation of concerns plan

## Current state

- **quillmedical** — main application (FastAPI + React) + all Terraform infra (manages branch rules for quillmedical and a non-existent quill-question-bank repo)
- **teaching-tooling** — reusable CI workflows, validation scripts, deployment logic
- **\*-teaching** (eoeeta, respiratory) — pure content repos that call teaching-tooling workflows

## Problem

Branch protection for teaching repos is currently configured ad-hoc or managed in quillmedical's Terraform, which:

1. Couples quillmedical to repos it doesn't own conceptually
2. Requires updating quillmedical every time a new content repo is created
3. Leaves teaching-tooling's own branch protection unmanaged

## Design principles

- **teaching-tooling is the control plane** — it owns all teaching platform governance (CI, validation, deployment, branch protection)
- **Content repos are the data plane** — they contain only content and thin workflow callers
- **Content repos are self-service** — creating a new `*-teaching` repo automatically inherits all rules with zero config elsewhere
- **quillmedical manages only itself** — its Terraform should not reference teaching repos

## Architecture

| Concern           | Mechanism                                                  | Teaching-tooling aware of content repos? |
| ----------------- | ---------------------------------------------------------- | ---------------------------------------- |
| CI validation     | Content repo calls reusable workflow (`validate.yml@main`) | No                                       |
| Deployment        | Content repo calls reusable workflow (`deploy.yml@main`)   | No                                       |
| Branch protection | GitHub org-level ruleset matching `*-teaching` pattern     | No                                       |
| Branch naming     | GitHub org-level ruleset matching `*-teaching` pattern     | No                                       |
| Auto PR creation  | Content repo calls reusable workflow (`auto-pr.yml@main`)  | No                                       |

## Org-level rulesets (Terraform in teaching-tooling)

GitHub Organisation Rulesets apply to repos by name pattern. Once created, GitHub enforces them in real-time on any repo matching the pattern — no Terraform re-run needed when a new content repo is created.

```hcl
resource "github_organization_ruleset" "teaching_content_protected" {
  name        = "teaching-content-protected-branches"
  target      = "branch"
  enforcement = "active"

  conditions {
    repository_name {
      include = ["~*-teaching"]
      exclude = []
    }
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

    required_status_checks {
      strict_required_status_checks_policy = true

      required_check {
        context = "Validate teaching content / validate"
      }
    }

    non_fast_forward = true
    deletion         = true
  }
}

resource "github_organization_ruleset" "teaching_content_branch_naming" {
  name        = "teaching-content-branch-naming"
  target      = "branch"
  enforcement = "active"

  conditions {
    repository_name {
      include = ["~*-teaching"]
      exclude = []
    }
    ref_name {
      include = ["~ALL"]
      exclude = ["refs/heads/main"]
    }
  }

  rules {
    branch_name_pattern {
      operator = "regex"
      pattern  = "^(feature|hotfix|copilot|renovate)/.+"
      name     = "Branch names must follow convention"
      negate   = false
    }
  }
}
```

Teaching-tooling itself gets a separate repo-level ruleset (since it doesn't match `*-teaching`):

```hcl
resource "github_repository_ruleset" "tooling_protected_branches" {
  name        = "protected-branches"
  repository  = "teaching-tooling"
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

    required_status_checks {
      strict_required_status_checks_policy = true

      required_check {
        context = "python-tests"
      }
      required_check {
        context = "node-tests"
      }
    }

    non_fast_forward = true
    deletion         = true
  }
}
```

## Implementation tasks

### 1. Clean up quillmedical Terraform

- [x] Remove rulesets 3–10 (question-bank and teaching repos) from `infra/github/branch_rules.tf`
- [x] Remove associated variables (`question_bank_repository`, `teaching_tooling_repository`, etc.)
- [x] Remove question-bank security config from `infra/github/security.tf`
- [ ] Run `terraform apply` to destroy the orphaned rulesets (requires GITHUB_TOKEN)

### 2. Create teaching-tooling Terraform

- [x] Create `teaching-tooling/infra/` with:
  - `main.tf` — provider config, org-level rulesets for `*-teaching`, repo-level ruleset for teaching-tooling itself
  - `variables.tf` — `github_owner`
  - `terraform.tfvars` — `github_owner = "bailey-medics"`
- [x] `.terraform/` and `*.tfstate*` already in `.gitignore`
- [ ] Run `terraform apply` to create the rulesets (requires GITHUB_TOKEN)
  - Note: old resources in state must be removed first (`terraform state rm`)

### 3. Verify

- Confirm teaching-tooling PR no longer shows "bypass rules" option
- Confirm content repo PRs enforce status checks before merge
- Create a test branch with invalid name to confirm naming rules apply

## Onboarding a new content repo

After this plan is implemented, onboarding a new organisation is:

1. Create `{org}-teaching` repo
2. Add thin workflow callers (copy from an existing content repo)
3. Add content under `modules/`
4. Push — branch protection is already active (GitHub matches the pattern)

No changes to teaching-tooling or quillmedical required.
