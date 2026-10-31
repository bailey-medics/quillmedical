# Google Cloud Platform infrastructure

## Overview

Quill Medical runs on one GCP project, in **europe-west2** (London). Three earlier projects are retired:

| Environment | Project ID                 | Purpose                                           | Status  |
| ----------- | -------------------------- | ------------------------------------------------- | ------- |
| App         | `quill-medical-app`        | Teaching, clinician passport and the landing page | Active  |
| Production  | `quill-medical-production` | Clinical app for real patients                    | Retired |
| Staging     | `quill-medical-staging`    | Integration testing + landing page                | Retired |
| Teaching    | `quill-medical-teaching`   | Teaching and clinician passport                   | Retired |

Only app is deployed. Staging, teaching and production were retired and their configurations removed; only `infra/environments/app/` remains. See [Retired environments](#retired-environments) below.

!!! note "The setup log below is older than this"
    The steps under "What has been set up" were written when staging, teaching and production existed. Today there is one load balancer, in the app project, serving `app.quill-medical.com` and the landing page at `quill-medical.com`.

## Architecture

```
              ┌──────────────────────────┐
              │ Cloud DNS                │
              │ quill-medical.com zone   │
              └─────────────┬────────────┘
                            │
  app.quill-medical.com     │    quill-medical.com
                            │    www.quill-medical.com
     ┌──────────────────────▼──────────────────────┐
     │ Global HTTPS load balancer                  │
     │ one IP, one certificate                     │
     │ routes by host, then by path                │
     └─┬─────────────┬─────────────┬─────────────┬─┘
       │             │             │             │
    /api/*      /videos/*         /*       every path
       │             │             │             │
  ┌────▼─────┐  ┌────▼─────┐  ┌────▼─────┐  ┌────▼─────┐
  │ Backend  │  │ Videos   │  │ Frontend │  │ Landing  │
  │ Cloud Run│  │ bucket   │  │ Cloud Run│  │ bucket   │
  │ Cloud    │  │ Cloud CDN│  │ Cloud    │  │ Cloud CDN│
  │ Armor    │  │          │  │ Armor    │  │          │
  └────┬─────┘  └──────────┘  └──────────┘  └──────────┘
       │
  ┌────▼─────┐
  │ Cloud SQL│
  │ core DB  │
  └──────────┘
```

The first four routes are on the app host, and the fifth is on the landing hosts. The load balancer's five routes (`infra/modules/load-balancer/main.tf`; the diagram above leaves out `/guide-assets/*`):

- **`/api/*` on the app host** - the backend Cloud Run service (FastAPI)
- **`/videos/*` on the app host** - the teaching videos bucket, through Cloud CDN, which checks a signed cookie
- **`/guide-assets/*` on the app host** - the public screenshots bucket for the in-app guides, through Cloud CDN
- **Everything else on the app host** - the frontend Cloud Run service (Caddy serving the built React app)
- **Every path on `quill-medical.com` and `www.quill-medical.com`** - the landing site's bucket, through Cloud CDN

The Cloud Armor policy, a rate limit, is attached to the two Cloud Run backend services only. The three buckets have none.

The app environment has:

- **Global HTTPS Load Balancer** - host and path routing, Google-managed SSL
- **Cloud Run** - backend (FastAPI) and frontend (React/Vite), auto-scaling, plus the admin, transcode and caption jobs
- **Cloud SQL** - one PostgreSQL instance, the core database. There is no FHIR or EHRbase database (`enable_fhir = false`)
- **Cloud Storage** - the landing site, the teaching videos, the teaching content (question bank YAML and images, deployed by CI from the `eoeeta-teaching` and `respiratory-teaching` content repos) , the clinician passport and the in-app guides' screenshots
- **Secret Manager** - JWT keys, database passwords, VAPID keys
- **VPC** - private networking, no public database IPs
- **Monitoring** - uptime checks on `/api/health` (and `/` on the landing site) with email, Slack, SMS and PagerDuty alerts

## What has been set up

### GCP projects (done)

Three projects created in the GCP console, all linked to the same billing account.

### APIs enabled (done)

The following APIs were enabled on all three projects:

- Cloud Run
- Cloud SQL Admin
- Compute Engine (production and staging only)
- Secret Manager
- Artifact Registry
- Cloud DNS
- Service Networking
- Serverless VPC Access
- IAM
- Cloud Resource Manager
- Cloud Monitoring

### Terraform state bucket (done)

Remote state is stored in a versioned GCS bucket in the app project:

```
gs://quill-medical-app-terraform-state
```

It moved there from `gs://quill-medical-terraform-state`, in the production
project, on 2026-09-24, so that project could be deleted. The bucket is
created by hand, and `infra/backend.tf` holds the commands. Only the app
environment's CI account may read it, because state holds secrets in plain
text.

Terraform uses workspace prefixes to separate state per environment.

### Workload Identity Federation (done)

Each project has a WIF setup that lets GitHub Actions authenticate without long-lived JSON key files:

| Component           | Value                                                        |
| ------------------- | ------------------------------------------------------------ |
| Service account     | `github-actions@quill-medical-{env}.iam.gserviceaccount.com` |
| WIF pool            | `github-pool`                                                |
| WIF provider        | `github-provider`                                            |
| Attribute condition | See below                                                    |

The teaching project's WIF provider allows authentication from **two repositories** (the main app and the question bank):

```
assertion.repository == 'bailey-medics/quillmedical' || assertion.repository == 'bailey-medics/quill-question-bank'
```

Production and staging WIF providers only allow `bailey-medics/quillmedical`.

!!! warning "Adding a new repository to WIF requires two steps"
Updating the WIF provider attribute condition is **not enough**. You must also add a `roles/iam.workloadIdentityUser` IAM binding on the service account for the new repo's principal. Without this, GitHub Actions will authenticate but fail with `iam.serviceAccounts.getAccessToken` permission denied when trying to impersonate the service account.

```bash
# Step 1: Update the WIF provider attribute condition
gcloud iam workload-identity-pools providers update-oidc github-provider \
  --project=quill-medical-{env} \
  --location=global \
  --workload-identity-pool=github-pool \
  --attribute-condition="assertion.repository == 'bailey-medics/quillmedical' || assertion.repository == 'bailey-medics/{new-repo}'"

# Step 2: Grant the new repo's WIF identity permission to impersonate the SA
gcloud iam service-accounts add-iam-policy-binding \
  github-actions@quill-medical-{env}.iam.gserviceaccount.com \
  --project=quill-medical-{env} \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/{project-number}/locations/global/workloadIdentityPools/github-pool/attribute.repository/bailey-medics/{new-repo}"
```

The service accounts have the following IAM roles:

- `roles/editor` - manage most GCP resources
- `roles/secretmanager.admin` - create and manage secrets
- `roles/run.admin` - deploy Cloud Run services
- `roles/iam.serviceAccountUser` - let Cloud Run services run as other service accounts

### GitHub secrets (done)

#### quillmedical repository

GCP credentials live in GitHub environments, not in the repository, set
with `gh secret set --env <environment>`. Each is named without the
environment, so a matrix job reads `secrets.GCP_PROJECT_ID` and the
environment it runs in decides which project that is. An index such as
`secrets[format('GCP_{0}_...', matrix.environment)]` would make GitHub send
the runner every repository secret, which zizmor refuses.

`app`, main only, for every job that runs from `main`:

| Secret                       | Value pattern                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| `GCP_WIF_PROVIDER`           | `projects/{number}/locations/global/workloadIdentityPools/github-pool/providers/github-provider` |
| `GCP_SERVICE_ACCOUNT`        | `github-actions@quill-medical-app.iam.gserviceaccount.com`, the Terraform apply account          |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | the account that builds and deploys                                                              |
| `GCP_PROJECT_ID`             | `quill-medical-app`                                                                              |

`app-plan`, open to every branch, for pull request jobs:

| Secret                     | Value pattern                                          |
| -------------------------- | ------------------------------------------------------ |
| `GCP_WIF_PROVIDER`         | the same provider as in `app`                          |
| `GCP_PLAN_SERVICE_ACCOUNT` | the read-only account, for the Terraform plan and the teaching content sweep |

Scoping:

- Jobs that deploy (`deploy.yml` build and deploy, `terraform.yml` apply,
  `public-site.yml`, `guide-screenshots.yml`, `clamav-mirror.yml`) declare
  `environment: app`.
- Scheduled jobs that only read the secrets (`alert-route-test.yml`,
  `accessibility-review.yml`, `stale-incidents.yml`) declare `app` with
  `deployment: false`, so they record no deployment. A run by hand must be
  from `main`.
- Pull request jobs (`terraform.yml` plan, `ci.yml` teaching content sweep)
  declare `app-plan` with `deployment: false`. `app` takes main only, and a
  pull request must never reach the apply or deploy accounts.
- The app environment enforces a **main-only** deployment branch policy
  (see `infra/github/environments.tf`).

One organisation secret, visible to every repository in `bailey-medics`:

| Secret              | Purpose                                     |
| ------------------- | ------------------------------------------- |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook for CI notifications |

GitHub holds no credential the app accepts. The WIF provider path and the service account emails are identifiers, worth nothing to whoever reads them, because Workload Identity Federation exchanges a GitHub token for a short-lived GCP token only from this repository's workflows. The Slack webhook is the one credential GitHub genuinely uses itself, to post to the channel. Everything the app reads is in Secret Manager (see [Secrets](#secrets)), and the CI service account reads none of it.

#### Content repositories (eoeeta-teaching, respiratory-teaching)

Three repository secrets for the teaching content pipeline, since 2026-10-19:

| Secret                           | Purpose                                         |
| -------------------------------- | ----------------------------------------------- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | WIF provider path for the app project           |
| `GCP_SERVICE_ACCOUNT`            | Service account for GCS access (`content-sync`) |
| `GCP_TEACHING_GCS_BUCKET`        | GCS bucket name (`quill-images-app`)            |

`SLACK_WEBHOOK_URL` reaches the pipeline as the organisation secret above, through `secrets: inherit`. `BACKEND_SYNC_URL` and `BACKEND_SYNC_TOKEN` are gone: the pipeline no longer calls the backend, it starts the `quill-teaching-sync` job.

These secrets authenticate the reusable teaching pipeline (`teaching-pipeline.yml` in this repository, which each content repository calls) to sync validated question bank content to the teaching GCS bucket on merge to main.

### Terraform configuration (done)

The infrastructure is defined in `infra/` using Terraform modules:

| Module                    | Purpose                                                                 |
| ------------------------- | ----------------------------------------------------------------------- |
| `secrets`                 | Secret Manager secret containers                                        |
| `networking`              | VPC, subnets (private, and one for Cloud Run's Direct VPC egress), Cloud NAT, firewall rules |
| `cloud-sql`               | PostgreSQL instances with private IP, backups, auto-generated passwords |
| `cloud-run`               | Backend and frontend services with secret injection                     |
| `cloud-run-job`           | Admin CLI job (create-superadmin, add-role, run-migrations), and the transcode and caption jobs |
| `load-balancer`           | Global HTTPS LB, Cloud Armor rate limiting, serverless NEGs, SSL certs  |
| `compute-fhir`            | VM running HAPI FHIR + EHRbase (prod/staging only)                      |
| `monitoring`              | Uptime checks and alerting by email, Slack, SMS and PagerDuty           |
| `cloud-storage`           | Image bucket (teaching only)                                            |
| `teaching-video-pipeline` | Lecture video buckets, CDN backend and signing key                      |
| `passport-storage`        | Clinician passport bucket                                               |
| `guide-assets`            | Public and private buckets for the in-app guides' screenshots, CDN backend |
| `analytics`               | Page-view and client-error metrics                                      |

The Cloud DNS zone and its records are in `infra/dns.tf`, in the root module, not in a module of their own.

Environment-specific settings live in `infra/environments/{env}/terraform.tfvars`.

### Artifact Registry (done)

Each project has a Docker repository in Artifact Registry:

```
europe-west2-docker.pkg.dev/quill-medical-{env}/quill/
```

Container images are pushed here by CI (not GHCR - Cloud Run only supports Artifact Registry, GCR, or Docker Hub). Image paths:

- `europe-west2-docker.pkg.dev/quill-medical-{env}/quill/backend:{sha}` - backend service (built from `prod` Dockerfile stage; also tagged `latest`)
- `europe-west2-docker.pkg.dev/quill-medical-{env}/quill/frontend:{sha}` - frontend service (built from `prod` Dockerfile stage; also tagged `latest`)
- `europe-west2-docker.pkg.dev/quill-medical-{env}/quill/admin:latest` - admin CLI (built from `admin` Dockerfile stage, by CI on every backend change or via `just build-admin`)

!!! warning "Docker build targets"
The backend Dockerfile has five stages: `base`, `dev`, `prod`, `admin`, and `transcode`. The `transcode` stage is last, so building without `--target` produces the transcode job image, not the web server. CI deploy workflows must always specify `target: prod`.

### Organisation policy override (done)

The GCP organisation (`826360329716`) enforces **Domain Restricted Sharing** by default, which blocks `allUsers` IAM bindings. This was overridden at the project level for all three projects to allow public Cloud Run access:

```bash
gcloud resource-manager org-policies set-policy policy.yaml --project=quill-medical-staging
gcloud resource-manager org-policies set-policy policy.yaml --project=quill-medical-teaching
gcloud resource-manager org-policies set-policy policy.yaml --project=quill-medical-production
```

This required the `roles/orgpolicy.policyAdmin` role at the organisation level.

### Staging Terraform apply (done)

`terraform apply` completed for the staging environment - **all resources created successfully**:

- VPC, subnet, Cloud NAT, VPC connector, firewall rules
- 3 Cloud SQL instances (auth, FHIR, EHRbase) with auto-generated passwords
- Secret Manager secrets with initial values (jwt-secret, vapid-private, db passwords)
- Cloud Run backend and frontend (placeholder images)
- Compute Engine VM for HAPI FHIR + EHRbase
- Artifact Registry Docker repository
- IAM bindings for public Cloud Run access and Secret Manager
- Monitoring uptime checks and email alerts

Cloud Run URLs (placeholder containers, will serve real app after first CI deploy):

- Backend: `https://quill-backend-staging-fptrrusgxa-nw.a.run.app`
- Frontend: `https://quill-frontend-staging-fptrrusgxa-nw.a.run.app`

### Teaching Terraform apply (done)

`terraform apply` completed for the teaching environment - **32 resources created**:

- VPC, subnet, Cloud NAT, VPC connector, firewall rules
- 1 Cloud SQL instance (auth only - no FHIR/EHRbase) with auto-generated password
- Secret Manager secrets with initial values
- Cloud Run backend and frontend (placeholder images)
- Artifact Registry Docker repository
- Cloud Storage image bucket
- IAM bindings for public Cloud Run access and Secret Manager
- Monitoring uptime checks and email alerts

Cloud Run URLs:

- Backend: `https://quill-backend-teaching-izhomeiy6q-nw.a.run.app`
- Frontend: `https://quill-frontend-teaching-izhomeiy6q-nw.a.run.app`

### Production Terraform apply ~~(done)~~ (hibernated)

Production was fully provisioned and deployed, then **hibernated** via `terraform destroy` to save costs while not needed. See [Retired environments](#retired-environments).

### Global HTTPS Load Balancer (done)

Each environment has a Global HTTPS Load Balancer that sits in front of the Cloud Run services. This provides:

- **Path-based routing**: `/api/*` goes to the backend Cloud Run service, everything else goes to the frontend
- **Google-managed SSL certificates**: automatically provisioned and renewed for each domain
- **Cloud Armor rate limiting**: 500 requests per minute per IP address. This is the policy's only rule; it has none that look for attack patterns
- **HTTP to HTTPS redirect**: all port 80 traffic is redirected to port 443
- **Static global IP**: stable IP addresses for DNS A records

| Environment | Domain                       | Load Balancer IP | Status                   |
| ----------- | ---------------------------- | ---------------- | ------------------------ |
| App         | `app.quill-medical.com`      | `34.49.99.83`    | Active                   |
| App         | `quill-medical.com`          | `34.49.99.83`    | Active (landing page)    |
| Teaching    | `teaching.quill-medical.com` | -                | Retired, no DNS record   |
| Staging     | `staging.quill-medical.com`  | -                | Retired, no DNS record   |
| Production  | `ehr.quill-medical.com`      | -                | Shut down, no DNS record |

The Caddyfile no longer reverse-proxies `/api/*` to the backend - the load balancer handles all routing. Caddy now just serves static frontend files and provides a `/healthz` endpoint for health checks.

### Domain architecture (done)

| Domain                       | Purpose                                       | Update process                       | Status                |
| ---------------------------- | --------------------------------------------- | ------------------------------------ | --------------------- |
| `quill-medical.com`          | Public landing/marketing site                 | Update anytime, no clinical sign-off | Active (app LB)       |
| `app.quill-medical.com`      | Teaching and clinician passport               | Auto-deploy from main branch         | Active                |
| `teaching.quill-medical.com` | The same product, on the project it moved off | -                                    | Retired               |
| `ehr.quill-medical.com`      | Live clinical application                     | Release versions, DCB0129, UAT       | Named only, not built |
| `staging.quill-medical.com`  | Staging/integration testing                   | -                                    | Retired               |

The public landing site (`quill-medical.com` and `www.quill-medical.com`) is served from a GCS bucket behind the app load balancer. The site is built from the `frontend/public_pages/` Vite workspace and deployed via the `public-site.yml` CI workflow on pushes to `main`. This allows marketing pages and feature announcements to be updated without going through clinical release gates.

### DNS records (done)

Cloud DNS zone `quill-medical-com` in the app project (`infra/dns.tf`) holds all DNS records. The web records are:

| Record                  | Type  | TTL | Value               | Notes                 |
| ----------------------- | ----- | --- | ------------------- | --------------------- |
| `quill-medical.com`     | A     | 300 | `34.49.99.83`       | Landing page (app LB) |
| `www.quill-medical.com` | CNAME | 300 | `quill-medical.com` | www redirect to apex  |
| `app.quill-medical.com` | A     | 300 | `34.49.99.83`       |                       |

GoDaddy nameservers were updated to delegate to Google Cloud DNS:

```
ns-cloud-c1.googledomains.com
ns-cloud-c2.googledomains.com
ns-cloud-c3.googledomains.com
ns-cloud-c4.googledomains.com
```

### Terraform workspaces (done)

Each environment uses a separate Terraform workspace to isolate state:

- **`app`** - the only live environment. State at
  `gs://quill-medical-app-terraform-state/terraform/state/app.tfstate`.

The `staging`, `teaching` and `production` workspaces were retired with
their projects, and their state was not carried to the new bucket.

Terraform and the `gh` CLI were installed via Homebrew on the admin account.

## Branching and deployment model

```
feature/*  ──►  main
                  │
           deploys to:
           app
           landing page
           docs
```

### App deployment (merge to main)

Workflow: `.github/workflows/deploy.yml`

1. Detect what changed (backend, frontend, shared)
2. Build and push container images to Artifact Registry, tagged `{sha}`
3. Run database migrations as a pre-deploy Cloud Run Job
4. Deploy backend: tagged, `--no-traffic`, smoke-tested at its own tagged
   URL, then promoted to receive traffic; deploy frontend directly
5. Smoke test the public edge: `GET /api/health` (5 retries, 10s intervals)
6. Slack notification on failure

See [Alembic migration safety](../backend/alembic-migration-safety.md) for
why migrations run as a separate pre-deploy job and why the backend deploy
is tagged/no-traffic rather than direct.

### Production deployment (promotion)

There is no production environment. The promotion job, and the CalVer tag it made, were removed from `deploy.yml` with the production project. A clinical environment gets its own, deliberate promotion step when it exists.

### Infrastructure changes (changes to infra/)

Workflow: `.github/workflows/terraform.yml`

- **Pull requests** - runs `terraform plan` and posts the diff as a PR comment
- **Merge to main** - runs `terraform apply` for app

## Environment configuration

### App

The only environment, in `infra/environments/app/terraform.tfvars`:

```hcl
project_id              = "quill-medical-app"
environment             = "app"
enable_fhir             = false
enable_ha               = false
db_tier                 = "db-custom-1-3840"
cloud_run_max_instances = 5
```

App-specific Cloud Run backend environment variables (in addition to the standard set):

| Variable                    | Value                                             | Purpose                                    |
| --------------------------- | ------------------------------------------------- | ------------------------------------------ |
| `CLINICAL_SERVICES_ENABLED` | `false`                                           | Disables FHIR/EHRbase endpoints            |
| `TEACHING_STORAGE_BACKEND`  | `gcs`                                             | Use GCS for teaching image storage         |
| `TEACHING_GCS_BUCKET`       | `quill-images-app`                                | GCS bucket containing question banks       |
| `TEACHING_IMAGES_BASE_URL`  | `https://storage.googleapis.com/quill-images-app` | Public URL prefix for question bank images |

## Environment variable naming

Terraform injects environment variables into Cloud Run services via the `env_vars` and `secret_env_vars` maps in the Cloud Run module. The variable names must **exactly match** the Pydantic Settings field names in `backend/app/config.py`.

Key mappings:

| Terraform env var | Config field      | Default (Docker Compose)      |
| ----------------- | ----------------- | ----------------------------- |
| `CORE_DB_HOST`    | `CORE_DB_HOST`    | `postgres-core`               |
| `CORE_DB_NAME`    | `CORE_DB_NAME`    | `quill_core`                  |
| `CORE_DB_USER`    | `CORE_DB_USER`    | `core_user`                   |
| `FHIR_SERVER_URL` | `FHIR_SERVER_URL` | `http://fhir:8080/fhir`       |
| `EHRBASE_URL`     | `EHRBASE_URL`     | `http://ehrbase:8080/ehrbase` |

If names don't match, the backend silently falls back to the Docker Compose defaults (which are unresolvable hostnames in Cloud Run), causing FHIR/EHRbase health checks to fail.

## Cloud Storage IAM

The teaching GCS bucket (`quill-images-app`) requires an explicit IAM binding for the Cloud Run backend's service account, `roles/storage.objectViewer`. Without it the backend cannot list the bucket's objects.

The binding is in Terraform: `google_storage_bucket_iam_member.runtime_backend_images` in `infra/runtime-identities.tf` grants it to the backend's own `run-backend` service account. Nothing runs as the default compute service account any more.

!!! warning "Symptom of missing binding"
The backend logs `Failed to list GCS banks` and the Admin > Teaching page shows "No teaching modules found" after clicking Sync. The underlying error is `google.api_core.exceptions.Forbidden: 403 ... does not have storage.objects.list access`.

## Secrets

Every secret the app reads lives in Secret Manager in `quill-medical-app`. Terraform creates each secret's container (`module.secrets` in `infra/main.tf`), grants each workload read access to exactly the secrets it mounts (`infra/runtime-identities.tf`), and writes a value only where the list below says so. The backend reads each secret as the environment variable named beside it. The admin job (`quill-admin`) reads `JWT_SECRET`, `CORE_DB_PASSWORD` and the two SES keys; the transcode, caption and scan jobs read none, and the frontend reads none.

Terraform creates and fills:

- **`jwt-secret`** - `random_password.jwt_secret` in `infra/main.tf`, 64 characters, written once. Read by the backend and the admin job as `JWT_SECRET`, which signs access and refresh tokens and, in `backend/app/security.py`, the CSRF tokens and the password-reset and email-verification links. There is no separate CSRF secret.
- **`core-db-password`** - generated by the `cloud-sql` module (`infra/modules/cloud-sql/main.tf`), which sets it on the database user in the same apply, so the secret and the user cannot drift. Read by the backend and the admin job as `CORE_DB_PASSWORD`.
- **`vapid-private`** - `random_password.vapid_placeholder` writes a placeholder once; the real key was added by hand as version 2 (see [Set real VAPID key](#set-real-vapid-key-pending-done)). Read by the backend as `VAPID_PRIVATE`. Its public half is not a secret: it sits in `deploy.yml` as `VITE_VAPID_PUBLIC` and is baked into the frontend image.
- **`teaching-video-signing-key`** - generated by the `teaching-video-pipeline` module. The load balancer validates signed video cookies with it and the backend mints them, as `TEACHING_VIDEO_SIGNING_KEY`, so the two must hold the same bytes and nobody types it.

Terraform creates the container, and a person sets the value with `gcloud secrets versions add`:

- **`ses-access-key-id`** and **`ses-secret-access-key`** - the access key of an AWS IAM user that may send email from `eu-west-2` and nowhere else. Read by the backend and the admin job as `SES_ACCESS_KEY_ID` and `SES_SECRET_ACCESS_KEY`.
- **`pagerduty-service-key`** and **`alert-sms-number`** - read by Terraform itself, through `data "google_secret_manager_secret_version"` in `infra/main.tf`, for the monitoring module's notification channels. No workload mounts them.
- **`feedback-notify-email`** - the addresses told when somebody sends feedback, separated by commas. Not a credential, but people's own addresses, kept out of a public repository. Read by the backend as `FEEDBACK_NOTIFY_EMAIL`, and the backend refuses to start in production with none.
- **`feedback-slack-webhook-url`** - the Slack incoming webhook the backend posts feedback to, as `FEEDBACK_SLACK_WEBHOOK_URL`. A credential: anybody holding the URL can post to the channel.

Created only when `enable_fhir` is true, for EHR production:

- **`fhir-db-password`** and **`ehrbase-db-password`** - generated by the two further `cloud-sql` modules. Read by the backend as `FHIR_DB_PASSWORD` and `EHRBASE_DB_PASSWORD`, and by the FHIR and EHRbase VM (`infra/modules/compute-fhir`).
- **`ehrbase-api-password`** and **`ehrbase-admin-password`** - set by hand. Read by the backend as `EHRBASE_API_PASSWORD` and `EHRBASE_API_ADMIN_PASSWORD`, and by the VM.

Gone, named so that nobody goes looking for them:

- **`teaching-sync-token`** - removed on 2026-10-19. The teaching pipeline starts the `quill-teaching-sync` job instead of calling `POST /api/ci/teaching/sync`.
- **`teaching-transcode-callback-token`** - removed on 2026-10-17. The video jobs present identity tokens, minted per request by the metadata server and never stored.

Not in Secret Manager at all: the VAPID public key, the callback identity tokens, and the `.env` files on a developer's machine, which hold development values only.

### Rotating a secret

Every procedure ends with the same step, and it is the one that gets forgotten: **re-run `deploy.yml`**. A new secret version, or a Terraform apply, makes a Cloud Run revision that serves no traffic until a deploy routes traffic to it, so a rotation that stops at Secret Manager has changed nothing the app can see. `gcloud run services update` is not the answer either: it makes a revision by hand that Terraform then refuses with a 409. After the deploy, check the serving revision changed (`gcloud run services describe quill-backend-app --region europe-west2 --format 'value(status.latestReadyRevisionName)'`).

- **A hand-set value** (the SES keys, the Slack webhook, the PagerDuty key, the alert number, the feedback addresses, the EHRbase passwords):

  ```bash
  printf '%s' "$VALUE" | gcloud secrets versions add <name> --data-file=-
  ```

  `printf`, never `echo`, which appends a newline that then fails the login. Then re-run `deploy.yml` and confirm the serving revision changed. Old versions stay readable until disabled: disable the previous one once the new revision is seen working, and destroy it a week later.

- **A Terraform-generated value** (`jwt-secret`, `core-db-password`, `teaching-video-signing-key`, and the two EHR database passwords): an apply with `-replace=<address>` regenerates it, and for a database password sets the new value on the database user in the same apply. The addresses are `random_password.jwt_secret`, `module.cloud_sql_core.random_password.db_password`, `module.teaching_video_pipeline[0].random_bytes.signing_key`, `module.cloud_sql_fhir[0].random_password.db_password` and `module.cloud_sql_ehrbase[0].random_password.db_password`. Run it from `terraform.yml` by hand (Run workflow, environment `app`, `replace` set to the address), never from a laptop against the live state: the apply account lives in GitHub's `app` environment and nobody holds it outside. Then `deploy.yml`.

- **The JWT secret** is a Terraform-generated value with a consequence: every session is signed out at once, and every password-reset and email-verification link in flight stops working, because `JWT_SECRET` signs those too. Rotate it in a quiet hour and say so in Slack first.

- **The VAPID pair** is two values that must change together: the private key in Secret Manager and the public key in `deploy.yml` as `VITE_VAPID_PUBLIC`. `just vapid-key` prints a fresh pair; add the private half as a new version of `vapid-private` by hand, as above, and change the public half in `deploy.yml` in the same pull request. Never `-replace` `random_password.vapid_placeholder`: that writes another placeholder over the real key. Every existing push subscription dies with the old key, which is acceptable while notifications are switched off in Settings.

- **The video signing key** is Terraform-generated and read by two things, the backend and the load balancer, in one apply. A learner mid-video gets a 403 on the next segment and the player asks for a new cookie. No announcement needed.

- **The SES key pair**: make the new access key in AWS IAM first, set both secrets, deploy, send one test email (the feedback form is the quickest), then delete the old key in AWS. Never the other way round: deleting first stops every email until the deploy lands.

- **The Slack webhook and the PagerDuty key** are rotated at the other end (Slack, PagerDuty) and the new value set here, with the same deploy afterwards. The alert SMS number is a number and is simply replaced.

Schedule:

- **Hand-set credentials** (the SES key pair, the Slack webhook, the PagerDuty key): yearly, first due 2027-10, tracked in [todo.md](../plans/todo.md).
- **Terraform-generated values**: on demand. Nothing leaves the project and nobody types them.
- **Anything**: immediately, on any suspicion of exposure.

## Security

- **No public database IPs** - Cloud SQL is accessible only via VPC
- **SSH via IAP only** - no open SSH ports, all access through Identity-Aware Proxy
- **Secrets in Secret Manager** - never in environment variables (initial values auto-generated by Terraform)
- **WIF authentication** - no long-lived JSON key files, short-lived tokens only
- **Attribute condition on WIF** - only `bailey-medics/quillmedical` can authenticate (production/staging); teaching also allows `bailey-medics/quill-question-bank`
- **Least-privilege service accounts** - each environment has its own service account
- **Explicit GCS IAM bindings** - Cloud Run service accounts need bucket-level `roles/storage.objectViewer` even when they are project editors (see [Cloud Storage IAM](#cloud-storage-iam))
- **Cloud Armor rate limiting** - 500 req/min per IP on the backend and frontend services of every load balancer. The landing, video and guide asset buckets carry no policy
- **HTTPS enforced** - HTTP to HTTPS redirect on all environments, Google-managed SSL certificates
- **Google-managed TLS** - certificates auto-provisioned and auto-renewed, no manual cert management
- **Content Security Policy** - browser-enforced allowlists per resource type (see [CSP headers](#content-security-policy-csp-headers) below)

### Content Security Policy (CSP) headers

A `Content-Security-Policy` response header tells the browser which origins are allowed to load each type of resource, providing defence against XSS and data-injection attacks. Which layer sets it depends on the response:

- **The application's pages** - the production Caddyfile (`caddy/prod/Caddyfile`), with the policy below.
- **API responses, `/api/*`** - the load balancer's backend service (`infra/modules/load-balancer/main.tf`), with `default-src 'none'; frame-ancestors 'self'`. These go straight to the backend and never pass through Caddy.
- **Teaching videos, `/videos/*`** - none. The videos backend bucket sets the other security headers, but a policy does nothing on a media file.
- **Guide screenshots, `/guide-assets/*`** - none. The guide assets backend bucket sets the other security headers, but a policy does nothing on an image.
- **The landing site** - its backend bucket, in the load balancer module, with its own policy.

See [Which layer sets the headers](../cybersecurity/index.md#which-layer-sets-the-headers) for the full set of headers on each.

The application's policy:

```
default-src 'self';
script-src  'self';
style-src   'self' 'unsafe-inline';
img-src     'self' data: https://storage.googleapis.com;
font-src    'self';
connect-src 'self' https://storage.googleapis.com;
frame-src   'self' https://www.youtube.com;
frame-ancestors 'none'
```

| Directive         | Allowed origins                               | Notes                                                             |
| ----------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| `default-src`     | `'self'`                                      | Fallback for any type not listed below                            |
| `script-src`      | `'self'`                                      | Only first-party JavaScript                                       |
| `style-src`       | `'self' 'unsafe-inline'`                      | Mantine injects inline styles at runtime                          |
| `img-src`         | `'self' data: https://storage.googleapis.com` | GCS signed URLs for teaching images                               |
| `font-src`        | `'self'`                                      | Only first-party fonts                                            |
| `connect-src`     | `'self' https://storage.googleapis.com`       | API calls go via the same-origin LB; lecture uploads go to GCS    |
| `frame-src`       | `'self' https://www.youtube.com`              | Certificate PDFs framed from the API; YouTube for teaching videos |
| `frame-ancestors` | `'none'`                                      | Prevents the app being embedded in an iframe                      |

!!! warning "Adding external image or API sources"
If a new feature loads images from an external origin (e.g. a different CDN or FHIR server), that origin **must** be added to the relevant CSP directive in `caddy/prod/Caddyfile`. Without this, the browser silently blocks the request and images appear broken with no errors in the application logs - only a CSP violation message in the browser console.

## Remaining steps

### Set real VAPID key ~~(pending)~~ (done)

VAPID keys were generated and stored in Secret Manager for all three environments (version 2):

- **Public key**: `BC0B26JO27tGc5qkbt2-QzY8M7_0u3gt5hmFj1RGWvZp9Vr9fDQ3-lpQ6YxqNlU0fFKlIUzCnb-baAE0rzIL-Ys`
- **Private key**: stored in Secret Manager (`vapid-private`, version 2) for all three projects

The public key is baked into the frontend Docker image at build time via the `VITE_VAPID_PUBLIC` build argument (set in CI workflows).

The `jwt-secret` auto-generated value is fine for use - it's a strong random 64-character string.

Database passwords are auto-generated by Terraform and stored in Secret Manager automatically.

### DNS delegation ~~(pending)~~ (done)

GoDaddy nameservers updated to point to Cloud DNS:

```
ns-cloud-c1.googledomains.com
ns-cloud-c2.googledomains.com
ns-cloud-c3.googledomains.com
ns-cloud-c4.googledomains.com
```

### First deployment

Once DNS is fully propagated and SSL certificates are provisioned, merge the `feature/gcp-setup` branch to `main`. The CI pipeline will:

1. Build container images
2. Push to Artifact Registry
3. Deploy to staging and teaching Cloud Run
4. Smoke test the health endpoint

### Alembic migrations run as a pre-deploy Cloud Run Job (done)

Database migrations (`alembic upgrade head`) run as a separate **pre-deploy step** - a `gcloud run jobs execute --wait` call against the `quill-admin-{env}` Cloud Run Job - before the new backend/frontend revisions are deployed. This runs exactly once per deploy (no multi-instance race), gives a clean pass/fail signal separate from app boot, and blocks the deploy on failure. See the [admin tasks documentation](admin.md) and [Alembic migration safety](../backend/alembic-migration-safety.md).

### Backend deploys via a tagged, smoke-tested revision (done)

The backend deploy step (`.github/scripts/deploy/deploy-tagged.sh`) deploys the new revision under a unique traffic tag with `--no-traffic`, smoke-tests that revision's own tagged URL, and only then promotes that revision by name (`--to-revisions`) to receive live traffic. Live traffic stays on the previous, healthy revision until the new one - including its migration - has proven itself, rather than cutting over immediately and finding out via the public-edge smoke test. See [Alembic migration safety](../backend/alembic-migration-safety.md#revision-specific-smoke-test).

The promotion is issued with `--async` and verified by polling the service's own status until it is Ready with the new revision carrying all traffic, rather than relying on gcloud's built-in wait. That wait has no ceiling: on 2026-09-10 Cloud Run stalled on "Provisioning revision instances to receive traffic" and gcloud sat for 56 minutes before crashing, holding the serialised deploy queue the whole time. The poll is bounded (`PROMOTE_TIMEOUT_SECONDS`, default 300s), a stalled promotion gets one fresh attempt (`PROMOTE_ATTEMPTS`, default 2), and a failure prints the service's conditions and traffic split into the job log. The deploy jobs also carry a 30-minute `timeout-minutes` ceiling as a backstop.

### Admin Cloud Run Job (done)

Each active environment has a `quill-admin-{env}` Cloud Run Job for one-off admin tasks (creating superadmin users, assigning roles, running migrations). See the [admin tasks documentation](admin.md) for usage.

The job is defined in the `cloud-run-job` Terraform module and uses a separate Docker image built from the `admin` target in the backend Dockerfile. The admin image is a CLI tool - it does **not** run an HTTP server.

### Production go-live

1. Merge feature branch to `main`
2. Verify teaching deployment passes smoke tests
3. Approve production promotion via GitHub Environment gate
4. Verify health checks pass

### Future improvements

- CPU/memory monitoring (uptime, 5xx and disk alerts exist)
- High availability for production Cloud SQL

## Retired environments

Production and staging were hibernated in 2026, with every Terraform-managed
resource destroyed, and then retired altogether in Batch 10a of the
[environment isolation plan](../plans/2026-09-18-environment-isolation-and-iap-plan.md).
`quill-medical-app` is now the only environment and the home of everything
shared: the `quill-medical.com` DNS zone (`infra/dns.tf`) and the Terraform
state bucket (`infra/backend.tf`).

A clinical environment, when it is built, is a new project branching from
`quill-medical-app`, not a restore of `quill-medical-production`: a GCP
project ID cannot be renamed, and there was no data to restore.
