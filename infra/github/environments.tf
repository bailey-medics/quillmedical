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
# The environment every main-branch job that reaches GCP runs in: deploy.yml,
# terraform.yml and the scheduled jobs. It holds GCP_PROJECT_ID,
# GCP_WIF_PROVIDER, GCP_SERVICE_ACCOUNT and GCP_DEPLOY_SERVICE_ACCOUNT, named
# without the environment, so a matrix job reads `secrets.GCP_PROJECT_ID` and
# the environment decides which project that is. An index such as
# `secrets[format('GCP_{0}_...')]` would send the runner every repository
# secret, which zizmor's overprovisioned-secrets check refuses.

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
# branch can reach is a read.
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
# Holds back a breaking API change that was not declared, which `oasdiff`
# finds in CI, until someone approves it as a separate, deliberate step. See
# docs/docs/backend/api-compatibility.md.
#
# `prevent_self_review = false`: the author may approve. A second reviewer is
# not more careful than the person accountable for the change; the point is
# one genuine action from them.
#
# `can_admins_bypass = false`, as for db_destructive_migration_review below:
# an admin is not the role to wave a breaking change through, and the two
# gates should be equally binding.
#
# No deployment_branch_policy: this gates a CI job on pull requests, not a
# deployment, so it is not restricted to a branch.

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
# Holds back a new migration that drops a column, table or constraint, which
# check_migrations.py --report-destructive finds in CI, until someone
# approves it. The `# migration-check: allow-destructive` marker cannot do
# this alone: the migration's author writes it, so it proves only that the
# comment exists, not that anyone weighed losing clinical audit history. An
# approval is the one thing nothing in the diff can produce.
#
# `prevent_self_review = false`, as for api_breaking_change_review above: the
# author may approve, since the point is one deliberate action from whoever
# is accountable.
#
# The reviewer is the same one api_breaking_change_review looks up.
#
# `can_admins_bypass = false` makes the gate binding. One person is both
# admin and reviewer today, The default, `true`, would let the wrong role
# wave it through.
#
# No deployment_branch_policy: this gates a CI job on pull requests, not a
# deployment, so it is not restricted to a branch.

resource "github_repository_environment" "db_destructive_migration_review" {
  repository          = var.github_repository
  environment         = "db-destructive-migration-review"
  prevent_self_review = false
  can_admins_bypass   = false

  reviewers {
    users = [data.github_user.api_breaking_change_reviewer.id]
  }
}
