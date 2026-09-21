# environments/prod/terraform.tfvars — Production configuration

project_id  = "quill-medical-production"
region      = "europe-west2"
environment = "prod"
domain      = "quill-medical.com"

db_tier     = "db-f1-micro" # Scale up when needed
enable_fhir = true
enable_ha   = false # Enable when real patient data + multiple clinics

cloud_run_max_instances = 10

# ehr, not app. This project is the clinical product, and Phase 3 of
# docs/docs/plans/2026-09-18-environment-isolation-and-iap-plan.md settled
# ehr.quill-medical.com for it. app.quill-medical.com now belongs to the
# teaching and passport environment, which serves it today; leaving the
# claim here would put the same hostname on two certificates the moment
# this project is restored.
lb_domains     = ["ehr.quill-medical.com"]
landing_domain = "quill-medical.com"

backend_image  = "gcr.io/cloudrun/hello:latest"
frontend_image = "gcr.io/cloudrun/hello:latest"
admin_image    = "gcr.io/cloudrun/hello:latest"

monitored_hostnames = ["quill-medical.com", "ehr.quill-medical.com"]
alert_email         = "info@quill-medical.com"
cloud_run_services  = ["quill-backend-production", "quill-frontend-production"]
