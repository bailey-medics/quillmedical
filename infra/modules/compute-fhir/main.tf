# modules/compute-fhir/main.tf — Compute Engine VM for FHIR + EHRbase

locals {
  zone = var.zone != "" ? var.zone : "${var.region}-a"
}

# Service account for the VM (least privilege)
resource "google_service_account" "fhir_vm" {
  project      = var.project_id
  account_id   = "fhir-vm-${var.environment}"
  display_name = "FHIR + EHRbase VM (${var.environment})"
}

# Grant the VM access to pull secrets
resource "google_project_iam_member" "fhir_vm_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.fhir_vm.email}"
}

# Grant the VM access to write logs
resource "google_project_iam_member" "fhir_vm_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.fhir_vm.email}"
}

resource "google_compute_instance" "fhir" {
  project      = var.project_id
  name         = "fhir-ehrbase-${var.environment}"
  machine_type = var.machine_type
  zone         = local.zone

  tags = ["allow-iap-ssh", "allow-health-check"]

  boot_disk {
    initialize_params {
      image = "projects/cos-cloud/global/images/family/cos-stable"
      size  = 30 # GB
      type  = "pd-standard"
    }
  }

  network_interface {
    subnetwork = var.subnet_id
    # No access_config = no public IP (private only)
  }

  service_account {
    email  = google_service_account.fhir_vm.email
    scopes = ["cloud-platform"]
  }

  metadata = {
    # Startup script that installs Docker Compose and starts services
    startup-script = templatefile("${path.module}/startup.sh", {
      environment                = var.environment
      fhir_db_host               = var.fhir_db_host
      fhir_db_password_secret    = var.fhir_db_password_secret
      ehrbase_db_host            = var.ehrbase_db_host
      ehrbase_db_password_secret = var.ehrbase_db_password_secret
      ehrbase_api_password_secret   = var.ehrbase_api_password_secret
      ehrbase_admin_password_secret = var.ehrbase_admin_password_secret
    })
  }

  # Allow stopping for updates
  allow_stopping_for_update = true

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }
}
