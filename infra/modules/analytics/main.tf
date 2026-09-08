# modules/analytics/main.tf — Usage metrics, archive, and the one dashboard
#
# Answers three questions from data Google Cloud already holds, with no
# third-party analytics processor anywhere and nothing stored on a user's
# device:
#
#   1. Where are things going wrong  — alert policies live in the monitoring
#      module; the charts live here so there is a single dashboard to open.
#   2. How many people visit the public site — load-balancer request logs.
#      Backend-bucket logging on an external load balancer is automatic and
#      cannot be disabled, so the landing site is already logged.
#   3. How many people visit each page of the app — a log-based metric over
#      the page-view pings, added when that endpoint exists.
#
# See docs/docs/plans/2026-08-31-analytics-plan.md.

locals {
  # Escape dots for the log filter regex without backslash-in-HCL escaping:
  # "quill-medical.com" becomes "quill-medical[.]com".
  landing_domain_pattern = replace(var.landing_domain, ".", "[.]")
  app_domain_pattern     = replace(var.app_domain, ".", "[.]")

  # Crawlers, and Google's own uptime and health-check agents, are traffic
  # but they are not visitors. Excluded at the filter so no chart has to
  # remember to exclude them.
  non_visitor_agents = "(?i)(bot|crawler|spider|slurp|GoogleHC|GoogleStackdriverMonitoring)"
}

# ---------- Public site visits ----------
resource "google_logging_metric" "public_site_visits" {
  project = var.project_id
  name    = "quill/public_site_visits_${var.environment}"

  description = "Requests to the public marketing site, excluding bots and health checks"

  # Successful responses only. Besides being the right definition of a visit,
  # this keeps scanner traffic out of the page label below: probes for
  # /wp-admin and friends return 404, so they never become a time series.
  filter = <<-EOT
    resource.type="http_load_balancer"
    httpRequest.requestUrl =~ "//(www[.])?${local.landing_domain_pattern}/"
    httpRequest.status = 200
    NOT httpRequest.userAgent =~ "${local.non_visitor_agents}"
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"

    labels {
      key         = "page"
      value_type  = "STRING"
      description = "Request path, without query string"
    }
  }

  # The page label is what makes this metric worth keeping for years: it
  # carries per-page visit counts with no IP address and no other personal
  # data, so it can be retained far longer than the raw rows below.
  label_extractors = {
    "page" = "REGEXP_EXTRACT(httpRequest.requestUrl, \"^https?://[^/]+(/[^?]*)\")"
  }
}

# ---------- Page views ----------
#
# Which pages of the application get used. The third of the three questions,
# and the only one needing the application's own cooperation: nothing at the
# load balancer can tell one screen of a single-page application from another,
# because navigating between them makes no request.
#
# Counts sessions rather than people. The browser sends a random per-page-load
# identifier held in memory, so a metric can say "this many visits" without
# anything here knowing who made them.

resource "google_logging_metric" "page_views" {
  project = var.project_id
  name    = "quill/page_views_${var.environment}"

  description = "Pages opened in the application, by route pattern, counted per session rather than per person"

  filter = <<-EOT
    resource.type="cloud_run_revision"
    jsonPayload."@type"="quill.analytics.PageView"
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"

    labels {
      key         = "page"
      value_type  = "STRING"
      description = "Matched route pattern, such as /patients/:id — never a resolved URL"
    }
  }

  # One label, bounded and holding nothing personal: `page` is one of the
  # router's sixty-three patterns, with every captured value already replaced
  # by the name that captured it. That is what makes this safe to keep for
  # years, in the way the raw request rows are not.
  #
  # There is deliberately no "signed in" label. Page tracking runs only inside
  # `RequireAuth`, so such a label would read true every time — and a label
  # that cannot vary is not a measurement, it is a claim the dashboard would
  # be unable to honour.
  #
  # Clinical routes never reach here at all — the browser declines to send
  # them — so this metric cannot show how often a patient record was opened,
  # by design and not by omission.
  label_extractors = {
    "page" = "EXTRACT(jsonPayload.page)"
  }
}

# ---------- Client errors ----------
#
# Browser error reports, as counted from the log entries the ingest endpoint
# writes. Cloud Error Reporting is the right place to read an individual
# fault — it groups them and shows the stack — but it is a separate console,
# and the dashboard is meant to be the one bookmark. What the dashboard owes
# is the count, so a rising line is visible beside the uptime check without
# having to remember to look somewhere else.
#
# This is also the counter the alerting policy thresholds on, so it is defined
# once and serves both.

