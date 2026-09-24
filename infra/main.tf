# main.tf — Root module wiring all infrastructure together
#
# Usage:
#   cd infra/
#   terraform init
#   terraform plan -var-file=environments/staging/terraform.tfvars
#   terraform apply -var-file=environments/staging/terraform.tfvars

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

locals {
  # Which environments run the teaching product: the teaching buckets, the
  # video pipeline, the sync token secret, and clinical services switched
  # off.
  #
  # `teaching` was removed on 2026-09-23, once its workspace had been
  # destroyed and there was nothing live for these conditions to turn
  # off. It stayed in the list until then because most of the conditions
  # below are `count`: dropping it while the old project was still
  # running would have read to Terraform as an instruction to destroy
  # what they gate, the Cloud SQL instance and the video and content
  # buckets among them.
  #
  # Still a list rather than a bare comparison, because a second project
  # running this product is what the migration just did and may do again.
  teaching_product_environments = ["app"]

  is_teaching_product = contains(
    local.teaching_product_environments, var.environment
  )
}

# ---------- Artifact Registry ----------
resource "google_artifact_registry_repository" "docker" {
  project       = var.project_id
  location      = var.region
  repository_id = "quill"
  format        = "DOCKER"
  description   = "Container images for Quill Medical (${var.environment})"
}

# ---------- Secrets (created first, values set manually) ----------
module "secrets" {
  source     = "./modules/secrets"
  project_id = var.project_id

  secrets = concat(
    [
      "jwt-secret",
      "core-db-password",
      "vapid-private",
      "resend-api-key",

      # Alerting. These reach Terraform from GitHub today, which makes GitHub
      # a custodian of a credential no workflow actually uses — it only relays
      # them. Creating the containers here is the first half of moving them:
      # the values are added by hand afterwards, then a second change switches
      # Terraform to read them from here and drops the TF_VAR wiring. One
      # apply cannot do both, because a data source cannot read a version that
      # does not exist yet.
      "pagerduty-service-key",
      "alert-sms-number",
    ],
    var.enable_fhir ? [
      "fhir-db-password",
      "ehrbase-db-password",
      "ehrbase-api-password",
      "ehrbase-admin-password",
    ] : [],
    # The video signing key is the one secret Terraform both creates and fills:
    # the load balancer validates cookies with it and the backend mints them
    # with it, so the two must be the same bytes and no human types it in.
    local.is_teaching_product ? [
      "teaching-video-signing-key",
      "teaching-sync-token",
      "teaching-transcode-callback-token",
    ] : []
  )
}

# `teaching-sync-token` predates this declaration. It was created by hand on
# 2026-05-24 and referenced in the Cloud Run env mapping ever since, without
# Terraform ever managing it — so a live secret had no declared owner and
# nothing recorded that it should exist.
#
# A plain create would fail the apply with "already exists", so the existing
# secret is imported. Only the container comes under management; the value
# stays exactly where it is and is never read here, which is what
# modules/secrets' convention asks for.
# Gated on the environment, unlike the admin-job import below: that resource
# exists everywhere, this secret only in teaching. An unconditional import
# would have prod and staging try to adopt a secret that is not there.
import {
  for_each = local.is_teaching_product ? toset(["teaching-sync-token"]) : toset([])
  to       = module.secrets.google_secret_manager_secret.secrets[each.key]
  id       = "projects/${var.project_id}/secrets/${each.key}"
}

# ---------- Alerting secrets ----------
#
# Read from Secret Manager rather than relayed through GitHub. No workflow
# uses either value; both were only being carried to Terraform, which made
# GitHub a second custodian of a live credential and a personal number for no
# benefit. See the secrets rule in CLAUDE.md.
#
# Values are set by hand with `gcloud secrets versions add`, per the
# convention in modules/secrets: Terraform creates the containers, never the
# versions. The provider marks secret_data sensitive, so neither appears in
# plan output.
data "google_secret_manager_secret_version" "pagerduty_service_key" {
  project = var.project_id
  secret  = "pagerduty-service-key"

  depends_on = [module.secrets]
}

data "google_secret_manager_secret_version" "alert_sms_number" {
  project = var.project_id
  secret  = "alert-sms-number"

  depends_on = [module.secrets]
}

# ---------- Networking ----------
module "networking" {
  source      = "./modules/networking"
  project_id  = var.project_id
  region      = var.region
  environment = var.environment
}

