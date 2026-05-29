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

| Concern           | Mechanism                                                             | Teaching-tooling aware of content repos? |
| ----------------- | --------------------------------------------------------------------- | ---------------------------------------- |
| CI/CD pipeline    | Content repo calls single `pipeline.yml@main` (dispatches internally) | No                                       |
| Branch protection | GitHub org-level ruleset (explicit repo names in Terraform)           | Yes (repo names in `locals`)             |
| Branch naming     | GitHub org-level ruleset (explicit repo names in Terraform)           | Yes (repo names in `locals`)             |
| Self-check        | `check-protection` job in pipeline fails if no rulesets found         | No                                       |

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
- [x] Run `terraform apply` — orphaned state cleaned, secret scanning enabled

### 2. Create teaching-tooling Terraform

- [x] Create `teaching-tooling/infra/` with:
  - `main.tf` — provider config, org-level rulesets for content repos, repo-level ruleset for teaching-tooling
  - `variables.tf` — `github_owner`
  - `terraform.tfvars` — `github_owner = "bailey-medics"`
- [x] `.terraform/` and `*.tfstate*` already in `.gitignore`
- [x] Run `terraform apply` — all 4 rulesets created and active
- [x] Note: `~*-teaching` wildcard patterns don't work in org rulesets; using explicit repo names in a `locals` list instead

### 3. Verify

- [x] teaching-tooling: invalid branch name rejected (`test-bad-name`)
- [x] eoeeta-teaching: invalid branch name rejected (`test-bad-name-2`)
- [x] quillmedical: invalid branch name rejected (repo-level ruleset still works)
- [x] Confirm content repo PRs enforce status checks before merge (verified on eoeeta-teaching PR #2 and respiratory-teaching PR #2)

### 4. Consolidate to single pipeline workflow

Content repos currently have 3 workflow files (validate, deploy, auto-pr) that each call a separate teaching-tooling workflow. This tightly couples content repos to teaching-tooling's internal structure. Instead, each content repo should have ONE workflow file, and teaching-tooling should orchestrate everything internally.

**Architecture:**

- Content repo has a single `.github/workflows/teaching.yml` that calls `pipeline.yml@main`
- teaching-tooling's `pipeline.yml` uses `if:` conditions on `github.event_name` to dispatch:
  - `push` to `feature/**` → auto-create PR
  - `pull_request` → validate content + check branch protection
  - `push` to `main` → deploy to GCS

**Benefits:**

- Adding new CI concerns (e.g. check-protection) = adding a job to `pipeline.yml`. Zero content repo changes.
- Content repos are agnostic to what CI/CD is done upon them
- Onboarding = copy one file, change one line (`org_id`)

**Implementation:**

- [x] Create `pipeline.yml` reusable workflow in teaching-tooling (consolidates validate, deploy, auto-pr, check-protection)
- [x] Replace 3 workflow files in eoeeta-teaching with single `teaching.yml`
- [x] Replace 3 workflow files in respiratory-teaching with single `teaching.yml`
- [x] Update Terraform required status checks to match new context names (`pipeline / validate`, `pipeline / check-protection`)
- [x] Fix GITHUB_TOKEN limitation: run validate/check-protection on push to feature branches (same pattern as quillmedical branch-ci)
- [x] Fix teaching-tooling self-test trigger (push to feature branches, not just pull_request)

**Lessons learned:**

- Status check context for reusable workflows is `<caller_job> / <called_job>`, not `<workflow_name> / <caller_job> / <called_job>`
- `GITHUB_TOKEN`-created PR events don't trigger other workflows — run checks on push event instead
- GitHub's `~*-teaching` fnmatch pattern doesn't work in org rulesets; explicit repo names required

## Onboarding a new content repo

After this plan is implemented, onboarding a new organisation is:

1. Create `{org}-teaching` repo
2. Copy `.github/workflows/teaching.yml` from an existing content repo, change `org_id`
3. Add content under `modules/`
4. Add the repo name to `teaching_repos` in `teaching-tooling/infra/main.tf`
5. Run `terraform apply`
6. Push — branch protection is active, pipeline runs, and the self-check confirms it

No changes to quillmedical required.
