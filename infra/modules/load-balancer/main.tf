# modules/load-balancer/main.tf — Global HTTPS LB with Cloud Run backends
#
# Creates:
#   - Serverless NEGs for each Cloud Run service
#   - Backend services
#   - URL map (host-based routing)
#   - Google-managed SSL certificates
#   - HTTPS proxy + global forwarding rule
#   - HTTP → HTTPS redirect
#   - DNS A records pointing to the LB IP

# ---------- Reserve a global static IP ----------
resource "google_compute_global_address" "lb_ip" {
  project = var.project_id
  name    = "quill-lb-ip"
}

# ---------- Serverless NEGs (one per Cloud Run service) ----------
resource "google_compute_region_network_endpoint_group" "neg" {
  for_each = var.services

  project               = each.value.cloud_run_project
  name                  = "quill-neg-${replace(each.key, ".", "-")}"
  region                = each.value.cloud_run_region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = each.value.cloud_run_service_name
  }
}

# ---------- Backend services ----------
resource "google_compute_backend_service" "backend" {
  for_each = var.services

  project     = var.project_id
  name        = "quill-bs-${replace(each.key, ".", "-")}"
  protocol    = "HTTP"
  timeout_sec = 30

  backend {
    group = google_compute_region_network_endpoint_group.neg[each.key].id
  }

  log_config {
    enable      = true
    sample_rate = 1.0
  }
}

# ---------- URL map (host-based routing) ----------
resource "google_compute_url_map" "https" {
  project = var.project_id
  name    = "quill-url-map"

  # Default to the root domain service
  default_service = google_compute_backend_service.backend[var.domain].id

  dynamic "host_rule" {
    for_each = var.services
    content {
      hosts        = [host_rule.key]
      path_matcher = replace(host_rule.key, ".", "-")
    }
  }

  dynamic "path_matcher" {
    for_each = var.services
    content {
      name            = replace(path_matcher.key, ".", "-")
      default_service = google_compute_backend_service.backend[path_matcher.key].id
    }
  }
}

# ---------- Google-managed SSL certificates ----------
resource "google_compute_managed_ssl_certificate" "cert" {
  project = var.project_id
  name    = "quill-cert"

  managed {
    domains = keys(var.services)
  }
}

# ---------- HTTPS proxy ----------
resource "google_compute_target_https_proxy" "https" {
  project          = var.project_id
  name             = "quill-https-proxy"
  url_map          = google_compute_url_map.https.id
  ssl_certificates = [google_compute_managed_ssl_certificate.cert.id]
}

# ---------- HTTPS forwarding rule ----------
resource "google_compute_global_forwarding_rule" "https" {
  project    = var.project_id
  name       = "quill-https-rule"
  target     = google_compute_target_https_proxy.https.id
  port_range = "443"
  ip_address = google_compute_global_address.lb_ip.address
}

# ---------- HTTP → HTTPS redirect ----------
resource "google_compute_url_map" "http_redirect" {
  project = var.project_id
  name    = "quill-http-redirect"

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "http" {
  project = var.project_id
  name    = "quill-http-proxy"
  url_map = google_compute_url_map.http_redirect.id
}

resource "google_compute_global_forwarding_rule" "http" {
  project    = var.project_id
  name       = "quill-http-rule"
  target     = google_compute_target_http_proxy.http.id
  port_range = "80"
  ip_address = google_compute_global_address.lb_ip.address
}

# ---------- DNS A records ----------
resource "google_dns_record_set" "a_records" {
  for_each = var.services

  project      = var.project_id
  managed_zone = var.dns_zone_name
  name         = "${each.key}."
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_global_address.lb_ip.address]
}