# Rename: cloud_sql_auth → cloud_sql_core (no resource recreation)
moved {
  from = module.cloud_sql_auth
  to   = module.cloud_sql_core
}

# ---------- Cloud SQL: core database (all environments) ----------
module "cloud_sql_core" {
  source      = "./modules/cloud-sql"
  project_id  = var.project_id
  region      = var.region
  environment = var.environment

  instance_name          = "core"
  db_name                = "quill_core"
  db_user                = "quill"
  db_password_secret_id  = "core-db-password"
  tier                   = var.db_tier
  enable_ha              = var.enable_ha
  vpc_network_id         = module.networking.vpc_id
  private_vpc_connection = module.networking.private_vpc_connection
  secret_depends_on      = module.secrets.secret_ids

  # Production gets longer backup retention
  backup_retained_count = var.environment == "prod" ? 30 : 7
  pitr_enabled          = var.environment == "prod"
  pitr_days             = var.environment == "prod" ? 7 : 3
}

# ---------- Cloud SQL: FHIR database (prod + staging only) ----------
module "cloud_sql_fhir" {
  count       = var.enable_fhir ? 1 : 0
  source      = "./modules/cloud-sql"
  project_id  = var.project_id
  region      = var.region
  environment = var.environment

  instance_name          = "fhir"
  db_name                = "fhir"
  db_user                = "fhir"
  db_password_secret_id  = "fhir-db-password"
  tier                   = var.db_tier
  enable_ha              = var.enable_ha
  vpc_network_id         = module.networking.vpc_id
  private_vpc_connection = module.networking.private_vpc_connection
  secret_depends_on      = module.secrets.secret_ids

  backup_retained_count = var.environment == "prod" ? 30 : 7
  pitr_enabled          = var.environment == "prod"
  pitr_days             = var.environment == "prod" ? 7 : 3
}

# ---------- Cloud SQL: EHRbase database (prod + staging only) ----------
module "cloud_sql_ehrbase" {
  count       = var.enable_fhir ? 1 : 0
  source      = "./modules/cloud-sql"
  project_id  = var.project_id
  region      = var.region
  environment = var.environment

  instance_name          = "ehrbase"
  db_name                = "ehrbase"
  db_user                = "ehrbase"
  db_password_secret_id  = "ehrbase-db-password"
  tier                   = var.db_tier
  enable_ha              = var.enable_ha
  vpc_network_id         = module.networking.vpc_id
  private_vpc_connection = module.networking.private_vpc_connection
  secret_depends_on      = module.secrets.secret_ids

  backup_retained_count = var.environment == "prod" ? 30 : 7
  pitr_enabled          = var.environment == "prod"
  pitr_days             = var.environment == "prod" ? 7 : 3
}

# ---------- Compute Engine: FHIR + EHRbase VM (prod + staging) ----------
module "compute_fhir" {
  count       = var.enable_fhir ? 1 : 0
  source      = "./modules/compute-fhir"
  project_id  = var.project_id
  region      = var.region
  environment = var.environment

  subnet_id = module.networking.subnet_id

  fhir_db_host                  = module.cloud_sql_fhir[0].private_ip
  fhir_db_password_secret       = "fhir-db-password"
  ehrbase_db_host               = module.cloud_sql_ehrbase[0].private_ip
  ehrbase_db_password_secret    = "ehrbase-db-password"
  ehrbase_api_password_secret   = "ehrbase-api-password"
  ehrbase_admin_password_secret = "ehrbase-admin-password"
}

# ---------- IAM: Cloud Run → Secret Manager ----------
data "google_project" "project" {
  project_id = var.project_id
}

resource "google_project_iam_member" "cloudrun_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${data.google_project.project.number}-compute@developer.gserviceaccount.com"
}

# Cloud Run needs to sign its own tokens to generate GCS signed URLs
resource "google_service_account_iam_member" "cloudrun_token_creator" {
  count              = local.is_teaching_product ? 1 : 0
  service_account_id = "projects/${var.project_id}/serviceAccounts/${data.google_project.project.number}-compute@developer.gserviceaccount.com"
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${data.google_project.project.number}-compute@developer.gserviceaccount.com"
}

# ---------- Initial secret values (jwt-secret, vapid-private) ----------
# These are generated once by Terraform. Replace vapid-private with a real
# VAPID key via `gcloud secrets versions add` before going live.
resource "random_password" "jwt_secret" {
  length  = 64
  special = true
}