resource "google_logging_metric" "client_errors" {
  project = var.project_id
  name    = "quill/client_errors_${var.environment}"

  description = "Browser error reports received from the application, by where they were caught and which screen they happened on"

  # Matches on the Error Reporting type marker rather than on severity, so it
  # counts reports specifically and not every ERROR line the backend writes.
  # The service label keeps browser errors separate from backend ones, which
  # share the same log stream.
  filter = <<-EOT
    resource.type="cloud_run_revision"
    jsonPayload."@type"="type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent"
    jsonPayload.serviceContext.service="quill-frontend"
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"

    labels {
      key         = "source"
      value_type  = "STRING"
      description = "Where the error was caught: boundary, window or unhandledrejection"
    }

    labels {
      key         = "route"
      value_type  = "STRING"
      description = "Matched route pattern the error happened on, never a resolved URL"
    }
  }

  # Both labels are bounded and carry nothing personal. `source` is one of
  # three fixed values. `route` is a matched pattern such as /patients/:id,
  # which the browser builds from the router's own parameters, so an
  # identifier is never in it — that is what makes this safe to retain for
  # years, in the way the raw rows are not.
  label_extractors = {
    "source" = "EXTRACT(jsonPayload.error_source)"
    "route"  = "EXTRACT(jsonPayload.context.httpRequest.url)"
  }
}

# ---------- App page loads ----------
#
# The nearest thing to "how many people use the app" that is available
# without touching application code. It counts successful non-API requests
# to the app host — that is, loads of the single-page application shell,
# which a browser fetches once per visit rather than once per click.
#
# It is a proxy, not a headcount. It cannot distinguish two visits by one
# person from one visit by two, because nothing identifies the visitor and
# deliberately so. Phase 3's page-view ping, with its per-session random
# identifier, is what turns this into sessions.
resource "google_logging_metric" "app_page_loads" {
  project = var.project_id
  name    = "quill/app_page_loads_${var.environment}"

  description = "Loads of the application shell, excluding API calls, bots and health checks"

  filter = <<-EOT
    resource.type="http_load_balancer"
    httpRequest.requestUrl =~ "//${local.app_domain_pattern}/"
    NOT httpRequest.requestUrl =~ "//${local.app_domain_pattern}/api/"
    httpRequest.status = 200
    NOT httpRequest.userAgent =~ "${local.non_visitor_agents}"
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}

# ---------- Archive ----------
#
# The dashboard reads metrics, which are aggregates fixed at the moment they
# are defined and cannot be re-sliced afterwards. This dataset keeps the raw
# rows so a recent question nobody thought to define a metric for is still
# answerable. Nothing routinely reads it.
#
# Retention is deliberately short. Load-balancer request logs contain
# httpRequest.remoteIp, and there is no way to strip a field from them at
# ingest — Cloud Logging sinks route entries, they do not redact them. Keeping
# client IP addresses for a year to count visits to a marketing site would be
# disproportionate, so the raw rows expire quickly and the long-run trend comes
# from the log-based metric above, which stores no IP at all.
resource "google_bigquery_dataset" "analytics" {
  project    = var.project_id
  dataset_id = "quill_analytics_${var.environment}"
  location   = var.dataset_location

  description = "Raw public-site request logs, short-lived because they contain client IP addresses. No patient data."

  # Partition expiry, not table expiry. The sink writes one partitioned table
  # and keeps appending to it, so a *table* expiration would delete the whole
  # thing — recent data included — on the anniversary of its creation, rather
  # than rolling old days off the back. Partition expiry gives the rolling
  # window that was actually intended.
  default_partition_expiration_ms = var.retention_days * 24 * 60 * 60 * 1000

  labels = {
    environment = var.environment
    contains    = "no-phi"
  }
}

