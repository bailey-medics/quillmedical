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

# ---------- Notification channel (SMS) ----------
#
# Tier two of the escalation. Google's own documentation warns that SMS
# "isn't a fully reliable notification channel type" and may be unavailable
# in some regions, so it escalates the first tier rather than replacing it.
#
# The number must be verified by code in the Cloud console before it will
# deliver anything: Terraform can create the channel but cannot verify it.
resource "google_monitoring_notification_channel" "sms" {
  count = var.alert_sms_number != "" ? 1 : 0

  project      = var.project_id
  display_name = "Quill SMS alerts (${var.environment})"
  type         = "sms"

  labels = {
    number = var.alert_sms_number
  }
}

locals {
  # Tier one: cheap, ignorable, often self-resolving.
  notification_channels = concat(
    [google_monitoring_notification_channel.email.id],
    [for ch in google_monitoring_notification_channel.slack : ch.id],
  )

  # Tier two: reserved for a failure that has persisted long enough to be
  # real.
  #
  # SMS is paired with email rather than used alone, for two reasons. Google
  # documents SMS as "not a fully reliable notification channel type", so an
  # escalation resting on it alone can fail silently. And Google further
  # documents that Slack, PagerDuty, webhooks and the Cloud mobile app are all
  # delivered by one internal service and share a single point of failure,
  # with email or Pub/Sub as the recommended redundant path — so tier one's
  # Slack rung is not independent cover either. Email is the redundancy.
  escalation_channels = concat(
    [for ch in google_monitoring_notification_channel.sms : ch.id],
    [google_monitoring_notification_channel.email.id],
  )
}

# ---------- Uptime checks (one per hostname) ----------
resource "google_monitoring_uptime_check_config" "health" {
  for_each = toset(var.monitored_hostnames)

  project      = var.project_id
  display_name = "Health — ${each.key}"
  timeout      = "10s"

  # 1 minute. Executions bill at frequency x target x region against a free
  # allowance of 1M/month; two hostnames from all regions is ~518k, about
  # half of it. If a fourth hostname is added, pin selected_regions rather
  # than slowing the checks back down — detection lag matters more.
  period = "60s"

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
          alignment_period     = "1200s"
          per_series_aligner   = "ALIGN_NEXT_OLDER"
          cross_series_reducer = "REDUCE_COUNT_FALSE"
          group_by_fields      = ["resource.label.project_id", "resource.label.host"]
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

# ---------- Alert policy — sustained outage, escalated ----------
#
# Tier two. Same condition as the policy above, but it only fires once the
# outage has lasted var.escalation_duration, and it notifies the louder
# channel. A blip that resolves itself never reaches this.
#
# Tier three would be a phone call. No provider offers voice on a free plan
# (Better Stack: email and Slack only, phone from $29 per responder per
# month; PagerDuty: no voice on free, from $21 per user per month), so it is
# deferred until there are clinical users to justify the subscription. See
# docs/docs/plans/2026-08-31-analytics-plan.md.
resource "google_monitoring_alert_policy" "uptime_escalation" {
  count = var.alert_sms_number != "" ? 1 : 0

  project      = var.project_id
  display_name = "Uptime failure — sustained (${var.environment})"
  combiner     = "OR"

  dynamic "conditions" {
    for_each = google_monitoring_uptime_check_config.health
    content {
      display_name = "Still failing: ${conditions.value.display_name}"

      condition_threshold {
        filter          = "resource.type = \"uptime_url\" AND metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.labels.check_id = \"${conditions.value.uptime_check_id}\""
        comparison      = "COMPARISON_GT"
        threshold_value = 1
        duration        = var.escalation_duration

        aggregations {
          alignment_period     = "1200s"
          per_series_aligner   = "ALIGN_NEXT_OLDER"
          cross_series_reducer = "REDUCE_COUNT_FALSE"
          group_by_fields      = ["resource.label.project_id", "resource.label.host"]
        }

        trigger {
          count = 1
        }
      }
    }
  }

  notification_channels = local.escalation_channels

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

# ---------- Alert policy — backend 5xx responses ----------
#
# The uptime check above only proves that /api/health answers. A service
# that starts cleanly, passes the health check, and then fails every real
# endpoint raises nothing at all without this policy — and that is the
# failure a clinician actually runs into.
resource "google_monitoring_alert_policy" "server_errors" {
  count = length(var.cloud_run_services) > 0 ? 1 : 0

  project      = var.project_id
  display_name = "Server errors — 5xx (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = "Cloud Run 5xx responses"

    condition_threshold {
      filter = join(" AND ", [
        "resource.type = \"cloud_run_revision\"",
        "metric.type = \"run.googleapis.com/request_count\"",
        "metric.labels.response_code_class = \"5xx\"",
        "(${join(" OR ", [for s in var.cloud_run_services : "resource.labels.service_name = \"${s}\""])})",
      ])

      comparison      = "COMPARISON_GT"
      threshold_value = var.server_error_threshold
      duration        = "0s"

      # request_count is a DELTA metric, so ALIGN_SUM over the alignment
      # period reads as "this many 5xx responses in five minutes" rather
      # than a rate per second, which is far easier to pick a threshold
      # against at low traffic.
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["resource.label.service_name"]
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = local.notification_channels

  # No notification_rate_limit here. Google rejects it on anything but a
  # log-based policy: "only log-based alert policies may specify a
  # notification rate limit". The cloud_run_startup policy above may use one
  # because it matches log entries; this one is a metric threshold.
  alert_strategy {
    auto_close = "1800s" # 30 minutes
  }
}