resource "google_secret_manager_secret_version" "jwt_secret" {
  secret      = "projects/${var.project_id}/secrets/jwt-secret"
  secret_data = random_password.jwt_secret.result
  depends_on  = [module.secrets]
}

# The transcode job's completion report is authenticated with a shared
# secret, so Terraform both generates and fills it — the same reasoning as
# the video signing key, and the same exception to modules/secrets'
# usual convention that Terraform creates containers and humans add
# versions. Two ends must hold identical bytes; a human typing it into
# both is a transcription error waiting to happen, and there is nothing
# to be gained by anyone ever seeing it.
resource "random_password" "transcode_callback_token" {
  count   = local.is_teaching_product ? 1 : 0
  length  = 48
  special = false
}

resource "google_secret_manager_secret_version" "transcode_callback_token" {
  count       = local.is_teaching_product ? 1 : 0
  secret      = "projects/${var.project_id}/secrets/teaching-transcode-callback-token"
  secret_data = random_password.transcode_callback_token[0].result
  depends_on  = [module.secrets]
}

resource "random_password" "vapid_placeholder" {
  length  = 32
  special = false
}

resource "google_secret_manager_secret_version" "vapid_private" {
  secret      = "projects/${var.project_id}/secrets/vapid-private"
  secret_data = random_password.vapid_placeholder.result
  depends_on  = [module.secrets]
}

# ---------- Cloud Run: backend ----------
module "cloud_run_backend" {
  source = "./modules/cloud-run"

  # Its own identity; see infra/runtime-identities.tf.
  service_account_email = google_service_account.runtime["backend"].email
  project_id            = var.project_id
  region                = var.region
  environment           = var.environment

  service_name      = "backend"
  image             = var.backend_image
  port              = 8000
  memory            = "512Mi"
  cpu               = "1"
  max_instances     = var.cloud_run_max_instances
  vpc_connector_id  = module.networking.vpc_connector_id
  health_check_path = "/api/health"

