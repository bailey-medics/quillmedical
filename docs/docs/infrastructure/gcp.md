# Google Cloud Platform infrastructure

## Overview

Quill Medical runs on three separate GCP projects, each in **europe-west2** (London):

| Environment | Project ID                 | Purpose                                    | Status     |
| ----------- | -------------------------- | ------------------------------------------ | ---------- |
| Production  | `quill-medical-production` | Clinical app for real patients             | Hibernated |
| Staging     | `quill-medical-staging`    | Integration testing + landing page         | Active     |
| Teaching    | `quill-medical-teaching`   | Educational environment (no clinical data) | Active     |

Estimated cost: **£72–107/month** across staging and teaching (production hibernated — see [Production hibernation](#production-hibernation) below).

## Architecture

```
                        ┌──────────────────────────┐
                        │   Cloud DNS              │
                        │   quill-medical.com      │
                        └────────────┬─────────────┘
                                     │
         ┌───────────────────────────┼───────────────────┐
         │                           │                   │
    quill-medical.com    staging.quill-    teaching.quill-
    (landing page)       medical.com       medical.com
         │                           │                   │
         │              ┌────────────▼────────┐   ┌──────▼───────┐
         └──────────────►   Global LB        │   │  Global LB   │
                        │   Cloud Armor      │   │  Cloud Armor │
                        │   WAF              │   │  WAF         │
                        └──┬───────┬───┬─────┘   └──┬────────┬──┘
                           │       │   │            │        │
                        /api/*   /*   landing     /api/*    /*
                           │       │   page         │        │
                        ┌──▼──┐ ┌──▼──┐ ┌──┐    ┌──▼──┐  ┌──▼──┐
                        │Back │ │Front│ │GCS│   │Back │  │Front│
                        │end  │ │end  │ │   │   │end  │  │end  │
                        └──┬──┘ └─────┘ └───┘   └──┬──┘  └─────┘
                           │                       │
                        ┌──▼────────┐           ┌──▼────────┐
                        │Cloud SQL  │           │Cloud SQL  │
                        │Auth+FHIR  │           │Auth only  │
                        │+EHRbase   │           └───────────┘
                        └──┬────────┘
                           │
                        ┌──▼────────┐
                        │HAPI FHIR  │
                        │EHRbase VM │
                        └───────────┘

                         Staging                 Teaching

  Production: HIBERNATED (project exists, all resources destroyed)
```

Each environment has:

- **Global HTTPS Load Balancer** — path-based routing, Cloud Armor WAF, Google-managed SSL
- **Cloud Run** — backend (FastAPI) and frontend (React/Vite), auto-scaling
- **Cloud SQL** — PostgreSQL for the auth database (all environments)
- **Secret Manager** — JWT keys, database passwords, VAPID keys
- **VPC** — private networking, no public database IPs
- **Monitoring** — uptime checks on `/api/health` with email alerts

Production and staging also have:

- **Cloud SQL** — additional FHIR and EHRbase databases
- **Compute Engine** — e2-small VM running HAPI FHIR and EHRbase via Docker

Teaching additionally has:

- **Cloud Storage** — image bucket for educational content

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

Remote state is stored in a versioned GCS bucket in the production project:

```
gs://quill-medical-terraform-state
```

Terraform uses workspace prefixes to separate state per environment.

### Workload Identity Federation (done)

Each project has a WIF setup that lets GitHub Actions authenticate without long-lived JSON key files:

| Component           | Value                                                        |
| ------------------- | ------------------------------------------------------------ |
| Service account     | `github-actions@quill-medical-{env}.iam.gserviceaccount.com` |
| WIF pool            | `github-pool`                                                |
| WIF provider        | `github-provider`                                            |
| Attribute condition | `assertion.repository == 'bailey-medics/quillmedical'`       |

The service accounts have the following IAM roles:

- `roles/editor` — manage most GCP resources
- `roles/secretmanager.admin` — create and manage secrets
- `roles/run.admin` — deploy Cloud Run services
- `roles/iam.serviceAccountUser` — let Cloud Run services run as other service accounts

### GitHub secrets (done)

Nine repository secrets set via `gh secret set`:

| Secret                      | Value pattern                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| `GCP_{ENV}_WIF_PROVIDER`    | `projects/{number}/locations/global/workloadIdentityPools/github-pool/providers/github-provider` |
| `GCP_{ENV}_SERVICE_ACCOUNT` | `github-actions@quill-medical-{env}.iam.gserviceaccount.com`                                     |
| `GCP_{ENV}_PROJECT_ID`      | `quill-medical-{env}`                                                                            |

Where `{ENV}` is `PROD`, `STAGING`, or `TEACHING`.

`SLACK_WEBHOOK_URL` is not yet set — will be configured when Slack notifications are needed.

### Terraform configuration (done)

The infrastructure is defined in `infra/` using Terraform modules:

| Module          | Purpose                                                                 |
| --------------- | ----------------------------------------------------------------------- |
| `secrets`       | Secret Manager secret containers                                        |
| `networking`    | VPC, subnet, Cloud NAT, VPC connector, firewall rules                   |
| `cloud-sql`     | PostgreSQL instances with private IP, backups, auto-generated passwords |
| `cloud-run`     | Backend and frontend services with secret injection                     |
| `load-balancer` | Global HTTPS LB, Cloud Armor WAF, serverless NEGs, SSL certs            |
| `compute-fhir`  | VM running HAPI FHIR + EHRbase (prod/staging only)                      |
| `monitoring`    | Uptime checks and email alerting                                        |
| `cloud-storage` | Image bucket (teaching only)                                            |

Environment-specific settings live in `infra/environments/{env}/terraform.tfvars`.

### Artifact Registry (done)

Each project has a Docker repository in Artifact Registry:

```
europe-west2-docker.pkg.dev/quill-medical-{env}/quill/
```

Container images are pushed here by CI (not GHCR — Cloud Run only supports Artifact Registry, GCR, or Docker Hub). Image paths:

- `europe-west2-docker.pkg.dev/quill-medical-{env}/quill/backend:main` — backend service (built from `prod` Dockerfile stage)
- `europe-west2-docker.pkg.dev/quill-medical-{env}/quill/frontend:main` — frontend service (built from `prod` Dockerfile stage)
- `europe-west2-docker.pkg.dev/quill-medical-{env}/quill/admin:latest` — admin CLI (built from `admin` Dockerfile stage, via `just build-admin`)

!!! warning "Docker build targets"
The backend Dockerfile has three stages: `dev`, `prod`, and `admin`. The `admin` stage is last, so building without `--target` produces the admin CLI image, not the web server. CI deploy workflows must always specify `target: prod`.

### Organisation policy override (done)

The GCP organisation (`826360329716`) enforces **Domain Restricted Sharing** by default, which blocks `allUsers` IAM bindings. This was overridden at the project level for all three projects to allow public Cloud Run access:

```bash
gcloud resource-manager org-policies set-policy policy.yaml --project=quill-medical-staging
gcloud resource-manager org-policies set-policy policy.yaml --project=quill-medical-teaching
gcloud resource-manager org-policies set-policy policy.yaml --project=quill-medical-production
```

This required the `roles/orgpolicy.policyAdmin` role at the organisation level.

### Staging Terraform apply (done)

`terraform apply` completed for the staging environment — **all resources created successfully**:

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

`terraform apply` completed for the teaching environment — **32 resources created**:

- VPC, subnet, Cloud NAT, VPC connector, firewall rules
- 1 Cloud SQL instance (auth only — no FHIR/EHRbase) with auto-generated password
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

Production was fully provisioned and deployed, then **hibernated** via `terraform destroy` to save costs while not needed. See [Production hibernation](#production-hibernation) for details and restore instructions.

### Global HTTPS Load Balancer (done)

Each environment has a Global HTTPS Load Balancer that sits in front of the Cloud Run services. This provides:

- **Path-based routing**: `/api/*` goes to the backend Cloud Run service, everything else goes to the frontend
- **Google-managed SSL certificates**: automatically provisioned and renewed for each domain
- **Cloud Armor WAF**: rate limiting at 500 requests per minute per IP address
- **HTTP to HTTPS redirect**: all port 80 traffic is redirected to port 443
- **Static global IP**: stable IP addresses for DNS A records

| Environment | Domain                       | Load Balancer IP  | Status                |
| ----------- | ---------------------------- | ----------------- | --------------------- |
| Staging     | `staging.quill-medical.com`  | `35.186.223.130`  | Active                |
| Staging     | `quill-medical.com`          | `35.186.223.130`  | Active (landing page) |
| Teaching    | `teaching.quill-medical.com` | `136.110.221.126` | Active                |
| Production  | `app.quill-medical.com`      | —                 | Hibernated            |

The Caddyfile no longer reverse-proxies `/api/*` to the backend — the load balancer handles all routing. Caddy now just serves static frontend files and provides a `/healthz` endpoint for health checks.

### Domain architecture (done)

| Domain                       | Purpose                       | Update process                       | Status              |
| ---------------------------- | ----------------------------- | ------------------------------------ | ------------------- |
| `quill-medical.com`          | Public landing/marketing site | Update anytime, no clinical sign-off | Active (staging LB) |
| `app.quill-medical.com`      | Live clinical application     | Release versions, DCB0129, UAT       | Hibernated          |
| `staging.quill-medical.com`  | Staging/integration testing   | Auto-deploy from main branch         | Active              |
| `teaching.quill-medical.com` | Teaching/training environment | Auto-deploy from main branch         | Active              |

The public landing site (`quill-medical.com` and `www.quill-medical.com`) is served from a GCS bucket behind the staging load balancer. The site is built from the `frontend/public_pages/` Vite workspace and deployed via the `public-site.yml` CI workflow on pushes to `main`. This allows marketing pages and feature announcements to be updated without going through clinical release gates.

### DNS records (done)

Cloud DNS zone `quill-medical-zone` in the production project holds all DNS records:

| Record                       | Type  | TTL | Value               | Notes                     |
| ---------------------------- | ----- | --- | ------------------- | ------------------------- |
| `quill-medical.com`          | A     | 300 | `35.186.223.130`    | Landing page (staging LB) |
| `www.quill-medical.com`      | CNAME | 300 | `quill-medical.com` | www redirect to apex      |
| `staging.quill-medical.com`  | A     | 300 | `35.186.223.130`    |                           |
| `teaching.quill-medical.com` | A     | 300 | `136.110.221.126`   |                           |

GoDaddy nameservers were updated to delegate to Google Cloud DNS:

```
ns-cloud-c1.googledomains.com
ns-cloud-c2.googledomains.com
ns-cloud-c3.googledomains.com
ns-cloud-c4.googledomains.com
```

### Terraform workspaces (done)

Each environment uses a separate Terraform workspace to isolate state:

| Workspace    | Environment | State path in GCS                                                       |
| ------------ | ----------- | ----------------------------------------------------------------------- |
| `staging`    | Staging     | `gs://quill-medical-terraform-state/terraform/state/staging.tfstate`    |
| `teaching`   | Teaching    | `gs://quill-medical-terraform-state/terraform/state/teaching.tfstate`   |
| `production` | Production  | `gs://quill-medical-terraform-state/terraform/state/production.tfstate` |

Terraform and the `gh` CLI were installed via Homebrew on the admin account.

## Branching and deployment model

```
feature/*  ──►  main  ──►  release/*  ──►  clinical-live
                  │                            │
           deploys to:                   deploys to:
           staging                       production
           teaching
           landing page
           docs
```

### Staging deployment (push to main)

Workflow: `.github/workflows/deploy-staging.yml`

1. Detect what changed (backend, frontend, shared)
2. Build and push container images to Artifact Registry, tagged `main-{sha}`
3. Deploy to staging and teaching Cloud Run
4. Run Alembic database migrations
5. Smoke test: `GET /api/health` (5 retries, 10s intervals)
6. Slack notification

### Production deployment (push to clinical-live)

Workflow: `.github/workflows/deploy-production.yml`

1. Detect what changed
2. Build and push container images to Artifact Registry, tagged `clinical-live-{sha}` and `latest`
3. Deploy to production Cloud Run
4. Run Alembic database migrations
5. Smoke test: `GET /api/health`
6. Slack notification

Production deploys are never cancelled mid-flight.

### Infrastructure changes (changes to infra/)

Workflow: `.github/workflows/terraform.yml`

- **Pull requests** — runs `terraform plan` and posts the diff as a PR comment
- **Merge to main** — runs `terraform apply` for staging and teaching
- **Merge to clinical-live** — runs `terraform apply` for production

## Environment configuration

### Production

```hcl
project_id              = "quill-medical-production"
environment             = "prod"
enable_fhir             = true
enable_ha               = false
db_tier                 = "db-f1-micro"
cloud_run_max_instances = 10
```

### Staging

```hcl
project_id              = "quill-medical-staging"
environment             = "staging"
enable_fhir             = true
enable_ha               = false
db_tier                 = "db-f1-micro"
cloud_run_max_instances = 3
```

### Teaching

```hcl
project_id              = "quill-medical-teaching"
environment             = "teaching"
enable_fhir             = false
enable_ha               = false
db_tier                 = "db-f1-micro"
cloud_run_max_instances = 5
```

## Environment variable naming

Terraform injects environment variables into Cloud Run services via the `env_vars` and `secret_env_vars` maps in the Cloud Run module. The variable names must **exactly match** the Pydantic Settings field names in `backend/app/config.py`.

Key mappings:

| Terraform env var | Config field      | Default (Docker Compose)      |
| ----------------- | ----------------- | ----------------------------- |
| `AUTH_DB_HOST`    | `AUTH_DB_HOST`    | `postgres-auth`               |
| `AUTH_DB_NAME`    | `AUTH_DB_NAME`    | `quill_auth`                  |
| `AUTH_DB_USER`    | `AUTH_DB_USER`    | `auth_user`                   |
| `FHIR_SERVER_URL` | `FHIR_SERVER_URL` | `http://fhir:8080/fhir`       |
| `EHRBASE_URL`     | `EHRBASE_URL`     | `http://ehrbase:8080/ehrbase` |

If names don't match, the backend silently falls back to the Docker Compose defaults (which are unresolvable hostnames in Cloud Run), causing FHIR/EHRbase health checks to fail.

## Security

- **No public database IPs** — Cloud SQL is accessible only via VPC
- **SSH via IAP only** — no open SSH ports, all access through Identity-Aware Proxy
- **Secrets in Secret Manager** — never in environment variables (initial values auto-generated by Terraform)
- **WIF authentication** — no long-lived JSON key files, short-lived tokens only
- **Attribute condition on WIF** — only the `bailey-medics/quillmedical` repository can authenticate
- **Least-privilege service accounts** — each environment has its own service account
- **Cloud Armor WAF** — rate limiting (500 req/min per IP) on all load balancers
- **HTTPS enforced** — HTTP to HTTPS redirect on all environments, Google-managed SSL certificates
- **Google-managed TLS** — certificates auto-provisioned and auto-renewed, no manual cert management

## Remaining steps

### Set real VAPID key ~~(pending)~~ (done)

VAPID keys were generated and stored in Secret Manager for all three environments (version 2):

- **Public key**: `BC0B26JO27tGc5qkbt2-QzY8M7_0u3gt5hmFj1RGWvZp9Vr9fDQ3-lpQ6YxqNlU0fFKlIUzCnb-baAE0rzIL-Ys`
- **Private key**: stored in Secret Manager (`vapid-private`, version 2) for all three projects

The public key is baked into the frontend Docker image at build time via the `VITE_VAPID_PUBLIC` build argument (set in CI workflows).

The `jwt-secret` auto-generated value is fine for use — it's a strong random 64-character string.

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

### ~~Create Alembic migration Cloud Run job~~ (solved)

Database migrations are handled by the backend's `entrypoint.sh`, which runs `alembic upgrade head` before starting the uvicorn server. This runs automatically on every Cloud Run revision deployment — no separate migration job is needed.

### Admin Cloud Run Job (done)

Each active environment has a `quill-admin-{env}` Cloud Run Job for one-off admin tasks (creating superadmin users, updating permissions, assigning roles). See the [admin tasks documentation](admin.md) for usage.

The job is defined in the `cloud-run-job` Terraform module and uses a separate Docker image built from the `admin` target in the backend Dockerfile. The admin image is a CLI tool — it does **not** run an HTTP server.

### Production go-live

1. Cut a `release/*` branch from `main`
2. Test on staging
3. PR to `clinical-live`
4. CI deploys to production
5. Verify health checks pass

### Future improvements

- Cloud DNS managed zone via Terraform (currently created manually)
- DNS A records via Terraform (currently created manually via `gcloud`)
- **Public landing site at `quill-medical.com`** — served from GCS bucket behind the staging LB (done)
- Slack webhook for deployment notifications
- CPU/memory/error-rate monitoring (beyond uptime checks)
- Production database tier upgrade from `db-f1-micro`
- High availability for production Cloud SQL
- Restrict Cloud Run ingress to `INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER` (once LB is confirmed working)

## Production hibernation

Production was hibernated to save costs while the environment is not actively needed. All Terraform-managed resources were destroyed; the GCP project and certain manually-created resources remain intact.

### What was destroyed

All ~67 Terraform-managed resources including:

- VPC, subnet, Cloud NAT, VPC connector, firewall rules
- 3 Cloud SQL instances (auth, FHIR, EHRbase) and all data
- Secret Manager secret versions (containers remain)
- Cloud Run backend and frontend services
- Compute Engine VM (HAPI FHIR + EHRbase)
- Global HTTPS Load Balancer, Cloud Armor policy, SSL certificate
- Monitoring uptime checks and alert policies

Two orphaned Cloud Run services (`quill-backend-production`, `quill-frontend-production`) were also manually deleted.

### What is preserved

The following resources survive `terraform destroy` and do **not** need recreating:

| Resource                     | Location                                                      | Notes                                             |
| ---------------------------- | ------------------------------------------------------------- | ------------------------------------------------- |
| GCP project                  | `quill-medical-production`                                    | Project itself is not Terraform-managed           |
| Workload Identity Federation | `github-pool` / `github-provider`                             | GitHub Actions can still authenticate             |
| GitHub secrets               | `GCP_PROD_*`                                                  | 3 repository secrets remain valid                 |
| Cloud DNS zone               | `quill-medical-zone`                                          | Manually created, holds all DNS records           |
| Organisation policy override | Domain Restricted Sharing                                     | Allows `allUsers` IAM bindings                    |
| Artifact Registry            | `europe-west2-docker.pkg.dev/quill-medical-production/quill/` | Container images still stored                     |
| Terraform state              | `gs://quill-medical-terraform-state` (production workspace)   | Empty state, workspace exists                     |
| Secret Manager containers    | `jwt-secret`, `db-password-*`, `vapid-private`, etc.          | Empty (no versions), will be repopulated on apply |
| Enabled APIs                 | Cloud Run, Cloud SQL Admin, etc.                              | Remain enabled on the project                     |

### Restore procedure

To bring production back online:

```bash
# 1. Authenticate Terraform
gcloud auth application-default login

# 2. Select the production workspace
cd infra
terraform workspace select production

# 3. Recreate all resources (~50 resources, takes ~10 minutes)
terraform apply -var-file=environments/prod/terraform.tfvars

# 4. Note the new load balancer IP from the output
# lb_ip = "x.x.x.x"

# 5. Create DNS A record for the app domain
gcloud dns record-sets create app.quill-medical.com. \
  --type=A --ttl=300 \
  --rrdatas="<NEW_LB_IP>" \
  --zone=quill-medical-zone \
  --project=quill-medical-production

# 6. Wait for SSL certificate to provision (requires DNS propagation)
gcloud compute ssl-certificates describe quill-cert-v3-prod \
  --project=quill-medical-production --global \
  --format="value(managed.status)"
# Repeat until status is ACTIVE (can take up to 30 minutes)

# 7. Trigger a deployment (push to clinical-live or manually deploy)
# The CI pipeline will build, push images, and deploy to Cloud Run

# 8. Run database migrations
# Either via CI or manually inside the backend container

# 9. Verify health
curl https://app.quill-medical.com/api/health
```

**Important**: New Cloud SQL instances will have fresh auto-generated passwords (stored in Secret Manager). All databases will be empty — a data restore from backups would be needed if any data existed previously.

### Landing page during hibernation

The landing page at `quill-medical.com` and `www.quill-medical.com` is served from the **staging** load balancer (`35.186.223.130`). The staging SSL certificate covers `staging.quill-medical.com`, `quill-medical.com`, and `www.quill-medical.com`. The `landing_domain` variable in the staging tfvars controls this.

The site is built from the `frontend/public_pages/` Vite workspace and deployed to the `{project_id}-landing` GCS bucket by the `.github/workflows/public-site.yml` CI workflow. Changes to `frontend/public_pages/**`, `frontend/src/components/**`, or `frontend/src/theme.ts` trigger a rebuild and upload.

When production is restored, you may optionally move the landing page back to the production LB by:

1. Setting `landing_domain = "quill-medical.com"` in `environments/prod/terraform.tfvars`
2. Removing `landing_domain` and `quill-medical.com` from `monitored_hostnames` in `environments/staging/terraform.tfvars`
3. Updating the DNS A record for `quill-medical.com` to point to the production LB IP
