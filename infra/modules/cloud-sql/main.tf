# modules/cloud-sql/main.tf - Managed PostgreSQL instance

resource "google_sql_database_instance" "instance" {
  project          = var.project_id
  name             = "quill-${var.instance_name}-${var.environment}"
  database_version = var.database_version
  region           = var.region

  # Three guards against losing a production database, each against a
  # different mistake.
  #
  # This one is Terraform's own: it refuses to plan the instance's
  # destruction while it is true.
  deletion_protection = var.is_production

  depends_on = [var.private_vpc_connection]

  # And this refuses a pull request that would remove or replace the
  # instance, whatever the line above says at the time. It cannot be made
  # to depend on the environment, so it holds for staging too: taking a
  # database away for good means taking this out first, on purpose.
  lifecycle {
    prevent_destroy = true
  }

  settings {
    # Google's own guard: the instance cannot be deleted from the console,
    # `gcloud` or the API while this is on. The one above only stops
    # Terraform.
    deletion_protection_enabled = var.is_production

    # Backups outlive the instance. Without this they are deleted with
    # it, so the one mistake backups exist for would take them too.
    retain_backups_on_delete = true

    tier              = var.tier
    availability_type = var.enable_ha ? "REGIONAL" : "ZONAL"
    disk_autoresize   = true
    disk_size         = 10 # GB, will auto-grow

    ip_configuration {
      ipv4_enabled                                  = false # No public IP
      private_network                               = var.vpc_network_id
      enable_private_path_for_google_cloud_services = true
      ssl_mode                                      = "ENCRYPTED_ONLY"
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

# State migration: app_database[0] → database (no-op where app_database never existed)
moved {
  from = google_sql_database.app_database[0]
  to   = google_sql_database.database
}

resource "google_sql_database" "database" {
  project         = var.project_id
  name            = var.db_name
  instance        = google_sql_database_instance.instance.name
  deletion_policy = "ABANDON"
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