  # Only the load balancer and the VPC may reach it, so the *.run.app URL
  # can no longer skip Cloud Armor. The deploy's smoke test still reaches a
  # tagged revision because it runs inside quill-admin, whose egress goes
  # through the VPC (see vpc_egress on that job below). Closing this before
  # that existed broke every deploy on 2026-09-21. See Phase 1 and Phase D of
  # docs/docs/plans/2026-09-18-environment-isolation-and-iap-plan.md.
  ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  env_vars = merge(
    {
      BACKEND_ENV    = "production"
      SECURE_COOKIES = "true"
      # No COOKIE_DOMAIN: unset means host-only, so a cookie set by this
      # host is never sent to another subdomain of quill-medical.com.
      FRONTEND_URL    = "https://${var.lb_domains[0]}"
      CORE_DB_HOST    = module.cloud_sql_core.private_ip
      CORE_DB_NAME    = module.cloud_sql_core.database_name
      CORE_DB_USER    = module.cloud_sql_core.database_user
      CORE_DB_SSLMODE = "require"
    },
    var.enable_fhir ? {
      FHIR_SERVER_URL = "http://${module.compute_fhir[0].internal_ip}:8080/fhir"
      EHRBASE_URL     = "http://${module.compute_fhir[0].internal_ip}:8081/ehrbase"
      FHIR_DB_HOST    = module.cloud_sql_fhir[0].private_ip
      FHIR_DB_NAME    = module.cloud_sql_fhir[0].database_name
      FHIR_DB_USER    = module.cloud_sql_fhir[0].database_user
      EHRBASE_DB_HOST = module.cloud_sql_ehrbase[0].private_ip
      EHRBASE_DB_NAME = module.cloud_sql_ehrbase[0].database_name
      EHRBASE_DB_USER = module.cloud_sql_ehrbase[0].database_user
    } : {},
    local.is_teaching_product ? {
      CLINICAL_SERVICES_ENABLED = "false"
      TEACHING_STORAGE_BACKEND  = "gcs"
      TEACHING_GCS_BUCKET       = module.cloud_storage[0].bucket_name
      TEACHING_IMAGES_BASE_URL  = "https://storage.googleapis.com/${module.cloud_storage[0].bucket_name}"

      # Video. The signing key itself is a secret and is mapped below; these
      # four are not secret, but without them the feature is inert rather
      # than broken: the upload endpoint refuses with 503 because it has no
      # bucket to write to, and the access endpoint falls back to the local
      # development route and mints no cookie at all.
      TEACHING_VIDEOS_SOURCE_BUCKET   = module.teaching_video_pipeline[0].source_bucket_name
      TEACHING_VIDEOS_BUCKET          = module.teaching_video_pipeline[0].processed_bucket_name
      TEACHING_VIDEO_SIGNING_KEY_NAME = module.teaching_video_pipeline[0].signing_key_name

      # The job `link_module_media` invokes once an upload lands. Written
      # out rather than taken from the module's `id` output: this is the
      # name `run_job` addresses, the API wants the fully-qualified form,
      # and a wrong value fails at runtime inside a handler that logs and
      # swallows — so it would present as "transcoding silently never
      # happens" rather than as an error anyone sees.
      #
      # Unset until now, which is why no upload has ever been transcoded:
      # `start_transcode` reads this, finds nothing, logs "transcode not
      # configured" and returns. Everything downstream was built and
      # tested; this one line is what connects it.
      TEACHING_TRANSCODE_JOB = join("/", [
        "projects", var.project_id,
        "locations", var.region,
        "jobs", "quill-transcode-${var.environment}",
      ])

      # The caption job, fired from the transcode completion report once a
      # 720p rendition exists for Whisper to read.
      #
      # Every other half of the caption wiring shipped without this one:
      # the setting in `config.py`, `start_caption` reading it, the
      # invoker grant below, the deploy step pointing the job at its
      # image, and the job's own callback URL and token. Only the line
      # naming the job to the backend was missing, so the first real
      # transcode completed, called `start_caption`, found nothing
      # configured and returned — leaving "No captions" on the admin card
      # with no job ever having run.
      #
      # It failed exactly as designed: `start_caption` treats an unset
      # job as development rather than as an error. That is right for a
      # laptop and invisible in production, which is the trade this
      # comment exists to flag.
      TEACHING_CAPTION_JOB = join("/", [
        "projects", var.project_id,
        "locations", var.region,
        "jobs", "quill-caption-${var.environment}",
      ])

      # Same host as the app, deliberately: the load balancer routes
      # /videos/* to the backend bucket, so the signed cookie is same-origin
      # and the browser sends it on media requests with no cross-site
      # handling. A different host here would scope every cookie to
      # somewhere the player never asks.
      TEACHING_VIDEO_BASE_URL = "https://${var.app_domain}/videos"
    } : {},
    {
      # Set in every environment: this one setting decides where passports
      # live, and unset would silently fall back to a local directory that
      # Cloud Run does not durably have. There is deliberately no companion
      # PASSPORT_STORAGE_BACKEND — see the comment in backend/app/config.py.
      PASSPORT_GCS_BUCKET = module.passport_storage.bucket_name
    },
    {
      EMAIL_FROM    = "info@quill-medical.com"
      EMAIL_DRY_RUN = "false"
    }
  )

  secret_env_vars = local.backend_secret_env_vars

  depends_on = [
    google_secret_manager_secret_version.jwt_secret,
    google_secret_manager_secret_version.vapid_private,
    google_project_iam_member.cloudrun_secret_accessor,
    module.cloud_sql_core, # writes core-db-password version
  ]
}

# ---------- Cloud Run Job: admin tasks ----------
import {
  to = module.cloud_run_admin_job.google_cloud_run_v2_job.job
  id = "projects/${var.project_id}/locations/${var.region}/jobs/quill-admin-${var.environment}"
}

module "cloud_run_admin_job" {
  source = "./modules/cloud-run-job"

  # Its own identity; see infra/runtime-identities.tf.
  service_account_email = google_service_account.runtime["admin"].email
  project_id            = var.project_id
  region                = var.region
  environment           = var.environment

  job_name         = "admin"
  image            = var.admin_image
  vpc_connector_id = module.networking.vpc_connector_id

  # All egress through the VPC, so the deploy's smoke test, which runs in
  # this job, reaches a revision's *.run.app URL as internal traffic. That
  # is what lets the backend's ingress close without the check going blind:
  # closing it on 2026-09-21 broke every deploy because the smoke test
  # curled that URL from the internet. Public calls still leave, through
  # the Cloud NAT in modules/networking.
  vpc_egress = "ALL_TRAFFIC"

