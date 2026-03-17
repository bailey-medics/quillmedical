# modules/networking/main.tf — VPC, subnets, NAT, firewall, VPC connector

# ---------- VPC ----------
resource "google_compute_network" "vpc" {
  project                 = var.project_id
  name                    = "quill-vpc-${var.environment}"
  auto_create_subnetworks = false
}

# ---------- Subnet for Cloud SQL + Compute Engine ----------
resource "google_compute_subnetwork" "private" {
  project       = var.project_id
  name          = "quill-private-${var.environment}"
  ip_cidr_range = "10.0.0.0/20"
  region        = var.region
  network       = google_compute_network.vpc.id

  private_ip_google_access = true
}

# ---------- Cloud NAT (outbound internet for private resources) ----------
resource "google_compute_router" "router" {
  project = var.project_id
  name    = "quill-router-${var.environment}"
  region  = var.region
  network = google_compute_network.vpc.id
}

resource "google_compute_router_nat" "nat" {
  project = var.project_id
  name    = "quill-nat-${var.environment}"
  router  = google_compute_router.router.name
  region  = var.region

  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

# ---------- Private service connection (Cloud SQL private IP) ----------
resource "google_compute_global_address" "private_ip_range" {
  project       = var.project_id
  name          = "quill-private-ip-${var.environment}"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_range.name]
}

# ---------- Serverless VPC connector (Cloud Run → private network) ----------
resource "google_vpc_access_connector" "connector" {
  project       = var.project_id
  name          = "quill-vpc-cx-${var.environment}"
  region        = var.region
  network       = google_compute_network.vpc.id
  ip_cidr_range = "10.8.0.0/28"

  min_instances = 2
  max_instances = 3
}

# ---------- Firewall rules ----------

# Allow SSH only from IAP (for VM maintenance)
resource "google_compute_firewall" "allow_iap_ssh" {
  project = var.project_id
  name    = "allow-iap-ssh-${var.environment}"
  network = google_compute_network.vpc.id

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  # IAP's IP range
  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["allow-iap-ssh"]
}

# Allow health checks from Google load balancer ranges
resource "google_compute_firewall" "allow_health_check" {
  project = var.project_id
  name    = "allow-health-check-${var.environment}"
  network = google_compute_network.vpc.id

  allow {
    protocol = "tcp"
    ports    = ["8000", "8080"]
  }

  # Google health check IP ranges
  source_ranges = ["130.211.0.0/22", "35.191.0.0/16"]
  target_tags   = ["allow-health-check"]
}

# Deny all direct database access from the internet (defence in depth)
resource "google_compute_firewall" "deny_db_ingress" {
  project  = var.project_id
  name     = "deny-db-ingress-${var.environment}"
  network  = google_compute_network.vpc.id
  priority = 1000

  deny {
    protocol = "tcp"
    ports    = ["5432"]
  }

  source_ranges = ["0.0.0.0/0"]
}