resource "google_logging_project_sink" "analytics" {
  project = var.project_id
  name    = "quill-analytics-${var.environment}"

  destination = "bigquery.googleapis.com/projects/${var.project_id}/datasets/${google_bigquery_dataset.analytics.dataset_id}"

  # Public marketing site only — the same scoping as the metric above, and it
  # matters far more here.
  #
  # An unscoped "resource.type=http_load_balancer" filter would archive every
  # request to the authenticated app as well, and app request URLs carry
  # identifiers in the path: /api/patients/{patient_id}/letters,
  # /api/users/{user_id}. Storing those, next to client IP addresses, would
  # break the plan's most important control — no raw URLs from the
  # authenticated app — using the very pipeline built to honour it.
  #
  # Application logs are likewise not routed here: they may carry context
  # analytics has no business retaining.
  filter = <<-EOT
    resource.type="http_load_balancer"
    httpRequest.requestUrl =~ "//(www[.])?${local.landing_domain_pattern}/"
  EOT

  unique_writer_identity = true

  bigquery_options {
    use_partitioned_tables = true
  }
}

resource "google_bigquery_dataset_iam_member" "sink_writer" {
  project    = var.project_id
  dataset_id = google_bigquery_dataset.analytics.dataset_id
  role       = "roles/bigquery.dataEditor"
  member     = google_logging_project_sink.analytics.writer_identity
}

