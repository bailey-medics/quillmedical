# environments/teaching/terraform.tfvars — Teaching configuration

project_id  = "quill-medical-teaching"
region      = "europe-west2"
environment = "teaching"
domain      = "quill-medical.com"

db_tier     = "db-f1-micro"
enable_fhir = false # No FHIR/EHRbase — single auth DB + Cloud Storage
enable_ha   = false

cloud_run_max_instances = 5

lb_domains = ["teaching.quill-medical.com"]
landing_domain = "quill-medical.com"

backend_image  = "gcr.io/cloudrun/hello:latest"
frontend_image = "gcr.io/cloudrun/hello:latest"
admin_image    = "gcr.io/cloudrun/hello:latest"

monitored_hostnames = ["teaching.quill-medical.com", "quill-medical.com"]
alert_email         = "info@quill-medical.com"
cloud_run_services  = ["quill-backend-teaching", "quill-frontend-teaching"]
