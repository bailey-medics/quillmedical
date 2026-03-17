# modules/secrets/main.tf — Secret Manager secrets
#
# Terraform creates the secret *containers*. Actual secret values are set
# manually via `gcloud secrets versions add` or by CI — never in Terraform
# state.

resource "google_secret_manager_secret" "secrets" {
  for_each  = toset(var.secrets)
  project   = var.project_id
  secret_id = each.value

  replication {
    auto {}
  }
}