# ---------- The dashboard ----------
#
# One place to look. Deliberately outside the application: a dashboard inside
# Quill would be unavailable during exactly the incident it exists to report.
resource "google_monitoring_dashboard" "quill" {
  project = var.project_id

  dashboard_json = jsonencode({
    displayName = "Quill — health and usage (${var.environment})"
    gridLayout = {
      # A string, not the number it looks like. `columns` is an int64 in the
      # Monitoring API, and the proto3 JSON mapping encodes 64-bit integers as
      # strings — so the API stores and returns "2" however it is sent.
      #
      # That mismatch was the sole cause of this dashboard appearing in every
      # plan as changed when nothing had changed. The provider's diff
      # suppression strips fields the API adds — `etag` and the `targetAxis`
      # it fills in — and then compares what remains with reflect.DeepEqual,
      # which is strict about types: 2 and "2" are not equal, and one
      # inequality anywhere renders the whole resource as drifting.
      #
      # Worth keeping because a plan is only worth reading if a clean one
      # means something.
      columns = "2"
      widgets = [
        {
          title = "Uptime check passing"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = join(" AND ", [
                    "resource.type = \"uptime_url\"",
                    "metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\"",
                  ])
                  aggregation = {
                    alignmentPeriod    = "300s"
                    perSeriesAligner   = "ALIGN_FRACTION_TRUE"
                    crossSeriesReducer = "REDUCE_MEAN"
                    groupByFields      = ["resource.label.host"]
                  }
                }
              }
              plotType = "LINE"
            }]
          }
        },
        {
          title = "Server errors (5xx)"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = join(" AND ", [
                    "resource.type = \"cloud_run_revision\"",
                    "metric.type = \"run.googleapis.com/request_count\"",
                    "metric.labels.response_code_class = \"5xx\"",
                  ])
                  aggregation = {
                    alignmentPeriod    = "300s"
                    perSeriesAligner   = "ALIGN_SUM"
                    crossSeriesReducer = "REDUCE_SUM"
                    groupByFields      = ["resource.label.service_name"]
                  }
                }
              }
              plotType = "STACKED_BAR"
            }]
          }
        },
        {
          title = "Public site visits"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type = \"logging.googleapis.com/user/${google_logging_metric.public_site_visits.name}\""
                  aggregation = {
                    alignmentPeriod    = "3600s"
                    perSeriesAligner   = "ALIGN_SUM"
                    crossSeriesReducer = "REDUCE_SUM"
                  }
                }
              }
              plotType = "STACKED_BAR"
            }]
          }
        },
        {
          title = "App page loads"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type = \"logging.googleapis.com/user/${google_logging_metric.app_page_loads.name}\""
                  aggregation = {
                    alignmentPeriod    = "3600s"
                    perSeriesAligner   = "ALIGN_SUM"
                    crossSeriesReducer = "REDUCE_SUM"
                  }
                }
              }
              plotType = "STACKED_BAR"
            }]
          }
        },
        {
          # Request Latency is a DISTRIBUTION. Charting it without an explicit
          # percentile gives a mean, which hides the slow tail that is the
          # entire reason for looking.
          title = "Request latency, 95th percentile"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = join(" AND ", [
                    "resource.type = \"cloud_run_revision\"",
                    "metric.type = \"run.googleapis.com/request_latencies\"",
                  ])
                  aggregation = {
                    alignmentPeriod    = "300s"
                    perSeriesAligner   = "ALIGN_PERCENTILE_95"
                    crossSeriesReducer = "REDUCE_MEAN"
                    groupByFields      = ["resource.label.service_name"]
                  }
                }
              }
              plotType = "LINE"
            }]
          }
        },
        {
          # Hourly rather than five-minutely: page views are a usage
          # question, not an incident one, and a five-minute bar of a quiet
          # teaching app is mostly zeroes. Stacked, so the bar height is
          # total traffic and each band is one route.
          title = "Page views by page"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type = \"logging.googleapis.com/user/${google_logging_metric.page_views.name}\""
                  aggregation = {
                    alignmentPeriod    = "3600s"
                    perSeriesAligner   = "ALIGN_SUM"
                    crossSeriesReducer = "REDUCE_SUM"
                    groupByFields      = ["metric.label.page"]
                  }
                }
              }
              plotType = "STACKED_BAR"
            }]
          }
        },
        {
          title = "Client errors (browser)"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type = \"logging.googleapis.com/user/${google_logging_metric.client_errors.name}\""
                  aggregation = {
                    alignmentPeriod    = "3600s"
                    perSeriesAligner   = "ALIGN_SUM"
                    crossSeriesReducer = "REDUCE_SUM"
                    groupByFields      = ["metric.label.route"]
                  }
                }
              }
              plotType = "STACKED_BAR"
            }]
          }
        },
        {
          # Renamed from "Client errors (4xx)". Two widgets called "client
          # errors" meaning different things is a trap that springs months
          # later: this one counts HTTP 4xx responses at the load balancer —
          # someone requesting a bad URL — and has nothing to do with
          # JavaScript failing in a browser. Diagnostically it is also
          # different from 5xx: a 401 spike means auth broke, a 404 spike
          # means something links wrongly.
          title = "HTTP 4xx responses"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = join(" AND ", [
                    "resource.type = \"cloud_run_revision\"",
                    "metric.type = \"run.googleapis.com/request_count\"",
                    "metric.labels.response_code_class = \"4xx\"",
                  ])
                  aggregation = {
                    alignmentPeriod    = "300s"
                    perSeriesAligner   = "ALIGN_SUM"
                    crossSeriesReducer = "REDUCE_SUM"
                    groupByFields      = ["resource.label.service_name"]
                  }
                }
              }
              plotType = "STACKED_BAR"
            }]
          }
        },
        {
          # Connection pools exhaust gradually and then fail all at once,
          # which is why this is worth watching before it becomes an outage.
          title = "Cloud SQL connections"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = join(" AND ", [
                    "resource.type = \"cloudsql_database\"",
                    "metric.type = \"cloudsql.googleapis.com/database/postgresql/num_backends\"",
                  ])
                  aggregation = {
                    alignmentPeriod    = "300s"
                    perSeriesAligner   = "ALIGN_MEAN"
                    crossSeriesReducer = "REDUCE_MEAN"
                    groupByFields      = ["resource.label.database_id"]
                  }
                }
              }
              plotType = "LINE"
            }]
          }
        },
        {
          # The slow killer: fills over weeks, then the database stops.
          title = "Cloud SQL disk utilisation"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = join(" AND ", [
                    "resource.type = \"cloudsql_database\"",
                    "metric.type = \"cloudsql.googleapis.com/database/disk/utilization\"",
                  ])
                  aggregation = {
                    alignmentPeriod    = "300s"
                    perSeriesAligner   = "ALIGN_MEAN"
                    crossSeriesReducer = "REDUCE_MAX"
                    groupByFields      = ["resource.label.database_id"]
                  }
                }
              }
              plotType = "LINE"
            }]
          }
        },
        {
          # Answers the open question of whether min_instances should be
          # raised from 0: if this sits at zero between visits, every first
          # request of the day is paying a cold start.
          title = "Cloud Run instances"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = join(" AND ", [
                    "resource.type = \"cloud_run_revision\"",
                    "metric.type = \"run.googleapis.com/container/instance_count\"",
                  ])
                  aggregation = {
                    alignmentPeriod    = "300s"
                    perSeriesAligner   = "ALIGN_MEAN"
                    crossSeriesReducer = "REDUCE_SUM"
                    groupByFields      = ["resource.label.service_name"]
                  }
                }
              }
              plotType = "LINE"
            }]
          }
        },
      ]
    }
  })
}
