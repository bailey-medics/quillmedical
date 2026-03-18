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
                        ┌────────────▼─────────────┐
                        │  Global HTTPS LB         │
                        │  (Google-managed TLS)     │
                        └──┬──────────┬──────────┬─┘
                           │          │          │
              app.         │  staging.│  teaching.│
              quill-medical│          │          │
                           │          │          │
                    ┌──────▼──┐ ┌─────▼───┐ ┌───▼──────┐
                    │Cloud Run│ │Cloud Run│ │Cloud Run │
                    │Backend  │ │Backend  │ │Backend   │
                    │Frontend │ │Frontend │ │Frontend  │
                    └────┬────┘ └────┬────┘ └────┬─────┘
                         │          │          │
                    ┌────▼────┐ ┌───▼────┐     │ (no FHIR)
                    │Cloud SQL│ │Cloud SQL│     │
                    │Auth+FHIR│ │Auth+FHIR│ ┌──▼──────┐
                    │+EHRbase │ │+EHRbase │ │Cloud SQL│
                    └────┬────┘ └────┬────┘ │Auth only│
                         │          │      └─────────┘
                    ┌────▼────┐ ┌───▼────┐
                    │Compute  │ │Compute │
                    │HAPI FHIR│ │HAPI FHIR│
                    │EHRbase  │ │EHRbase │
                    └─────────┘ └────────┘
```

Each environment has:

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

The GCP organisation (`826360329716`) enforces **Domain Restricted Sharing** by default, which blocks `allUsers` IAM bindings. This was overridden at the project level for staging to allow public Cloud Run access:

```bash
gcloud resource-manager org-policies set-policy policy.yaml --project=quill-medical-staging
```

This must also be done for teaching and production projects before deploying those environments.

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

### Local Terraform plan (done)

`terraform plan` for staging completed successfully: **43 resources to add, 0 errors**.

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

## Remaining steps

### Organisation policy override for teaching and production

The same `iam.allowedPolicyMemberDomains` override applied to staging must be applied to teaching and production before deploying:

```bash
gcloud resource-manager org-policies set-policy /tmp/policy.yaml --project=quill-medical-teaching
gcloud resource-manager org-policies set-policy /tmp/policy.yaml --project=quill-medical-production
```

### Terraform apply for teaching

Same as staging but without FHIR/EHRbase resources. Fewer resources, lower cost.

### Terraform apply for production

Applied separately via the `clinical-live` branch. Same structure as staging.

### Set real secret values

Terraform auto-generated placeholder values for `jwt-secret` and `vapid-private`. Before going live, replace with proper values:

- `vapid-private` — generate with `just vapid-key` and update via:

```bash
echo -n "REAL_KEY_HERE" | gcloud secrets versions add vapid-private --data-file=- --project=quill-medical-staging
```

The `jwt-secret` auto-generated value is fine for use — it's a strong random 64-character string.

Database passwords are auto-generated by Terraform and stored in Secret Manager automatically.

### DNS delegation

Point GoDaddy nameservers to Cloud DNS. This makes `quill-medical.com` and all subdomains resolve to GCP.

### First deployment

Once DNS is set up, merge the `feature/gcp-setup` branch to `main`. The CI pipeline will:

1. Build container images
2. Push to Artifact Registry
3. Deploy to staging and teaching Cloud Run
4. Run Alembic migrations
5. Smoke test the health endpoint

### Production go-live

1. Cut a `release/*` branch from `main`
2. Test on staging
3. PR to `clinical-live`
4. CI deploys to production
5. Verify health checks pass

### Future improvements

- Load balancer with Google-managed TLS (currently Cloud Run handles TLS directly)
- Cloud DNS managed zone via Terraform
- Slack webhook for deployment notifications
- CPU/memory/error-rate monitoring (beyond uptime checks)
- Production database tier upgrade from `db-f1-micro`
- High availability for production Cloud SQL
