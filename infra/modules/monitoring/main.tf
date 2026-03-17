# modules/monitoring/main.tf — Uptime checks + alerting
#
# Creates an HTTPS uptime check on /api/health for each monitored
# hostname, plus a single alert policy that fires when any check fails.

# ---------- Notification channel (email) ----------
resource "google_monitoring_notification_channel" "email" {
  project      = var.project_id
  display_name = "Quill alerts (${var.environment})"
  type         = "email"

  labels = {
    email_address = var.alert_email
  }
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

  notification_channels = [
    google_monitoring_notification_channel.email.id,
  ]

  alert_strategy {
    auto_close = "1800s" # 30 minutes
  }
}
