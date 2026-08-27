# environments.tf — GitHub deployment environments
#
# This file manages GitHub deployment environments for the quillmedical
# repository. The Terraform, provider, and variable blocks are declared in
# branch_rules.tf and shared across this directory.
#
# Clinical safety context (DCB 0129):
#   Restricting the teaching environment to the main branch ensures that only
#   reviewed, merged changes can deploy, keeping the deployment record
#   traceable for change-control audits.
#
# Secret handling:
#   Secret VALUES are never managed here — they are set out-of-band via the
#   gh CLI (`gh secret set --env teaching ...`) so they never land in
#   terraform.tfstate. Terraform manages only the environment resource and its
#   deployment branch policy.
#
# Usage:
#   cd infra/github/
#   terraform plan -var-file=terraform.tfvars
#   terraform apply -var-file=terraform.tfvars
#
#   The teaching environment already exists (created manually). If apply
#   reports it already exists, import it first:
#     terraform import github_repository_environment.teaching quillmedical:teaching

# ---------------------------------------------------------------------------
# Teaching environment — deployable from main only
# ---------------------------------------------------------------------------

resource "github_repository_environment" "teaching" {
  repository  = var.github_repository
  environment = "teaching"

  deployment_branch_policy {
    protected_branches     = false
    custom_branch_policies = true
  }
}

resource "github_repository_environment_deployment_policy" "teaching_main" {
  repository     = var.github_repository
  environment    = github_repository_environment.teaching.environment
  branch_pattern = "main"
}

# ---------------------------------------------------------------------------
# API breaking-change review environment — required-reviewer approval gate
# ---------------------------------------------------------------------------
#
# API compatibility context (item 15 of the alembic review plan, see
# docs/docs/backend/api-compatibility.md):
#   Gates an undeclared breaking API change (detected by `oasdiff` in CI)
#   behind one deliberate, separate approval action from the change's own
#   author. `prevent_self_review = false` is intentional, not an oversight —
#   a second reviewer is not inherently more careful than the person who
#   wrote the change, so the goal is forcing one genuine action out of
#   whoever is accountable, not diffusing accountability across more people.
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

  reviewers {
    users = [data.github_user.api_breaking_change_reviewer.id]
  }
}

# ---------------------------------------------------------------------------
# Destructive DB migration review environment — required-reviewer approval gate
# ---------------------------------------------------------------------------
#
# Destructive migration context (see
# docs/docs/plans/2026-08-25-db-destructive-migration-review-plan.md):
#   Gates a newly-added migration that drops a column, table, or constraint
#   (detected by check_migrations.py --report-destructive in CI) behind one
#   deliberate approval action. The existing
#   `# migration-check: allow-destructive` marker is self-attested — whoever
#   writes the migration adds the comment themself, so it proves the comment
#   exists, not that anyone weighed the cost of discarding clinical audit
#   history. This environment supplies the part the marker cannot: an action
#   nothing in the diff can produce.
#
#   `prevent_self_review = false` is intentional, matching
#   api_breaking_change_review above — a second reviewer is not inherently
#   more careful than the person who wrote the migration, so the goal is
#   forcing one genuine, separate, deliberate action out of whoever is
#   accountable, not diffusing accountability across more people.
#
#   The reviewer is reused from api_breaking_change_review rather than looked
#   up a second time: same person, same accountability, one data source.
#
# No deployment_branch_policy: this environment gates a CI job that runs on
# pull requests, not a deployment, so it is not restricted to a branch.

resource "github_repository_environment" "db_destructive_migration_review" {
  repository          = var.github_repository
  environment         = "db-destructive-migration-review"
  prevent_self_review = false

  reviewers {
    users = [data.github_user.api_breaking_change_reviewer.id]
  }
}
