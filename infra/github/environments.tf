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
