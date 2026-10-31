# environments.tf - GitHub deployment environments
#
# This file manages GitHub deployment environments for the quillmedical
# repository. The Terraform, provider, and variable blocks are declared in
# branch_rules.tf and shared across this directory.
#
# Clinical safety context (DCB 0129):
#   Restricting the app environment to the main branch ensures that only
#   reviewed, merged changes can deploy, keeping the deployment record
#   traceable for change-control audits.
#
# Secret handling:
#   Secret VALUES are never managed here - they are set out-of-band via the
#   gh CLI (`gh secret set --env app ...`) so they never land in
#   terraform.tfstate. Terraform manages only the environment resource and its
#   deployment branch policy.
#
# Usage:
#   cd infra/github/
#   terraform plan -var-file=terraform.tfvars
#   terraform apply -var-file=terraform.tfvars
#
#   State is remote (see the backend block in branch_rules.tf), so plan and
#   apply from any checkout with `just terraform-github`.

# ---------------------------------------------------------------------------
# App environment - deployable from main only
# ---------------------------------------------------------------------------
#
# The environment every main-branch job that reaches GCP runs in: deploy.yml
# and terraform.yml, and the scheduled jobs. It holds GCP_PROJECT_ID,
# GCP_WIF_PROVIDER, GCP_SERVICE_ACCOUNT and GCP_DEPLOY_SERVICE_ACCOUNT, named
# without the environment so a matrix job reads `secrets.GCP_PROJECT_ID` and
# the environment decides which project that is. An index such as
# `secrets[format('GCP_{0}_...')]` would send the runner every repository
# secret, which zizmor's overprovisioned-secrets refuses. It replaced `teaching` here on 2026-09-25:
# teaching's project had been deleted, and its main-only policy had drifted
# away in GitHub while app's had been set by hand, outside Terraform. Imported
# rather than created, so the live policy was adopted, not replaced. See
# Batch 10a Phase 4 of
# docs/docs/plans/2026-09-18-environment-isolation-and-iap-plan.md.

resource "github_repository_environment" "app" {
  repository  = var.github_repository
  environment = "app"

  deployment_branch_policy {
    protected_branches     = false
    custom_branch_policies = true
  }
}

resource "github_repository_environment_deployment_policy" "app_main" {
  repository     = var.github_repository
  environment    = github_repository_environment.app.environment
  branch_pattern = "main"
}

# ---------------------------------------------------------------------------
# App plan environment - the read-only account, for pull requests
# ---------------------------------------------------------------------------
#
# Holds GCP_WIF_PROVIDER and GCP_PLAN_SERVICE_ACCOUNT only: the account that
# can read the app project and write nothing. terraform.yml's plan job and
# ci.yml's teaching content sweep run in it, on pull requests from any branch,
# with `deployment: false`, so it records no deployments.
#
# Kept apart from `app` on purpose. `app` takes main only, so a pull request
# cannot run in it; and opening `app` to every branch would hand the apply
# and deploy accounts to any branch somebody can push. Here the worst a
# branch can reach is a read. See Phase 6 of
# docs/docs/plans/2026-10-30-claude-security-plugin-plan.md.
#
# No deployment_branch_policy: every branch may use it, which is the point.

resource "github_repository_environment" "app_plan" {
  repository  = var.github_repository
  environment = "app-plan"
}

# ---------------------------------------------------------------------------
# API breaking-change review environment - required-reviewer approval gate
# ---------------------------------------------------------------------------
#
# API compatibility context (item 15 of the alembic review plan, see
# docs/docs/backend/api-compatibility.md):
#   Gates an undeclared breaking API change (detected by `oasdiff` in CI)
#   behind one deliberate, separate approval action from the change's own
#   author. `prevent_self_review = false` is intentional, not an oversight -
#   a second reviewer is not inherently more careful than the person who
#   wrote the change, so the goal is forcing one genuine action out of
#   whoever is accountable, not diffusing accountability across more people.
#
#   `can_admins_bypass = false` for the same reason as
#   db_destructive_migration_review below: an admin is not necessarily the
#   role that should be able to wave a breaking change through, and the two
#   gates should not differ in how binding they are.
#
# No deployment_branch_policy: this environment gates a CI job that runs on
# pull requests, not a deployment, so it is not restricted to a branch.

data "github_user" "api_breaking_change_reviewer" {
  username = "Cotswoldsmaker"
}

resource "github_repository_environment" "api_breaking_change_review" {
  repository          = var.github_repository
  environment         = "api-breaking-change-review"
  prevent_self_review = false
  can_admins_bypass   = false

  reviewers {
    users = [data.github_user.api_breaking_change_reviewer.id]
  }
}

# ---------------------------------------------------------------------------
# Destructive DB migration review environment - required-reviewer approval gate
# ---------------------------------------------------------------------------
#
# Destructive migration context (see
# docs/docs/plans/2026-08-25-db-destructive-migration-review-plan.md):
#   Gates a newly-added migration that drops a column, table, or constraint
#   (detected by check_migrations.py --report-destructive in CI) behind one
#   deliberate approval action. The existing
#   `# migration-check: allow-destructive` marker is self-attested - whoever
#   writes the migration adds the comment themself, so it proves the comment
#   exists, not that anyone weighed the cost of discarding clinical audit
#   history. This environment supplies the part the marker cannot: an action
#   nothing in the diff can produce.
#
#   `prevent_self_review = false` is intentional, matching
#   api_breaking_change_review above - a second reviewer is not inherently
#   more careful than the person who wrote the migration, so the goal is
#   forcing one genuine, separate, deliberate action out of whoever is
#   accountable, not diffusing accountability across more people.
#
#   The reviewer is reused from api_breaking_change_review rather than looked
#   up a second time: same person, same accountability, one data source.
#
#   `can_admins_bypass = false` is deliberate and is what makes this gate
#   binding rather than advisory. Today the sole admin and the sole reviewer
#   are the same person, so the setting looks redundant - but the roles are
#   expected to diverge: a Clinical Safety Officer with coding experience is
#   the right approver for discarding clinical audit history, whereas a repo
#   admin may have minimal clinical experience. Leaving the default (`true`)
#   would let exactly the wrong role wave the change through. Set now, while
#   it costs nothing, rather than after the roles have split.
#
# No deployment_branch_policy: this environment gates a CI job that runs on
# pull requests, not a deployment, so it is not restricted to a branch.

resource "github_repository_environment" "db_destructive_migration_review" {
  repository          = var.github_repository
  environment         = "db-destructive-migration-review"
  prevent_self_review = false
  can_admins_bypass   = false

  reviewers {
    users = [data.github_user.api_breaking_change_reviewer.id]
  }
}
