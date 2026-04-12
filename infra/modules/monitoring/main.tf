# modules/monitoring/main.tf — Uptime checks + alerting
#
# Creates an HTTPS uptime check on /api/health for each monitored
# hostname, plus alert policies that fire on uptime failures and
# Cloud Run container startup failures.

# ---------- Notification channel (email) ----------
resource "google_monitoring_notification_channel" "email" {
  project      = var.project_id
  display_name = "Quill alerts (${var.environment})"
  type         = "email"

  labels = {
    email_address = var.alert_email
  }
}

# ---------- Notification channel (Slack) ----------
resource "google_monitoring_notification_channel" "slack" {
  count = var.slack_webhook_url != "" ? 1 : 0

  project      = var.project_id
  display_name = "Quill Slack alerts (${var.environment})"
  type         = "webhook_token_auth"

  labels = {
    url = var.slack_webhook_url
  }
}

locals {
  notification_channels = concat(
    [google_monitoring_notification_channel.email.id],
    [for ch in google_monitoring_notification_channel.slack : ch.id],
  )
}

# ---------- Uptime checks (one per hostname) ----------
resource "google_monitoring_uptime_check_config" "health" {
  for_each = toset(var.monitored_hostnames)

  project      = var.project_id
  display_name = "Health — ${each.key}"
  timeout      = "10s"
  period       = "300s" # 5 minutes (free tier)

  http_check {
    path         = "/api/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = each.key
    }
  }
}

# ---------- Alert policy — fires when any check fails ----------
resource "google_monitoring_alert_policy" "uptime" {
  project      = var.project_id
  display_name = "Uptime failure (${var.environment})"
  combiner     = "OR"

  dynamic "conditions" {
    for_each = google_monitoring_uptime_check_config.health
    content {
      display_name = "Uptime check failed: ${conditions.value.display_name}"

      condition_threshold {
        filter          = "resource.type = \"uptime_url\" AND metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.labels.check_id = \"${conditions.value.uptime_check_id}\""
        comparison      = "COMPARISON_GT"
        threshold_value = 1
        duration        = "300s"

        aggregations {
          alignment_period   = "1200s"
          per_series_aligner = "ALIGN_NEXT_OLDER"
          cross_series_reducer = "REDUCE_COUNT_FALSE"
          group_by_fields    = ["resource.label.project_id", "resource.label.host"]
        }

        trigger {
          count = 1
        }
      }
    }
  }

  notification_channels = local.notification_channels

  alert_strategy {
    auto_close = "1800s" # 30 minutes
  }
}

# ---------- Alert policy — Cloud Run container startup failures ----------
resource "google_monitoring_alert_policy" "cloud_run_startup" {
  count = length(var.cloud_run_services) > 0 ? 1 : 0

  project      = var.project_id
  display_name = "Cloud Run startup failure (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = "Container startup failed"

    condition_matched_log {
      filter = <<-EOT
        resource.type = "cloud_run_revision"
        (${join(" OR ", [for s in var.cloud_run_services : "resource.labels.service_name = \"${s}\""])})
        (textPayload =~ "failed the configured startup probe"
          OR textPayload =~ "Container called exit")
      EOT
    }
  }

  notification_channels = local.notification_channels

  alert_strategy {
    auto_close = "1800s" # 30 minutes
    notification_rate_limit {
      period = "300s" # At most one notification per 5 minutes
    }
  }
}