  env_vars = {
    CORE_DB_HOST = module.cloud_sql_core.private_ip
    CORE_DB_NAME = module.cloud_sql_core.database_name
    CORE_DB_USER = module.cloud_sql_core.database_user
  }

  secret_env_vars = local.admin_secret_env_vars

  depends_on = [
    google_project_iam_member.cloudrun_secret_accessor,
    module.cloud_sql_core,
  ]
}

# ---------- Cloud Run Job: video transcode (teaching only) ----------
# Produces the renditions a learner is served, from one uploaded source
# object. Gated on the environment for the same reason the pipeline module is:
# prod and staging have no video buckets for it to read or write.
#
# No VPC connector is wanted here — unlike the admin job, which reaches Cloud
# SQL on a private address, this one talks only to GCS and holds no database
# connection at all. It is given one regardless because the module requires it,
# and `PRIVATE_RANGES_ONLY` egress leaves the public GCS endpoint reachable.
#
# Terraform does not track the image: CI pushes it and
# `gcloud run jobs execute --image` sets it at call time, as it already does
# for the admin job. The module's `ignore_changes` on the image is what makes
# that safe.
module "cloud_run_transcode_job" {
  count  = local.is_teaching_product ? 1 : 0
  source = "./modules/cloud-run-job"

  # Its own identity; see infra/runtime-identities.tf.
  service_account_email = google_service_account.runtime["transcode"].email
  project_id            = var.project_id
  region                = var.region
  environment           = var.environment

  job_name         = "transcode"
  image            = var.transcode_image
  vpc_connector_id = module.networking.vpc_connector_id

  # Encoding is CPU-bound and the whole source file is held on local disk
  # while FFmpeg works on it, so both are sized above the module defaults.
  cpu    = "4"
  memory = "4Gi"

  # Deliberate rather than the module's default: a hung job burns its full
  # timeout before failing, and a lecture that has not encoded in twenty
  # minutes has gone wrong rather than gone slowly.
  timeout = "1200s"

  env_vars = {
    TEACHING_VIDEOS_SOURCE_BUCKET = module.teaching_video_pipeline[0].source_bucket_name
    TEACHING_VIDEOS_BUCKET        = module.teaching_video_pipeline[0].processed_bucket_name

    # Where the job reports that its outputs verified. Until that report
    # lands `transcoded_at` stays null and the module stays hidden, so
    # this is what turns a finished encode into a playable module.
    #
    # The public app domain rather than an internal address: the job's
    # VPC egress is PRIVATE_RANGES_ONLY, so public traffic leaves
    # directly and this resolves the same way a browser would.
    TRANSCODE_CALLBACK_URL = "https://${var.app_domain}/api/ci/teaching/transcode-complete"
  }

  secret_env_vars = local.transcode_secret_env_vars

  depends_on = [module.teaching_video_pipeline]
}

# The backend invokes this job, so it needs permission to. Nothing else
# grants it: the runtime service account holds only
# `roles/secretmanager.secretAccessor` at project level, not the broad
# editor role a default Compute Engine account is often assumed to carry.
#
# Scoped to this one job rather than granted project-wide, because the
# backend has no business starting any other job — the admin job runs
# migrations and is CI's to invoke, not the serving application's.
#
# Without this, `start_transcode` raises inside its own try/except, logs,
# and returns None. The upload still succeeds and the module stays
# hidden, which is the safe direction but an entirely silent failure.
#
# **`jobsExecutorWithOverrides`, not `invoker`.** Starting a job as
# configured is `run.jobs.run`, which `roles/run.invoker` confers.
# Starting one with container overrides — which is how the three ids
# reach the job, and the only way they can, since each execution needs
# different ones — is `run.jobs.runWithOverrides`, a separate permission
# that `run.invoker` does not include. Granting the narrower role first
# produced exactly the silent failure described above, with the
# distinction visible only in the traceback:
#
#   PERMISSION_DENIED: Permission 'run.jobs.runWithOverrides' denied on
#   resource '.../jobs/quill-transcode-teaching'
#
# `roles/run.developer` and `roles/run.admin` also carry it, and both
# carry a great deal else besides. This role is the two permissions and
# nothing more, which is what a serving application should hold.
resource "google_cloud_run_v2_job_iam_member" "backend_invokes_transcode" {
  count = local.is_teaching_product ? 1 : 0

  project  = var.project_id
  location = var.region
  name     = module.cloud_run_transcode_job[0].job_name
  role     = "roles/run.jobsExecutorWithOverrides"
  member   = "serviceAccount:${data.google_project.project.number}-compute@developer.gserviceaccount.com"
}

