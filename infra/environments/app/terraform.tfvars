# environments/app/terraform.tfvars — App configuration
#
# The teaching and passport product, in the project it is moving to.
#
# This environment claims app.quill-medical.com and nothing else. It must
# not name teaching.quill-medical.com or the apex: those are served by
# quill-medical-teaching, a Google-managed certificate only goes active
# once every domain on it validates by DNS, and the DNS for both still
# points at the old project. Listing them here would leave this
# project's certificate pending for ever.
#
# The DNS record for app.quill-medical.com is created by hand in Batch 5,
# which is also when teaching.quill-medical.com becomes a redirect.

project_id  = "quill-medical-app"
region      = "europe-west2"
environment = "app"
domain      = "quill-medical.com"

db_tier     = "db-f1-micro"
enable_fhir = false # No FHIR/EHRbase — single auth DB + Cloud Storage
enable_ha   = false

cloud_run_max_instances = 5

lb_domains     = ["app.quill-medical.com"]
# No landing_domain: the apex is served by the teaching project until
# Batch 5, and naming it here would add it to this certificate too.
landing_domain = null

backend_image   = "gcr.io/cloudrun/hello:latest"
frontend_image  = "gcr.io/cloudrun/hello:latest"
admin_image     = "gcr.io/cloudrun/hello:latest"
transcode_image = "gcr.io/cloudrun/hello:latest"
caption_image   = "gcr.io/cloudrun/hello:latest"

monitored_hostnames        = ["app.quill-medical.com"]
app_domain                 = "app.quill-medical.com"
alert_email                = "info@quill-medical.com"
cloud_run_services         = ["quill-backend-app", "quill-frontend-app"]

# No slack_channel_display_name yet. The monitoring module looks a Slack
# channel up by display name, and a Slack channel can only be created
# through the console's OAuth consent flow, which produces an auth_token
# nothing else can mint. Teaching's was made that way. Until the same is
# done for this project, an empty value switches the data source off; set
# it to "quill-medical-cicd" once the channel exists here.
slack_channel_display_name = ""


# Whether this environment should have these alert channels at all. Static
# config rather than a test on whether the secret holds a value: a `count`
# must be known at plan time, and those values are read from Secret Manager.
# Both channels are deployed, so both are true — setting either false would
# destroy the channel.
enable_sms_channel       = true
enable_pagerduty_channel = true
