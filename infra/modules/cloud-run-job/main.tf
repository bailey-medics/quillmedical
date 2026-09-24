# modules/cloud-run-job/main.tf — Cloud Run Job for one-off admin tasks

resource "google_cloud_run_v2_job" "job" {
  project  = var.project_id
  name     = "quill-${var.job_name}-${var.environment}"
  location = var.region

  template {
    # Max retries: don't re-run failed admin operations
    task_count  = 1
    parallelism = 1

    template {
      timeout     = var.timeout
      max_retries = 0

      # Null falls back to the default Compute Engine account, which is what
      # every job ran as before infra/runtime-identities.tf.
      service_account = var.service_account_email != "" ? var.service_account_email : null

      vpc_access {
        connector = var.vpc_connector_id
        egress    = var.vpc_egress
      }

      containers {
        image = var.image

        resources {
          limits = {
            cpu    = var.cpu
            memory = var.memory
          }
        }

        # Static environment variables
        dynamic "env" {
          for_each = var.env_vars
          content {
            name  = env.key
            value = env.value
          }
        }

        # Environment variables from Secret Manager
        dynamic "env" {
          for_each = var.secret_env_vars
          content {
            name = env.key
            value_source {
              secret_key_ref {
                secret  = env.value
                version = "latest"
              }
            }
          }
        }
      }
    }
  }

  # CI may update the image; don't revert on next terraform apply
  lifecycle {
    ignore_changes = [
      template[0].template[0].containers[0].image,
      # Stamped by `gcloud run jobs update` on every deploy and never set
      # here, so every apply cleared them and reported a change that was not
      # one. See the same list in modules/cloud-run.
      client,
      client_version,
    ]
  }
}
