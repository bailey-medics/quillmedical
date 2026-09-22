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
# Null again, after 2026-09-22 showed why the order matters.
#
# Naming the apex here puts quill-medical.com and www on this
# environment's certificate. A Google-managed certificate serves nothing
# until every domain on it validates, and validation resolves the domain,
# so those two cannot pass while their DNS still points at the teaching
# project. Meanwhile `create_before_destroy` had already attached the new
# certificate and destroyed the old one, so app.quill-medical.com lost
# the certificate that was serving it and went down.
#
# The apex has to move in this order instead:
#
#   1. Populate gs://quill-medical-app-landing, so the apex has something
#      to serve when it arrives.
#   2. Move the DNS for quill-medical.com and www to 34.49.99.83. The
#      apex is then served by this project on teaching's certificate,
#      which still covers it.
#   3. Only then set this back to "quill-medical.com". Every domain can
#      validate, so the certificate replacement is not an outage.
landing_domain = null

backend_image   = "gcr.io/cloudrun/hello:latest"
frontend_image  = "gcr.io/cloudrun/hello:latest"
admin_image     = "gcr.io/cloudrun/hello:latest"
transcode_image = "gcr.io/cloudrun/hello:latest"
caption_image   = "gcr.io/cloudrun/hello:latest"

# The apex joins this when this project actually serves it, which is
# step 2 above. Monitoring a host served by another project would alert
# this one about a failure it cannot cause and cannot fix.
monitored_hostnames        = ["app.quill-medical.com"]
app_domain                 = "app.quill-medical.com"
alert_email                = "info@quill-medical.com"
cloud_run_services         = ["quill-backend-app", "quill-frontend-app"]

# The teaching project's CI account, not this project's. The content
# pipeline in eoeeta-teaching and respiratory-teaching authenticates with
# GCP_SERVICE_ACCOUNT, which still names the old project, so that is the
# identity writing to this bucket. Change it to
# github-actions@quill-medical-app.iam.gserviceaccount.com when those
# secrets move, which is Batch 8.
content_ci_service_account = "github-actions@quill-medical-teaching.iam.gserviceaccount.com"

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
