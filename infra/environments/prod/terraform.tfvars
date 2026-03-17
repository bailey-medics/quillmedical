# environments/prod/terraform.tfvars — Production configuration

project_id  = "quill-medical-production"
region      = "europe-west2"
environment = "prod"
domain      = "quill-medical.com"

db_tier     = "db-f1-micro" # Scale up when needed
enable_fhir = true
enable_ha   = false # Enable when real patient data + multiple clinics

cloud_run_max_instances = 10

backend_image  = "ghcr.io/bailey-medics/quillmedical/backend:latest"
frontend_image = "ghcr.io/bailey-medics/quillmedical/frontend:latest"

monitored_hostnames = ["quill-medical.com", "app.quill-medical.com"]
alert_email         = "alerts@quill-medical.com"
