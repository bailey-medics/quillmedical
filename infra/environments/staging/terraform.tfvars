# environments/staging/terraform.tfvars — Staging configuration

project_id  = "quill-medical-staging"
region      = "europe-west2"
environment = "staging"
domain      = "quill-medical.com"

db_tier     = "db-f1-micro"
enable_fhir = true
enable_ha   = false

cloud_run_max_instances = 3

backend_image  = "europe-west2-docker.pkg.dev/quill-medical-staging/quill/backend:latest"
frontend_image = "europe-west2-docker.pkg.dev/quill-medical-staging/quill/frontend:latest"

monitored_hostnames = ["staging.quill-medical.com"]
alert_email         = "alerts@quill-medical.com"
