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
      FHIR_BASE_URL    = "http://${module.compute_fhir[0].internal_ip}:8080/fhir"
      EHRBASE_BASE_URL = "http://${module.compute_fhir[0].internal_ip}:8081/ehrbase"
    } : {}
  )

  secret_env_vars = {
    JWT_SECRET       = "jwt-secret"
    AUTH_DB_PASSWORD  = "auth-db-password"
    VAPID_PRIVATE    = "vapid-private"
  }
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
  memory           = "256Mi"
  cpu              = "0.5"
  max_instances    = var.cloud_run_max_instances
  vpc_connector_id = module.networking.vpc_connector_id
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
