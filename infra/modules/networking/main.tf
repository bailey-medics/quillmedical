# modules/networking/main.tf - VPC, subnets, NAT, firewall, VPC connector

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

# ---------- Subnet for Cloud Run (Direct VPC egress) ----------
# Each Cloud Run instance that uses Direct VPC egress takes an address here
# for as long as it runs: a service holds about twice its instance count and
# keeps them for twenty minutes after scaling down; a job task holds one for
# its run plus seven minutes. Google requires a /26 at least and hands
# addresses out in blocks of sixteen. A /24 is roomy for five instances of
# the backend, four jobs and a revision rollout, and costs nothing.
#
# 10.9.0.0/24 sits clear of the private subnet (10.0.0.0/20), the connector
# (10.8.0.0/28) and the Cloud SQL peering range Google chose (10.185.0.0/16,
# read from `gcloud compute addresses describe quill-private-ip-app --global`
# on 2026-10-18). See
# docs/docs/plans/2026-10-18-direct-vpc-egress-plan.md.
resource "google_compute_subnetwork" "cloud_run" {
  project       = var.project_id
  name          = "quill-run-${var.environment}"
  ip_cidr_range = "10.9.0.0/24"
  region        = var.region
  network       = google_compute_network.vpc.id

  # GCS, Secret Manager and the backend's own run.app address all stay on
  # Google's network from here, and never touch the NAT.
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
