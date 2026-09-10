# environments/teaching/terraform.tfvars — Teaching configuration

project_id  = "quill-medical-teaching"
region      = "europe-west2"
environment = "teaching"
domain      = "quill-medical.com"

db_tier     = "db-f1-micro"
enable_fhir = false # No FHIR/EHRbase — single auth DB + Cloud Storage
enable_ha   = false

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

# Whether this environment should have these alert channels at all. Static
# config rather than a test on whether the secret holds a value: a `count`
# must be known at plan time, and those values are read from Secret Manager.
# Both channels are deployed, so both are true — setting either false would
# destroy the channel.
enable_sms_channel       = true
enable_pagerduty_channel = true
