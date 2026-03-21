# main.tf — Root module wiring all infrastructure together
#
# Usage:
#   cd infra/
#   terraform init
#   terraform plan -var-file=environments/staging/terraform.tfvars
#   terraform apply -var-file=environments/staging/terraform.tfvars

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# ---------- Artifact Registry ----------
resource "google_artifact_registry_repository" "docker" {
  project       = var.project_id
  location      = var.region
  repository_id = "quill"
  format        = "DOCKER"
  description   = "Container images for Quill Medical (${var.environment})"
}

# ---------- Secrets (created first, values set manually) ----------
module "secrets" {
  source     = "./modules/secrets"
  project_id = var.project_id

  secrets = concat(
    [
      "jwt-secret",
      "auth-db-password",
      "vapid-private",
    ],
    var.enable_fhir ? [
      "fhir-db-password",
      "ehrbase-db-password",
      "ehrbase-api-password",
      "ehrbase-admin-password",
    ] : []
  )
}

# ---------- Networking ----------
module "networking" {
  source      = "./modules/networking"
  project_id  = var.project_id
  region      = var.region
  environment = var.environment
}

# ---------- Cloud SQL: auth database (all environments) ----------
module "cloud_sql_auth" {
  source     = "./modules/cloud-sql"
  project_id = var.project_id
  region     = var.region
  environment = var.environment

  instance_name         = "auth"
  db_name               = "quill_auth"
  db_user               = "quill"
  db_password_secret_id = "auth-db-password"
  tier                  = var.db_tier
  enable_ha             = var.enable_ha
  vpc_network_id        = module.networking.vpc_id
  private_vpc_connection = module.networking.private_vpc_connection
  secret_depends_on      = module.secrets.secret_ids

  # Production gets longer backup retention
  backup_retained_count = var.environment == "prod" ? 30 : 7
  pitr_enabled          = var.environment == "prod"
  pitr_days             = var.environment == "prod" ? 7 : 3
}

# ---------- Cloud SQL: FHIR database (prod + staging only) ----------
module "cloud_sql_fhir" {
  count      = var.enable_fhir ? 1 : 0
  source     = "./modules/cloud-sql"
  project_id = var.project_id
  region     = var.region
  environment = var.environment

  instance_name         = "fhir"
  db_name               = "fhir"
  db_user               = "fhir"
  db_password_secret_id = "fhir-db-password"
  tier                  = var.db_tier
  enable_ha             = var.enable_ha
  vpc_network_id        = module.networking.vpc_id
  private_vpc_connection = module.networking.private_vpc_connection
  secret_depends_on      = module.secrets.secret_ids

  backup_retained_count = var.environment == "prod" ? 30 : 7
  pitr_enabled          = var.environment == "prod"
  pitr_days             = var.environment == "prod" ? 7 : 3
}

# ---------- Cloud SQL: EHRbase database (prod + staging only) ----------
module "cloud_sql_ehrbase" {
  count      = var.enable_fhir ? 1 : 0
  source     = "./modules/cloud-sql"
  project_id = var.project_id
  region     = var.region
  environment = var.environment

  instance_name         = "ehrbase"
  db_name               = "ehrbase"
  db_user               = "ehrbase"
  db_password_secret_id = "ehrbase-db-password"
  tier                  = var.db_tier
  enable_ha             = var.enable_ha
  vpc_network_id        = module.networking.vpc_id
  private_vpc_connection = module.networking.private_vpc_connection
  secret_depends_on      = module.secrets.secret_ids

  backup_retained_count = var.environment == "prod" ? 30 : 7
  pitr_enabled          = var.environment == "prod"
  pitr_days             = var.environment == "prod" ? 7 : 3
}

# ---------- Compute Engine: FHIR + EHRbase VM (prod + staging) ----------
module "compute_fhir" {
  count      = var.enable_fhir ? 1 : 0
  source     = "./modules/compute-fhir"
  project_id = var.project_id
  region     = var.region
  environment = var.environment

  subnet_id  = module.networking.subnet_id

  fhir_db_host               = module.cloud_sql_fhir[0].private_ip
  fhir_db_password_secret    = "fhir-db-password"
  ehrbase_db_host            = module.cloud_sql_ehrbase[0].private_ip
  ehrbase_db_password_secret = "ehrbase-db-password"
  ehrbase_api_password_secret   = "ehrbase-api-password"
  ehrbase_admin_password_secret = "ehrbase-admin-password"
}

# ---------- IAM: Cloud Run → Secret Manager ----------
data "google_project" "project" {
  project_id = var.project_id
}

resource "google_project_iam_member" "cloudrun_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${data.google_project.project.number}-compute@developer.gserviceaccount.com"
}

# ---------- Initial secret values (jwt-secret, vapid-private) ----------
# These are generated once by Terraform. Replace vapid-private with a real
# VAPID key via `gcloud secrets versions add` before going live.
resource "random_password" "jwt_secret" {
  length  = 64
  special = true
}

resource "google_secret_manager_secret_version" "jwt_secret" {
  secret      = "projects/${var.project_id}/secrets/jwt-secret"
  secret_data = random_password.jwt_secret.result
  depends_on  = [module.secrets]
}