# The same grant for captions, needed for the same reason. The backend
# fires this job too — from the transcode completion report rather than
# from the upload, because Whisper transcribes the 720p rendition and
# that does not exist until the transcode job has written it.
resource "google_cloud_run_v2_job_iam_member" "backend_invokes_caption" {
  count = local.is_teaching_product ? 1 : 0

  project  = var.project_id
  location = var.region
  name     = module.cloud_run_caption_job[0].job_name
  role     = "roles/run.jobsExecutorWithOverrides"
  member   = "serviceAccount:${data.google_project.project.number}-compute@developer.gserviceaccount.com"
}

# ---------- Cloud Run Job: video captions (teaching only) ----------
# Whisper over a transcoded lecture, writing WebVTT beside the renditions.
# Captions are a WCAG 2.1 AA requirement for the learning centre.
#
# Reads the processed bucket and writes back to it, so it needs no access to
# the source bucket at all — the transcode job has usually deleted the master
# by the time captions are wanted, which is why the 720p rendition is the
# input.
#
# Sized for the model rather than the media: Whisper holds weights in memory
# and is far more memory-hungry than FFmpeg, hence 10 GB against the transcode
# job's 4. The hour-long timeout is the plan's figure and deliberate — a
# transcription that has not finished in an hour has gone wrong.
module "cloud_run_caption_job" {
  count  = local.is_teaching_product ? 1 : 0
  source = "./modules/cloud-run-job"

  # Its own identity; see infra/runtime-identities.tf.
  service_account_email = google_service_account.runtime["caption"].email
  project_id            = var.project_id
  region                = var.region
  environment           = var.environment

  job_name         = "caption"
  image            = var.caption_image
  vpc_connector_id = module.networking.vpc_connector_id

  cpu     = "4"
  memory  = "10Gi"
  timeout = "3600s"

  env_vars = {
    TEACHING_VIDEOS_BUCKET = module.teaching_video_pipeline[0].processed_bucket_name

    # Its own endpoint, not the transcode one. A caption report names a
    # single output, and the transcode callback rewrites every rendition
    # flag from the list it is given — so sending captions there would
    # clear `has_1080p` and `has_poster` and claim a transcode that did
    # not happen.
    CAPTION_CALLBACK_URL = "https://${var.app_domain}/api/ci/teaching/caption-complete"
  }

  secret_env_vars = local.caption_secret_env_vars

  depends_on = [module.teaching_video_pipeline]
}

# ---------- Cloud Run: frontend ----------
module "cloud_run_frontend" {
  source = "./modules/cloud-run"

  # Its own identity; see infra/runtime-identities.tf.
  service_account_email = google_service_account.runtime["frontend"].email
  project_id            = var.project_id
  region                = var.region
  environment           = var.environment

  service_name      = "frontend"
  image             = var.frontend_image
  port              = 8080
  memory            = "512Mi"
  cpu               = "1"
  max_instances     = var.cloud_run_max_instances
  health_check_path = "/healthz"

  # As for the backend above. The frontend deploy has no tagged-revision
  # smoke test to break: it updates the service directly, and the check
  # after it goes through the public hostname.
  ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
}

# ---------- Global HTTPS Load Balancer ----------
module "load_balancer" {
  source      = "./modules/load-balancer"
  project_id  = var.project_id
  region      = var.region
  environment = var.environment

  domains               = var.lb_domains
  landing_domain        = var.landing_domain
  backend_service_name  = module.cloud_run_backend.service_name
  frontend_service_name = module.cloud_run_frontend.service_name

  # Null outside teaching, so prod and staging render an unchanged URL map.
  videos_backend_bucket_id = local.is_teaching_product ? module.teaching_video_pipeline[0].backend_bucket_id : null
}

# ---------- Cloud Storage: teaching images (teaching only) ----------
module "cloud_storage" {
  count          = local.is_teaching_product ? 1 : 0
  source         = "./modules/cloud-storage"
  project_id     = var.project_id
  project_number = data.google_project.project.number
  region         = var.region
  environment    = var.environment

