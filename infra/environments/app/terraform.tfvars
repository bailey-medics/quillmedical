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
# The DNS record for app.quill-medical.com was created by hand in Batch 5.
# From Batch 10a the whole quill-medical.com zone is in Terraform, held by
# this environment: see manage_dns_zone below and infra/dns.tf.

project_id  = "quill-medical-app"
region      = "europe-west2"
environment = "app"
domain      = "quill-medical.com"

# This environment holds the quill-medical.com zone. No other may set it.
manage_dns_zone = true

db_tier     = "db-f1-micro"
enable_fhir = false # No FHIR/EHRbase — single auth DB + Cloud Storage
enable_ha   = false

cloud_run_max_instances = 5

lb_domains = ["app.quill-medical.com"]
# The apex, served from gs://quill-medical-app-landing behind this load
# balancer.
#
# The order here is fixed by how Google validates a managed certificate,
# and 2026-09-22 established it the hard way. A certificate is attached to
# a proxy, not to a hostname, so moving the DNS first does not let the app
# project serve the apex on teaching's certificate: the handshake fails
# because this project's certificate does not carry the name. And the
# certificate cannot validate the apex while the DNS still points
# elsewhere, because validation resolves the domain.
#
# What breaks the circle is that validation runs over HTTP on port 80, not
# HTTPS. So: name the domains here, move the DNS, and let validation
# complete. Between those two the apex resolves to a load balancer whose
# certificate does not cover it, so HTTPS fails for the apex until the
# certificate goes active. Minutes to an hour, and deliberate.
landing_domain = "quill-medical.com"

backend_image   = "gcr.io/cloudrun/hello:latest"
frontend_image  = "gcr.io/cloudrun/hello:latest"
admin_image     = "gcr.io/cloudrun/hello:latest"
transcode_image = "gcr.io/cloudrun/hello:latest"
caption_image   = "gcr.io/cloudrun/hello:latest"

# The apex is monitored from here once this project serves it. The uptime
# check probes app_domain at /api/health and everything else at /, which
# suits a static landing site with no API.
monitored_hostnames = ["app.quill-medical.com", "quill-medical.com"]
app_domain          = "app.quill-medical.com"
alert_email         = "info@quill-medical.com"
cloud_run_services  = ["quill-backend-app", "quill-frontend-app"]

# The content pipeline in eoeeta-teaching and respiratory-teaching
# authenticates as this account and publishes question banks into
# quill-images-app. It is scoped to that bucket and holds nothing else,
# unlike the teaching CI account it replaced on 2026-09-23, which carried
# roles/editor across the whole project.
content_ci_service_account = "content-sync@quill-medical-app.iam.gserviceaccount.com"

# The monitoring module looks a Slack channel up by display name rather
# than creating one, because a Slack channel can only be made through the
# console's OAuth consent flow, which produces an auth_token nothing else
# can mint. This one was made that way on 2026-09-23 and posts to the same
# #quill-medical-cicd channel as the deploy notifications. The name has to
# match the console's display name exactly.
slack_channel_display_name = "quill-medical-cicd"


# Whether this environment should have these alert channels at all. Static
# config rather than a test on whether the secret holds a value: a `count`
# must be known at plan time, and those values are read from Secret Manager.
# Both channels are deployed, so both are true — setting either false would
# destroy the channel.
enable_sms_channel       = true
enable_pagerduty_channel = true
