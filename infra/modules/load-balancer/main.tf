# modules/load-balancer/main.tf — Global HTTPS Load Balancer with Cloud Run NEGs
#
# Enterprise-grade external Application Load Balancer per environment:
#   - Path-based routing: /api/* → backend Cloud Run, /* → frontend Cloud Run
#   - Google-managed SSL certificate (auto-renewing)
#   - HTTP → HTTPS redirect
#   - Cloud Armor WAF with rate limiting
#   - Full request logging

# ---------- Static IP ----------
resource "google_compute_global_address" "lb_ip" {
  project = var.project_id
  name    = "quill-lb-ip-${var.environment}"
}

# ---------- Cloud Armor security policy ----------
resource "google_compute_security_policy" "waf" {
  project = var.project_id
  name    = "quill-waf-${var.environment}"

  # Rate limiting: 500 requests/min per IP
  rule {
    action   = "throttle"
    priority = 1000

    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }

    rate_limit_options {
      rate_limit_threshold {
        count        = 500
        interval_sec = 60
      }
      conform_action = "allow"
      exceed_action  = "deny(429)"
    }

    description = "Rate limit: 500 req/min per IP"
  }

  # Default: allow all traffic
  rule {
    action   = "allow"
    priority = 2147483647

    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }

    description = "Default: allow all traffic"
  }
}

# ---------- Serverless NEGs (Cloud Run) ----------
resource "google_compute_region_network_endpoint_group" "backend" {
  project               = var.project_id
  name                  = "quill-neg-backend-${var.environment}"
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = var.backend_service_name
  }
}

resource "google_compute_region_network_endpoint_group" "frontend" {
  project               = var.project_id
  name                  = "quill-neg-frontend-${var.environment}"
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = var.frontend_service_name
  }
}

# ---------- Backend services ----------
resource "google_compute_backend_service" "backend" {
  project         = var.project_id
  name            = "quill-bs-backend-${var.environment}"
  protocol        = "HTTP"
  timeout_sec     = 30
  security_policy = google_compute_security_policy.waf.id

  backend {
    group = google_compute_region_network_endpoint_group.backend.id
  }

  log_config {
    enable      = true
    sample_rate = var.log_sample_rate
  }
}

resource "google_compute_backend_service" "frontend" {
  project         = var.project_id
  name            = "quill-bs-frontend-${var.environment}"
  protocol        = "HTTP"
  timeout_sec     = 30
  security_policy = google_compute_security_policy.waf.id

  backend {
    group = google_compute_region_network_endpoint_group.frontend.id
  }

  log_config {
    enable      = true
    sample_rate = var.log_sample_rate
  }
}

# ---------- URL map (path-based routing) ----------
resource "google_compute_url_map" "https" {
  project         = var.project_id
  name            = "quill-url-map-${var.environment}"
  default_service = google_compute_backend_service.frontend.id

  host_rule {
    hosts        = var.domains
    path_matcher = "quill-paths"
  }

  path_matcher {
    name            = "quill-paths"
    default_service = google_compute_backend_service.frontend.id

    path_rule {
      paths   = ["/api", "/api/*"]
      service = google_compute_backend_service.backend.id
    }

    # Phase 0 video spike. Null in every environment that has no spike module,
    # so `prod` and `staging` render an unchanged URL map rather than gaining
    # an empty rule. Temporary: removed with the spike.
    dynamic "path_rule" {
      for_each = var.video_spike_backend_bucket_id != null ? [1] : []
      content {
        paths   = ["/videospike/*"]
        service = var.video_spike_backend_bucket_id
      }
    }
  }

  # Landing page host rule (when landing_domain is set)
  dynamic "host_rule" {
    for_each = var.landing_domain != null ? [var.landing_domain] : []
    content {
      hosts        = [host_rule.value, "www.${host_rule.value}"]
      path_matcher = "landing"
    }
  }

  dynamic "path_matcher" {
    for_each = var.landing_domain != null ? [1] : []
    content {
      name            = "landing"
      default_service = google_compute_backend_bucket.landing[0].id
    }
  }
}

# ---------- Landing page: GCS bucket + backend bucket ----------
resource "google_storage_bucket" "landing" {
  count    = var.landing_domain != null ? 1 : 0
  project  = var.project_id
  name     = "${var.project_id}-landing"
  location = "EU"

  website {
    main_page_suffix = "index.html"
    not_found_page   = "not-found.html"
  }

  uniform_bucket_level_access = true
  force_destroy               = true
}

