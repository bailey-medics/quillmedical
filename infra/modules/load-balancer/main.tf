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
  }
}

# ---------- Google-managed SSL certificate ----------
resource "google_compute_managed_ssl_certificate" "cert" {
  project = var.project_id
  name    = "quill-cert-${var.environment}"

  managed {
    domains = var.domains
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
