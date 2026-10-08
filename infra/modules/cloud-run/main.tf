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

    dynamic "vpc_access" {
      for_each = var.vpc_connector_id != "" ? [1] : []
      content {
        connector = var.vpc_connector_id
        egress    = "PRIVATE_RANGES_ONLY"
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

  # CI deploys images via `gcloud run services update`; don't revert them
  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      # The deploy owns traffic: it tags a new revision, smoke-tests it and
      # promotes that revision by name. The traffic block above only sets
      # the initial state when the service is created. Managed here as
      # well, every apply rewrote it to 100% of the newest revision, which
      # on 2026-09-23 wiped a running deploy's tag and put an untested
      # revision live. See .github/scripts/deploy/deploy-tagged.sh.
      traffic,
      # Set by `gcloud run deploy` on every release: gcloud stamps its own
      # name and version. Terraform never sets them, so without this every
      # apply cleared both and showed the service as changed when nothing
      # had.
      client,
      client_version,
      # `template[0].revision` is deliberately NOT here, though the deploy
      # sets that too. It was, from 2026-09-24, to stop each apply clearing
      # the name and creating a spare revision. But ignoring a field does
      # not leave it out of the request: Terraform sends back the name it
      # last read, which is the revision the deploy just made. Any change
      # to the template - an environment variable, a label - then asks
      # Cloud Run for that same name with a different configuration, and it
      # refuses: "Error 409: Revision named '…' with different
      # configuration already exists". That failed the apply on 2026-09-28
      # and again on 2026-10-02, when it left CORS_ORIGINS unset. See
      # hashicorp/terraform-provider-google issue 14569.
      #
      # So the name is cleared on every apply and Cloud Run picks a new
      # one. The cost is what the ignore was added to avoid: each apply
      # shows the service as changed and creates one spare revision. The
      # spare serves nothing, because the deploy pins traffic to the
      # revision it tested and `traffic` is ignored above. A setting
      # changed here goes live on the first deploy after the apply.
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
