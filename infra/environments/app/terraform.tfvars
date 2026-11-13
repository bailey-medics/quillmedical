# environments/app/terraform.tfvars - App configuration
#
# The Quill Medical product

project_id  = "quill-medical-app"
region      = "europe-west2"
environment = "app"
domain      = "quill-medical.com"

# This environment holds the quill-medical.com zone. No other may set it.
manage_dns_zone = true

# One dedicated vCPU and 3.75 GB. Google keeps the shared-core tiers,
# db-f1-micro and db-g1-small, out of the Cloud SQL SLA and says not to
# run production on them. This tier also sets how many connections
# Postgres accepts, 100 by default at this memory size, and the pool in
# backend/app/db/core_db.py is sized against that number: change one
# and check the other.
db_tier     = "db-custom-1-3840"
enable_fhir = false # No FHIR/EHRbase - single auth DB + Cloud Storage
enable_ha   = false

cloud_run_max_instances = 5

lb_domains = ["app.quill-medical.com"]
# The apex, served from gs://quill-medical-app-landing-uk behind this load
# balancer.
#
# The order here is fixed by how Google validates a managed certificate.
# A certificate is attached to a proxy, not to a hostname, so moving the
# DNS first does not let the app project serve the apex on teaching's
# certificate: the handshake fails
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
scan_image      = "gcr.io/cloudrun/hello:latest"

# The apex is monitored from here once this project serves it. The uptime
# check probes app_domain at /api/health and everything else at /, which
# suits a static landing site with no API.
monitored_hostnames = ["app.quill-medical.com", "quill-medical.com"]
app_domain          = "app.quill-medical.com"
alert_email         = "info@quill-medical.com"
cloud_run_services  = ["quill-backend-app", "quill-frontend-app"]

# Who decides whether a closed account's training records are deleted
# once their sponsor's period has passed. Told when any are waiting.
retention_decision_email = "mark@quill-medical.com"

# The content pipeline in eoeeta-teaching and respiratory-teaching
# authenticates as this account and publishes question banks into
# quill-images-app. The framework pipeline in the four -framework
# repositories (infra/github/framework_rulesets.tf) uses it too, only to
# start the framework sync job, which reads those repositories itself. It
# is scoped to that bucket and those jobs, unlike the teaching CI
# account it replaced, which carried roles/editor across the whole
# project.
content_ci_service_account = "content-sync@quill-medical-app.iam.gserviceaccount.com"
deploy_service_account     = "github-deploy@quill-medical-app.iam.gserviceaccount.com"

# `terraform plan` on a pull request signs in as this account. It may read
# the secrets the plan reads, listed in runtime-identities.tf, and no other.
plan_service_account = "github-plan@quill-medical-app.iam.gserviceaccount.com"

# The monitoring module looks a Slack channel up by display name rather
# than creating one, because a Slack channel can only be made through the
# console's OAuth consent flow, which produces an auth_token nothing else
# can mint. This one was made that way and posts to the same
# #quill-medical-cicd channel as the deploy notifications. The name has to
# match the console's display name exactly.
slack_channel_display_name = "quill-medical-cicd"


# Whether this environment should have these alert channels at all. Static
# config rather than a test on whether the secret holds a value: a `count`
# must be known at plan time, and those values are read from Secret Manager.
# Both channels are deployed, so both are true - setting either false would
# destroy the channel.
enable_sms_channel       = true
enable_pagerduty_channel = true

# Whose passport the admin job's `delete-passport` action may delete, for
# testing. Exact usernames, never a pattern.
passport_deletable_usernames = [
  "mark.bailey.superadmin",
  "mark.bailey.admin",
  "mark.bailey",
]
