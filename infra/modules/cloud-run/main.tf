# modules/cloud-run/main.tf — Cloud Run service

resource "google_cloud_run_v2_service" "service" {
  project  = var.project_id
  name     = "quill-${var.service_name}-${var.environment}"
  location = var.region
  ingress  = var.ingress

  template {
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    vpc_access {
      connector = var.vpc_connector_id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    service_account = var.service_account_email != "" ? var.service_account_email : null

    max_instance_request_concurrency = var.concurrency

    containers {
      image = var.image

      ports {
        container_port = var.port
      }

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

      # Startup probe — give container time to boot
      startup_probe {
        http_get {
          path = var.health_check_path
        }
        initial_delay_seconds = 5
        period_seconds        = 10
        failure_threshold     = 3
      }

      # Liveness probe
      liveness_probe {
        http_get {
          path = var.health_check_path
        }
        period_seconds = 30
      }
    }
  }

  # Ensure at least one healthy revision before routing traffic
  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  # CI deploys images via `gcloud run services update`; don't revert them
  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
    ]
  }
}

# Allow unauthenticated access (public-facing via load balancer)
resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  name     = google_cloud_run_v2_service.service.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}