  # Who uploads content here. While the environment is moving between
  # projects this is the old project's CI account, because the teaching
  # content pipeline still authenticates as it: see
  # docs/docs/plans/2026-09-18-environment-isolation-and-iap-plan.md.
  ci_service_account = var.content_ci_service_account
}

# ---------- Cloud Storage: clinician passports (all environments) ----------
# Not gated on an environment, unlike the teaching buckets above. A passport
# is a personal record rather than a feature of one deployment, and an empty
# bucket costs nothing until something is written to it — so every environment
# has somewhere to put one rather than needing infrastructure work the day the
# feature is switched on. Whether the passport feature is enabled at all stays
# an organisation-level decision in the application.
module "passport_storage" {
  source      = "./modules/passport-storage"
  project_id  = var.project_id
  region      = var.region
  environment = var.environment

  # The Cloud Run default compute service account, as the bindings at the top
  # of this file name it. It does not inherit object-level access from project
  # editor, so the module grants it explicitly.
  service_account_email = "${data.google_project.project.number}-compute@developer.gserviceaccount.com"
}

# ---------- Teaching video pipeline (teaching only) ----------
module "teaching_video_pipeline" {
  count          = local.is_teaching_product ? 1 : 0
  source         = "./modules/teaching-video-pipeline"
  project_id     = var.project_id
  project_number = data.google_project.project.number
  region         = var.region
  environment    = var.environment

  # The same host the app is served from, which is what makes the signed
  # cookie same-origin — and what the bucket must name in CORS, because
  # the upload itself goes cross-origin to storage.googleapis.com.
  app_origin = "https://${var.app_domain}"

  # The signing key is written as a secret version, so the container must exist.
  depends_on = [module.secrets]
}

# ---------- Monitoring: uptime checks + alerting ----------
module "monitoring" {
  source      = "./modules/monitoring"
  project_id  = var.project_id
  environment = var.environment

  monitored_hostnames        = var.monitored_hostnames
  app_domain                 = var.app_domain
  alert_email                = var.alert_email
  alert_sms_number           = data.google_secret_manager_secret_version.alert_sms_number.secret_data
  pagerduty_service_key      = data.google_secret_manager_secret_version.pagerduty_service_key.secret_data
  enable_sms_channel         = var.enable_sms_channel
  enable_pagerduty_channel   = var.enable_pagerduty_channel
  slack_channel_display_name = var.slack_channel_display_name
  cloud_run_services         = var.cloud_run_services

  # The analytics module is conditional on a landing domain, so the metric may
  # not exist. Null here means the browser error policy is not created, rather
  # than a policy pointing at a metric that was never made.
  client_errors_metric = var.landing_domain != null ? module.analytics[0].client_errors_metric : null

  # Same conditionality, and additionally only where video is served at all:
  # prod and staging have no video buckets, so a 404 under /videos/ there is
  # an unrecognised path falling through to the frontend, not rendition drift.
  video_not_found_metric = (
    var.landing_domain != null && local.is_teaching_product
    ? module.analytics[0].video_not_found_metric
    : null
  )
}

# ---------- Analytics: usage metrics, archive, and the shared dashboard ----------
module "analytics" {
  count  = var.landing_domain != null ? 1 : 0
  source = "./modules/analytics"

  project_id  = var.project_id
  environment = var.environment

  landing_domain = var.landing_domain
  app_domain     = var.app_domain
}

# ---------- Adopt the app certificate Terraform never recorded ----------
#
# `quill-cert-app-6bc99c16` exists in `quill-medical-app` and serves all
# three app domains, but it is not in state, so every apply tries to
# create it and fails with a 409. It got that way on 2026-09-22: adding
# `landing_domain` forced a replacement, the create half succeeded, and
# the apply then failed on an unrelated alert policy before the new
# certificate was written to state.
#
# Importing adopts it rather than recreating it. That matters because a
# managed certificate takes fifteen to sixty minutes to validate, and
# this one is already `ACTIVE` on all three domains. Recreating would
# mean another outage on a site that is currently serving.
#
# Guarded to `app` because the module is shared. Teaching's certificate
# is already in state, and an unguarded block would try to import this
# id over the top of it.
import {
  for_each = var.environment == "app" ? toset(["6bc99c16"]) : toset([])

  to = module.load_balancer.google_compute_managed_ssl_certificate.cert
  id = "projects/${var.project_id}/global/sslCertificates/quill-cert-${var.environment}-${each.key}"
}
