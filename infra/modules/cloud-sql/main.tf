# modules/cloud-sql/main.tf — Managed PostgreSQL instance

resource "google_sql_database_instance" "instance" {
  project          = var.project_id
  name             = "quill-${var.instance_name}-${var.environment}"
  database_version = var.database_version
  region           = var.region

  # Prevent accidental deletion of clinical databases
  deletion_protection = var.environment == "prod"

  depends_on = [var.private_vpc_connection]

  settings {
    tier              = var.tier
    availability_type = var.enable_ha ? "REGIONAL" : "ZONAL"
    disk_autoresize   = true
    disk_size         = 10 # GB, will auto-grow

    ip_configuration {
      ipv4_enabled                                  = false # No public IP
      private_network                               = var.vpc_network_id
      enable_private_path_for_google_cloud_services = true
      require_ssl                                   = true
    }

    backup_configuration {
      enabled                        = var.backup_enabled
      point_in_time_recovery_enabled = var.pitr_enabled

      backup_retention_settings {
        retained_backups = var.backup_retained_count
        retention_unit   = "COUNT"
      }

      transaction_log_retention_days = var.pitr_days

      start_time = "03:00" # UTC
    }

    maintenance_window {
      day          = 7 # Sunday
      hour         = 3 # 03:00 UTC
      update_track = "stable"
    }

    database_flags {
      name  = "log_checkpoints"
      value = "on"
    }

    database_flags {
      name  = "log_connections"
      value = "on"
    }

    database_flags {
      name  = "log_disconnections"
      value = "on"
    }
  }
}

resource "google_sql_database" "database" {
  project  = var.project_id
  name     = var.db_name
  instance = google_sql_database_instance.instance.name
}

# Generate a strong random password for the DB user
resource "random_password" "db_password" {
  length  = 32
  special = false # Avoid shell-escaping issues in connection strings
}

# Store the generated password in Secret Manager so Cloud Run can read it
resource "google_secret_manager_secret_version" "db_password" {
  secret      = "projects/${var.project_id}/secrets/${var.db_password_secret_id}"
  secret_data = random_password.db_password.result

  depends_on = [var.secret_depends_on]
}

resource "google_sql_user" "user" {
  project  = var.project_id
  name     = var.db_user
  instance = google_sql_database_instance.instance.name
  password = random_password.db_password.result
}
