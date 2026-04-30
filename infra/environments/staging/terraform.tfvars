# environments/staging/terraform.tfvars — Staging configuration

project_id  = "quill-medical-staging"
region      = "europe-west2"
environment = "staging"
domain      = "quill-medical.com"

db_tier     = "db-f1-micro"
enable_fhir = true
enable_ha   = false

cloud_run_max_instances = 3

lb_domains = ["staging.quill-medical.com"]

backend_image  = "gcr.io/cloudrun/hello:latest"
frontend_image = "gcr.io/cloudrun/hello:latest"
admin_image    = "gcr.io/cloudrun/hello:latest"

monitored_hostnames = ["staging.quill-medical.com"]
alert_email         = "info@quill-medical.com"
cloud_run_services  = ["quill-backend-staging", "quill-frontend-staging"]
