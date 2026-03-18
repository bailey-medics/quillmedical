# Google Cloud Platform infrastructure

## Overview

Quill Medical runs on three separate GCP projects, each in **europe-west2** (London):

| Environment | Project ID                 | Purpose                                    |
| ----------- | -------------------------- | ------------------------------------------ |
| Production  | `quill-medical-production` | Clinical app for real patients             |
| Staging     | `quill-medical-staging`    | Integration testing before production      |
| Teaching    | `quill-medical-teaching`   | Educational environment (no clinical data) |

Estimated cost: **£113–175/month** across all three projects.

## Architecture

```
                        ┌──────────────────────────┐
                        │   Cloud DNS              │
                        │   quill-medical.com      │
                        └────────────┬─────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
    app.quill-         staging.quill-         teaching.quill-
    medical.com        medical.com            medical.com
         │                           │                           │
  ┌──────▼──────┐           ┌────────▼────────┐         ┌───────▼───────┐
  │  Global LB  │           │   Global LB     │         │  Global LB   │
  │  Cloud Armor│           │   Cloud Armor   │         │  Cloud Armor │
  │  WAF        │           │   WAF           │         │  WAF         │
  └──┬───────┬──┘           └──┬───────┬──────┘         └──┬────────┬──┘
     │       │                 │       │                   │        │
  /api/*   /*               /api/*   /*                 /api/*    /*
     │       │                 │       │                   │        │
  ┌──▼──┐ ┌──▼──┐          ┌──▼──┐ ┌──▼──┐            ┌──▼──┐  ┌──▼──┐
  │Back │ │Front│          │Back │ │Front│            │Back │  │Front│
  │end  │ │end  │          │end  │ │end  │            │end  │  │end  │
  └──┬──┘ └─────┘          └──┬──┘ └─────┘            └──┬──┘  └─────┘
     │                        │                          │
  ┌──▼────────┐            ┌──▼────────┐              ┌──▼────────┐
  │Cloud SQL  │            │Cloud SQL  │              │Cloud SQL  │
  │Auth+FHIR  │            │Auth+FHIR  │              │Auth only  │
  │+EHRbase   │            │+EHRbase   │              └───────────┘
  └──┬────────┘            └──┬────────┘
     │                        │
  ┌──▼────────┐            ┌──▼────────┐
  │HAPI FHIR  │            │HAPI FHIR  │
  │EHRbase VM │            │EHRbase VM │
  └───────────┘            └───────────┘

  Production                Staging                    Teaching
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

- `europe-west2-docker.pkg.dev/quill-medical-{env}/quill/backend:latest`
- `europe-west2-docker.pkg.dev/quill-medical-{env}/quill/frontend:latest`

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

### Production Terraform apply (done)

`terraform apply` completed for the production environment — **50 resources created**:

- VPC, subnet, Cloud NAT, VPC connector, firewall rules
- 3 Cloud SQL instances (auth, FHIR, EHRbase) with auto-generated passwords
- Secret Manager secrets with initial values
- Cloud Run backend and frontend (placeholder images)
- Compute Engine VM for HAPI FHIR + EHRbase
- Artifact Registry Docker repository
- IAM bindings for public Cloud Run access and Secret Manager
- Monitoring uptime checks and email alerts

Cloud Run URLs:

- Backend: `https://quill-backend-prod-vyeoxhqnba-nw.a.run.app`
- Frontend: `https://quill-frontend-prod-vyeoxhqnba-nw.a.run.app`

### Global HTTPS Load Balancer (done)

Each environment has a Global HTTPS Load Balancer that sits in front of the Cloud Run services. This provides:

- **Path-based routing**: `/api/*` goes to the backend Cloud Run service, everything else goes to the frontend
- **Google-managed SSL certificates**: automatically provisioned and renewed for each domain
- **Cloud Armor WAF**: rate limiting at 500 requests per minute per IP address
- **HTTP to HTTPS redirect**: all port 80 traffic is redirected to port 443
- **Static global IP**: stable IP addresses for DNS A records

| Environment | Domain                       | Load Balancer IP  |
| ----------- | ---------------------------- | ----------------- |
| Production  | `app.quill-medical.com`      | `34.110.153.200`  |
| Staging     | `staging.quill-medical.com`  | `35.186.223.130`  |
| Teaching    | `teaching.quill-medical.com` | `136.110.221.126` |

The Caddyfile no longer reverse-proxies `/api/*` to the backend — the load balancer handles all routing. Caddy now just serves static frontend files and provides a `/healthz` endpoint for health checks.

### Domain architecture (done)

| Domain                       | Purpose                       | Update process                       |
| ---------------------------- | ----------------------------- | ------------------------------------ |
| `quill-medical.com`          | Public landing/marketing site | Update anytime, no clinical sign-off |
| `app.quill-medical.com`      | Live clinical application     | Release versions, DCB0129, UAT       |
| `staging.quill-medical.com`  | Staging/integration testing   | Auto-deploy from main branch         |
| `teaching.quill-medical.com` | Teaching/training environment | Auto-deploy from main branch         |

The public landing site (`quill-medical.com`) is intentionally separate from the clinical app. This allows marketing pages, pricing, and feature announcements to be updated without going through clinical release gates. The apex domain is currently unused — a Cloud Storage bucket with CDN can be added later.

### DNS records (done)

Cloud DNS zone `quill-medical-zone` in the production project holds all DNS records:

| Record                       | Type | TTL | Value             |
| ---------------------------- | ---- | --- | ----------------- |
| `app.quill-medical.com`      | A    | 300 | `34.110.153.200`  |
| `staging.quill-medical.com`  | A    | 300 | `35.186.223.130`  |
| `teaching.quill-medical.com` | A    | 300 | `136.110.221.126` |

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

### Create Alembic migration Cloud Run job

The deploy workflows originally included an Alembic migration step (`gcloud run jobs execute migrate-auth-db`), but this Cloud Run job doesn't exist yet. It was removed from the workflows temporarily.

To restore it:

1. Add a `google_cloud_run_v2_job` resource in Terraform that runs `alembic upgrade head` against the auth DB
2. Grant the job's service account access to the Cloud SQL instance and the `database-url` secret
3. Re-add the migration steps to `deploy-staging.yml` (staging + teaching) and `deploy-production.yml`

### Production go-live

1. Cut a `release/*` branch from `main`
2. Test on staging
3. PR to `clinical-live`
4. CI deploys to production
5. Verify health checks pass

### Future improvements

- Cloud DNS managed zone via Terraform (currently created manually)
- DNS A records via Terraform (currently created manually via `gcloud`)
- Public landing site at `quill-medical.com` (Cloud Storage + CDN or similar)
- Slack webhook for deployment notifications
- CPU/memory/error-rate monitoring (beyond uptime checks)
- Production database tier upgrade from `db-f1-micro`
- High availability for production Cloud SQL
- Restrict Cloud Run ingress to `INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER` (once LB is confirmed working)
