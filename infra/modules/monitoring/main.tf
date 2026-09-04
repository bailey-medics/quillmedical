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
#
# Looked up rather than created. Terraform can create a webhook_token_auth
# channel, but Slack incoming webhooks expect a body shaped like
# {"text": "..."} while Cloud Monitoring sends its own alert JSON — a channel
# built that way looks configured and delivers nothing. The native slack type
# is the one that actually posts a readable message, and it needs an
# auth_token obtained through Slack's OAuth consent screen, which only the
# console flow can produce. Google's own descriptor marks that field
# obfuscated on read, so even importing it into state would show a masked
# value and drift on every subsequent plan.
#
# So the channel is created once by hand — see
# docs/docs/infrastructure/monitoring.md — and referenced here by
# display_name and type. Nothing about its lifecycle is managed by Terraform;
# deleting or renaming it in the console silently empties this data source.
data "google_monitoring_notification_channel" "slack" {
  count = var.slack_channel_display_name != "" ? 1 : 0

  project      = var.project_id
  type         = "slack"
  display_name = var.slack_channel_display_name
}

# ---------- Notification channel (PagerDuty) ----------
#
# Tier three, and the only thing PagerDuty is given: a major outage that has
# persisted. Tiers one and two stay entirely within Google Cloud.
#
# The narrow job is deliberate. PagerDuty is a new third party with no track
# record here, and routing every notification through it would make an
# untested dependency the single path to being told anything at all. Scoped
# this way, a failure on its side costs the phone call and nothing else.
#
# It also fills a gap Google cannot: Google documents Slack, webhooks and its
# own mobile app as sharing one internal delivery service, with email or
# Pub/Sub the only redundant path. An external pager sidesteps that entirely.
#
# service_key is the Events API v1 integration key. Google's own
# documentation calls for v1 specifically — the channel speaks the v1 event
# format, so a v2 routing key is the wrong shape.
resource "google_monitoring_notification_channel" "pagerduty" {
  count = var.pagerduty_service_key != "" ? 1 : 0

  project      = var.project_id
  display_name = "Quill on-call (${var.environment})"
  type         = "pagerduty"

  labels = {
    service_key = var.pagerduty_service_key
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
    [for ch in data.google_monitoring_notification_channel.slack : ch.id],
  )

  # Tier two: SMS, and nothing else.
  #
  # Email was here as well, for redundancy — Google documents SMS as "not a
  # fully reliable notification channel type". That held while tier one was
  # email alone. Now that tier one sends Slack and email, a second email at
  # fifteen minutes repeats a channel already used and adds nothing. Each tier
  # introduces a route the previous one did not: a text, then a call.
  #
  # The trade is explicit: if SMS fails silently, tier two delivers nothing,
  # and the backstop is tier three fifteen minutes later on another provider.
  escalation_channels = [for ch in google_monitoring_notification_channel.sms : ch.id]

  # Tier three: the phone call, and nothing else routed through it.
  critical_channels = [for ch in google_monitoring_notification_channel.pagerduty : ch.id]
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

  # Only the app host has an API to health-check. The public site is served
  # straight from a GCS bucket via a backend bucket and has no /api path at
  # all, so probing /api/health there returns 404 and the check fails
  # forever. That is exactly what it did: whole days at 0% passing, and an
  # incident that stayed open against a site which was perfectly healthy.
  #
  # A permanently-open false incident is worse than noise. Cloud Monitoring
  # notifies once per incident and will not open a second while the first is
  # open, so a genuine outage of the public site would have raised nothing
  # at all.
  http_check {
    path         = each.key == var.app_domain ? "/api/health" : "/"
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
# ---------- Alert policy — Cloud SQL disk filling ----------
#
# The failure that gives days of warning and still takes the service down if
# nobody is watching. Unlike an outage, there is no symptom until the disk is
# full and the database stops accepting writes.
resource "google_monitoring_alert_policy" "sql_disk" {
  project      = var.project_id
  display_name = "Cloud SQL disk filling (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = "Disk utilisation above threshold"

    condition_threshold {
      filter = join(" AND ", [
        "resource.type = \"cloudsql_database\"",
        "metric.type = \"cloudsql.googleapis.com/database/disk/utilization\"",
      ])

      comparison      = "COMPARISON_GT"
      threshold_value = var.sql_disk_threshold
      duration        = "1800s" # sustained for 30 minutes, not a momentary spike

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_MEAN"
        cross_series_reducer = "REDUCE_MAX"
        group_by_fields      = ["resource.label.database_id"]
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = local.notification_channels

  alert_strategy {
    auto_close = "86400s" # 24 hours: this does not resolve itself quickly
  }
}


# ---------- Alert policy — major outage, tier three ----------
#
# Fires only once an outage has lasted var.critical_duration, and notifies
# PagerDuty alone, which places the phone call. Tiers one and two have
# already been through Slack, email and SMS by this point, so anything
# reaching here has survived roughly half an hour of nobody acting on it.
#
# Only uptime feeds this. A 5xx spike or a filling disk is a problem, not a
# system that is down, and neither warrants a call at 3am.
resource "google_monitoring_alert_policy" "uptime_critical" {
  count = var.pagerduty_service_key != "" ? 1 : 0

  project      = var.project_id
  display_name = "Major outage — call the on-call (${var.environment})"
  combiner     = "OR"

  dynamic "conditions" {
    for_each = google_monitoring_uptime_check_config.health
    content {
      display_name = "Down for ${var.critical_duration}: ${conditions.value.display_name}"

      condition_threshold {
        filter          = "resource.type = \"uptime_url\" AND metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.labels.check_id = \"${conditions.value.uptime_check_id}\""
        comparison      = "COMPARISON_GT"
        threshold_value = 1
        duration        = var.critical_duration

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

  notification_channels = local.critical_channels

  alert_strategy {
    auto_close = "86400s" # 24 hours; a call-worthy outage is not a blip
  }
}