resource "random_password" "vapid_placeholder" {
  length  = 32
  special = false
}

resource "google_secret_manager_secret_version" "vapid_private" {
  secret      = "projects/${var.project_id}/secrets/vapid-private"
  secret_data = random_password.vapid_placeholder.result
  depends_on  = [module.secrets]
}

# ---------- Cloud Run: backend ----------
module "cloud_run_backend" {
  source      = "./modules/cloud-run"
  project_id  = var.project_id
  region      = var.region
  environment = var.environment

  service_name     = "backend"
  image            = var.backend_image
  port             = 8000
  memory           = "512Mi"
  cpu              = "1"
  max_instances    = var.cloud_run_max_instances
  vpc_connector_id = module.networking.vpc_connector_id
  health_check_path = "/api/health"

  env_vars = merge(
    {
      BACKEND_ENV    = "production"
      SECURE_COOKIES = "true"
      COOKIE_DOMAIN  = ".${var.domain}"
      AUTH_DB_HOST   = module.cloud_sql_auth.private_ip
      AUTH_DB_NAME   = module.cloud_sql_auth.database_name
      AUTH_DB_USER   = module.cloud_sql_auth.database_user
    },
    var.enable_fhir ? {
      FHIR_SERVER_URL  = "http://${module.compute_fhir[0].internal_ip}:8080/fhir"
      EHRBASE_URL      = "http://${module.compute_fhir[0].internal_ip}:8081/ehrbase"
      FHIR_DB_HOST     = module.cloud_sql_fhir[0].private_ip
      FHIR_DB_NAME     = module.cloud_sql_fhir[0].database_name
      FHIR_DB_USER     = module.cloud_sql_fhir[0].database_user
      EHRBASE_DB_HOST  = module.cloud_sql_ehrbase[0].private_ip
      EHRBASE_DB_NAME  = module.cloud_sql_ehrbase[0].database_name
      EHRBASE_DB_USER  = module.cloud_sql_ehrbase[0].database_user
    } : {}
  )

  secret_env_vars = merge(
    {
      JWT_SECRET       = "jwt-secret"
      AUTH_DB_PASSWORD  = "auth-db-password"
      VAPID_PRIVATE    = "vapid-private"
    },
    var.enable_fhir ? {
      FHIR_DB_PASSWORD           = "fhir-db-password"
      EHRBASE_DB_PASSWORD        = "ehrbase-db-password"
      EHRBASE_API_PASSWORD       = "ehrbase-api-password"
      EHRBASE_API_ADMIN_PASSWORD = "ehrbase-admin-password"
    } : {}
  )

  depends_on = [
    google_secret_manager_secret_version.jwt_secret,
    google_secret_manager_secret_version.vapid_private,
    google_project_iam_member.cloudrun_secret_accessor,
    module.cloud_sql_auth, # writes auth-db-password version
  ]
}

# ---------- Cloud Run Job: admin tasks ----------
module "cloud_run_admin_job" {
  source      = "./modules/cloud-run-job"
  project_id  = var.project_id
  region      = var.region
  environment = var.environment

  job_name         = "admin"
  image            = var.admin_image
  vpc_connector_id = module.networking.vpc_connector_id

  env_vars = {
    AUTH_DB_HOST = module.cloud_sql_auth.private_ip
    AUTH_DB_NAME = module.cloud_sql_auth.database_name
    AUTH_DB_USER = module.cloud_sql_auth.database_user
  }

  secret_env_vars = {
    AUTH_DB_PASSWORD = "auth-db-password"
    JWT_SECRET      = "jwt-secret"
  }

  depends_on = [
    google_project_iam_member.cloudrun_secret_accessor,
    module.cloud_sql_auth,
  ]
}

# ---------- Cloud Run: frontend ----------
module "cloud_run_frontend" {
  source      = "./modules/cloud-run"
  project_id  = var.project_id
  region      = var.region
  environment = var.environment

  service_name     = "frontend"
  image            = var.frontend_image
  port             = 80
  memory           = "512Mi"
  cpu              = "1"
  max_instances    = var.cloud_run_max_instances
  vpc_connector_id = module.networking.vpc_connector_id
  health_check_path = "/healthz"
}

# ---------- Global HTTPS Load Balancer ----------
module "load_balancer" {
  source      = "./modules/load-balancer"
  project_id  = var.project_id
  region      = var.region
  environment = var.environment

  domains               = var.lb_domains
  landing_domain        = var.landing_domain
  backend_service_name  = module.cloud_run_backend.service_name
  frontend_service_name = module.cloud_run_frontend.service_name
}

# ---------- Cloud Storage: teaching images (teaching only) ----------
module "cloud_storage" {
  count       = var.environment == "teaching" ? 1 : 0
  source      = "./modules/cloud-storage"
  project_id  = var.project_id
  region      = var.region
  environment = var.environment
}

# ---------- Monitoring: uptime checks + alerting ----------
module "monitoring" {
  source      = "./modules/monitoring"
  project_id  = var.project_id
  environment = var.environment

  monitored_hostnames = var.monitored_hostnames
  alert_email         = var.alert_email
}