resource "google_storage_bucket_iam_member" "landing_public" {
  count  = var.landing_domain != null ? 1 : 0
  bucket = google_storage_bucket.landing[0].name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

resource "google_compute_backend_bucket" "landing" {
  count       = var.landing_domain != null ? 1 : 0
  project     = var.project_id
  name        = "quill-landing-${var.environment}"
  bucket_name = google_storage_bucket.landing[0].name
  enable_cdn  = true

  # Security headers for the marketing site.
  #
  # They have to be set here rather than in `caddy/prod/Caddyfile`, which
  # carries the equivalent set for the application: this site is served
  # straight from the bucket through the load balancer and never passes
  # through Caddy, so until now it went out with no security headers at all.
  # Cloud Storage cannot set them either — it serves a fixed set of its own —
  # so the load balancer is the only place left.
  #
  # The policy is stricter than the application's, because the site earns it.
  # Checked against the built output rather than the source: it emits no
  # inline script, no iframe, no form, no `data:` URI and no request to any
  # other host. `script-src 'self'` therefore needs no `'unsafe-inline'`,
  # which is the half of a policy that actually stops cross-site scripting.
  #
  # `style-src` does need it, for two reasons that are not going away:
  # Mantine writes its CSS variables into a `<style>` element at runtime, and
  # the page template sets the dark background as an inline attribute on
  # `<html>` and `<body>` so the site does not flash white before the
  # stylesheet arrives. Inline styles are a far smaller risk than inline
  # script.
  #
  # `data:` is deliberately absent from `img-src`. Nothing in the build uses
  # one, so adding it later should be a decision rather than an inheritance.
  #
  # Strict-Transport-Security is deliberately at five minutes — step one of a
  # three-step ramp, not a finished value.
  #
  # The header is stored by the visitor's browser rather than by us, so its
  # duration is a promise that cannot be withdrawn: sending a shorter one
  # later reaches only the people who come back. `includeSubDomains` compounds
  # that by covering subdomains that do not exist yet, and one which is not
  # ready for HTTPS on its first day would be unreachable — with no warning to
  # click past — for everyone who had ever visited this site.
  #
  # Five minutes proves the mechanism against a promise short enough to wait
  # out. One day comes next, then two years with `includeSubDomains` once
  # every subdomain that is wanted is known to serve HTTPS.
  #
  # No `preload` token, and not by oversight. It means nothing unless the
  # domain is submitted at hstspreload.org, and removal from a list shipped
  # inside browsers takes months.
  custom_response_headers = [
    "Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    "Strict-Transport-Security: max-age=300",
    "X-Content-Type-Options: nosniff",
    "Referrer-Policy: strict-origin-when-cross-origin",
    "Permissions-Policy: camera=(), microphone=(), geolocation=()",
    "X-Frame-Options: DENY",
  ]
}

# ---------- Google-managed SSL certificate ----------
resource "google_compute_managed_ssl_certificate" "cert" {
  project = var.project_id
  name    = "quill-cert-v5-${var.environment}"

  managed {
    domains = concat(var.domains, var.landing_domain != null ? [var.landing_domain, "www.${var.landing_domain}"] : [])
  }

  lifecycle {
    create_before_destroy = true
  }
}

# ---------- HTTPS proxy + forwarding rule ----------
resource "google_compute_target_https_proxy" "https" {
  project          = var.project_id
  name             = "quill-https-proxy-${var.environment}"
  url_map          = google_compute_url_map.https.id
  ssl_certificates = [google_compute_managed_ssl_certificate.cert.id]
}

resource "google_compute_global_forwarding_rule" "https" {
  project    = var.project_id
  name       = "quill-https-rule-${var.environment}"
  target     = google_compute_target_https_proxy.https.id
  port_range = "443"
  ip_address = google_compute_global_address.lb_ip.address
}

# ---------- HTTP → HTTPS redirect ----------
resource "google_compute_url_map" "http_redirect" {
  project = var.project_id
  name    = "quill-http-redirect-${var.environment}"

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "http" {
  project = var.project_id
  name    = "quill-http-proxy-${var.environment}"
  url_map = google_compute_url_map.http_redirect.id
}

resource "google_compute_global_forwarding_rule" "http" {
  project    = var.project_id
  name       = "quill-http-rule-${var.environment}"
  target     = google_compute_target_http_proxy.http.id
  port_range = "80"
  ip_address = google_compute_global_address.lb_ip.address
}
