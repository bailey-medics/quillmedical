# environments/teaching/terraform.tfvars — Teaching configuration

project_id  = "quill-medical-teaching"
region      = "europe-west2"
environment = "teaching"
domain      = "quill-medical.com"

db_tier     = "db-f1-micro"
enable_fhir = false # No FHIR/EHRbase — single auth DB + Cloud Storage
enable_ha   = false

# Phase 0 video spike. TEMPORARY — this proves Cloud CDN can serve a private
# bucket through the load balancer, and is reverted once the probes have been
# run and their outcome recorded in the video auth gate plan. If you are
# reading this and the plan's Phase 0 findings are filled in, it should be off.
enable_video_spike = true

cloud_run_max_instances = 5

lb_domains     = ["teaching.quill-medical.com"]
landing_domain = "quill-medical.com"

backend_image  = "gcr.io/cloudrun/hello:latest"
frontend_image = "gcr.io/cloudrun/hello:latest"
admin_image    = "gcr.io/cloudrun/hello:latest"

monitored_hostnames        = ["teaching.quill-medical.com", "quill-medical.com"]
app_domain                 = "teaching.quill-medical.com"
alert_email                = "info@quill-medical.com"
slack_channel_display_name = "quill-medical-cicd"
cloud_run_services         = ["quill-backend-teaching", "quill-frontend-teaching"]
