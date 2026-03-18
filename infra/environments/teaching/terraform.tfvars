# environments/teaching/terraform.tfvars — Teaching configuration

project_id  = "quill-medical-teaching"
region      = "europe-west2"
environment = "teaching"
domain      = "quill-medical.com"

db_tier     = "db-f1-micro"
enable_fhir = false # No FHIR/EHRbase — single auth DB + Cloud Storage
enable_ha   = false

cloud_run_max_instances = 5

backend_image  = "europe-west2-docker.pkg.dev/quill-medical-teaching/quill/backend:latest"
frontend_image = "europe-west2-docker.pkg.dev/quill-medical-teaching/quill/frontend:latest"

monitored_hostnames = ["teaching.quill-medical.com"]
alert_email         = "alerts@quill-medical.com"
