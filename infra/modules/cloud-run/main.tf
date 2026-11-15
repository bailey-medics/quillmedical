# modules/cloud-run/main.tf - Cloud Run service

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

    # Direct VPC egress: an address on the subnet, no connector in between.
    dynamic "vpc_access" {
      for_each = var.vpc_subnetwork_id != "" ? [1] : []
      content {
        egress = "PRIVATE_RANGES_ONLY"

        network_interfaces {
          subnetwork = var.vpc_subnetwork_id
        }
      }
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
        startup_cpu_boost = true
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

      # Startup probe - give container time to boot
      startup_probe {
        http_get {
          path = var.health_check_path
          port = var.port
        }
        initial_delay_seconds = 10
        timeout_seconds       = 10
        period_seconds        = 10
        failure_threshold     = 6
      }

      # Liveness probe
      liveness_probe {
        http_get {
          path = var.health_check_path
          port = var.port
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

  # The deploy, not Terraform, owns these settings after the service is
  # created. Without this, every apply would undo the latest deploy.
  lifecycle {
    ignore_changes = [
      # Do not add template[0].revision here. Terraform would then send the
      # deploy's revision name back with any new setting, and Cloud Run
      # refuses that with "Error 409: Revision named ... already exists".
      # Leaving it out costs one unused revision per apply, which serves no
      # traffic. A setting changed here goes live at the next deploy.
      # See hashicorp/terraform-provider-google issue 14569.

      # The deploy puts each new release's image in place.
      template[0].containers[0].image,

      # The deploy sends traffic to a release only after testing it (see
      # .github/scripts/deploy/deploy-tagged.sh). Terraform would send it
      # all to the newest revision, tested or not.
      traffic,

      # gcloud writes its own name and version on every deploy. Terraform
      # never sets them, so it would clear them and report a change.
      client,
      client_version,
    ]
  }
}

# Browsers carry no Google identity token, so Cloud Run's own token
# check is switched off. Quill's sign-in protects the app, and ingress
# admits only the load balancer.
resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  name     = google_cloud_run_v2_service.service.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}
