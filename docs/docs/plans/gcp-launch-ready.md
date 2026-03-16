# GCP launch-ready infrastructure

Deploy Quill Medical to GCP with three isolated environments (production, staging, teaching) across separate GCP projects. Cloud Run for app services, Cloud SQL for databases, a Compute Engine VM for FHIR/EHRbase, Terraform for Infrastructure as code (IaC), and GitHub Actions CI/CD pushing images to Github container register (GHCR). DNS delegated from GoDaddy to Cloud DNS. Budget target: £50-200/month.

## Architecture

```text
                    GoDaddy (domain registrar)
                           │
                    Cloud DNS (Terraform-managed)
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
     app.quill-medical  staging.    teaching.
              │            │            │
        GCP HTTPS Load Balancer (Google-managed TLS)
              │            │            │
       ┌──────┘     ┌──────┘     ┌──────┘
       ▼             ▼           ▼
   Cloud Run      Cloud Run   Cloud Run
   (prod proj)   (staging)   (teaching)
       │             │           │
   Cloud SQL      Cloud SQL   Cloud SQL
   (3× Postgres) (3× Postgres) (1× Postgres)
       │             │           │
   Compute Engine  Compute Engine  Cloud Storage
   (FHIR+EHRbase) (FHIR+EHRbase)  (images)
```

`quill-medical.com` (landing page) is also served via Cloud Run from the existing `public_pages` build. Teaching has no clinical databases (no FHIR/EHRbase) but needs a single Postgres instance for auth and user scores, plus a Cloud Storage bucket for images.

## Estimated monthly cost

| Service                        | Prod   | Staging | Teaching | Total        |
| ------------------------------ | ------ | ------- | -------- | ------------ |
| Cloud Run (backend + frontend) | £8-15  | £3-8    | £3-5     | £14-28       |
| Cloud SQL (3× db-f1-micro)     | £25-40 | £25-40  | £8-13    | £58-93       |
| Compute Engine (e2-small)      | £12-15 | £12-15  | £0       | £24-30       |
| Cloud Storage (images)         | £0     | £0      | £1-3     | £1-3         |
| Cloud DNS + Load Balancer      | £16-21 | —       | —        | £16-21       |
| **Total**                      |        |         |          | **£113-175** |

Staging can be stopped when not in use to reduce costs.

## Decisions

- **Cloud Run** for app/backend/public-pages — scales to zero, cheapest for moderate traffic, auto-TLS
- **Cloud SQL** (PostgreSQL 16) for all databases — managed backups, encryption-at-rest, critical for clinical data
- **Compute Engine** (e2-small) for FHIR + EHRbase — always-on Java apps, Docker Compose on VM
- **GHCR** for container images — built in GitHub Actions, pulled by Cloud Run
- **Separate GCP projects** per environment — strongest isolation boundaries
- **Cloud DNS** — delegated from GoDaddy, Terraform-managed
- **Google-managed TLS certificates** — free, auto-renewing
- **Teaching app** — part of this monorepo, deployed to its own project, single Postgres DB (auth + scores), Cloud Storage for images
- **Cloud Storage** for teaching images — cheaper and more suitable than storing blobs in a database
- **Budget target**: £50-200/month

## Phase 1: Code hardening (no GCP dependency)

### Step 1.1: Harden Docker images

**Backend** (`backend/Dockerfile`) — already has non-root `appuser`:

- Add `HEALTHCHECK` instruction for container orchestration
- Pin base image digest (not just tag) for reproducibility
- Add `--no-install-recommends` to apt commands if any
- Verify `USER appuser` is applied in prod stage

**Frontend** (`frontend/Dockerfile`) — create production multi-stage build:

- Stage 1: Build static assets with `yarn build`
- Stage 2: Serve via Caddy-alpine (~25MB image, no Node.js in final image)
- Run as non-root user

### Step 1.2: Production Caddyfile

Create `caddy/prod/Caddyfile`:

- Security headers: HSTS, CSP, X-Frame-Options, X-Content-Type-Options
- Static asset caching (Cache-Control)
- Rate limiting on `/api/auth/*` endpoints
- Health check passthrough

### Step 1.3: Production Docker Compose files

- `compose.yml` — base service definitions shared between dev/prod
- `compose.prod.yml` — production overrides (no volume mounts, resource limits, restart policies, secrets from environment)
- `compose.fhir.yml` — FHIR + EHRbase for the Compute Engine VM

### Step 1.4: Harden backend for public exposure

Modify `backend/app/config.py`, `backend/app/main.py`, `backend/app/push.py`:

- `SECURE_COOKIES=True` in production (currently `False`)
- `COOKIE_DOMAIN=.quill-medical.com`
- CORS allowed origins whitelist (`app.quill-medical.com`, `staging.quill-medical.com`)
- Rate limiting on login/register endpoints (slowapi)
- Move push subscriptions from in-memory list → database table
- Create `backend/docker/entrypoint.sh` to run Alembic migrations before server start

### Step 1.5: Environment-aware frontend

Modify `frontend/vite.config.ts`, `frontend/public/manifest.webmanifest`:

- Production build with minification + tree-shaking
- PWA manifest with correct production `start_url` and `scope`

## Phase 2: Terraform infrastructure

### Step 2.1: GCP setup (manual)

- Create GCP projects: `quill-prod`, `quill-staging`, `quill-teaching`
- Enable APIs: Cloud Run, Cloud SQL, Compute Engine, Cloud DNS, Secret Manager, IAM
- Create Terraform service account + store key as GitHub secret

### Step 2.2: Terraform project structure

Create `infra/` directory:

```text
infra/
├── modules/
│   ├── cloud-run/       # Reusable Cloud Run service
│   ├── cloud-sql/       # Reusable Cloud SQL instance
│   ├── cloud-storage/   # GCS buckets (teaching images)
│   ├── compute-fhir/    # FHIR+EHRbase VM
│   ├── dns/             # Cloud DNS zone + records
│   ├── networking/      # VPC, subnets, firewall
│   ├── load-balancer/   # HTTPS LB + managed certs
│   └── secrets/         # Secret Manager
├── environments/
│   ├── prod/            # terraform.tfvars per env
│   ├── staging/
│   └── teaching/
├── backend.tf           # Remote state in GCS bucket
└── versions.tf
```

### Step 2.3: Networking module

- VPC with private subnets for Cloud SQL and Compute Engine
- Cloud NAT for outbound internet from private resources
- Firewall rules: SSH only from IAP, no direct DB access from internet
- Private service connection for Cloud SQL (no public IP on databases)
- Serverless VPC connector for Cloud Run → Cloud SQL connectivity

### Step 2.4: Cloud SQL module

- 3× PostgreSQL 16 instances for prod/staging (auth, fhir, ehrbase)
- 1× PostgreSQL 16 instance for teaching (auth + scores, no FHIR/EHRbase)
- `db-f1-micro` tier for cost (can scale up)
- Private IP only (no public access)
- Automated daily backups with 7-day retention
- Point-in-time recovery enabled
- Encryption at rest (Google-managed keys)
- Maintenance window: Sunday 03:00 UTC

### Step 2.5: Compute Engine module (FHIR + EHRbase)

- `e2-small` instance (2 vCPU, 2GB RAM)
- Container-optimised OS or Debian with Docker
- Startup script installs Docker Compose, pulls images, starts services
- Private IP only, accessed via VPC from Cloud Run
- Health check on FHIR (`/fhir/metadata`) and EHRbase (`/ehrbase/rest/status`)

### Step 2.6: Cloud Run module

- Deploy backend (FastAPI), frontend (static + Caddy), public pages
- Environment variables from Secret Manager
- VPC connector for database access
- Min instances: 0 (scales to zero when idle), max: 10
- Memory: 512MB backend, 256MB frontend
- Concurrency: 80 requests per instance
- Ingress: internal + load balancer only (no direct public access to Cloud Run URLs)

### Step 2.7: Load Balancer and DNS

- Global HTTPS load balancer
- Backend services pointing to Cloud Run NEGs (serverless)
- URL map routing:
  - `app.quill-medical.com/*` → prod Cloud Run (app)
  - `staging.quill-medical.com/*` → staging Cloud Run
  - `teaching.quill-medical.com/*` → teaching Cloud Run
  - `quill-medical.com/*` → prod Cloud Run (public pages)
- Google-managed SSL certificates for all domains
- Cloud DNS zone with A records pointing to LB IP
- Optional: Cloud Armor WAF rules (OWASP top 10 protection)

### Step 2.8: Secret Manager

- Store: JWT_SECRET, DB passwords, VAPID keys, EHRbase credentials
- Cloud Run services reference secrets as env vars
- Terraform creates secrets, values set manually or via CI

## Phase 3: CI/CD pipeline

### Step 3.1: Docker image build

New workflow `.github/workflows/deploy.yml`:

- **Trigger**: push to `main`, skip if only docs changed
- Detect which services changed → only build affected images
- Push to `ghcr.io/bailey-medics/quill-{backend,frontend,public-pages}:sha-<commit>` and `:latest`

### Step 3.2: Auto-deploy to staging

- After image build: authenticate to GCP via Workload Identity Federation (no keys)
- Deploy updated Cloud Run services to staging
- Run Alembic migrations against staging DB
- Smoke test `staging.quill-medical.com/api/health`
- Slack notification

### Step 3.3: Manual deploy to production

- **Trigger**: `workflow_dispatch` or GitHub Release
- Same steps as staging, targets prod project
- Requires manual approval

### Step 3.4: Teaching deploy

- Auto on `main` when teaching files change

### Step 3.5: Terraform CI

New workflow `.github/workflows/terraform.yml`:

- On PR: `terraform plan`, post diff as PR comment
- On merge to main: `terraform apply`

## Phase 4: Observability (parallel with Phase 3)

### Step 4.1: Logging

- Cloud Run auto-sends stdout/stderr to Cloud Logging
- Structure backend logs as JSON (`python-json-logger`)
- Log request ID, user ID (not PHI), response times

### Step 4.2: Health checks and uptime monitoring

- GCP Uptime Checks on each subdomain (free tier: 6 checks)
- Alert policy → email/Slack on downtime
- Use existing `/api/health` endpoint

### Step 4.3: Error tracking (future)

- Sentry or Cloud Error Reporting for frontend + backend
- Source maps for frontend error deobfuscation

## Phase 5: Staging access control

### Step 5.1: Identity-Aware Proxy (IAP)

- Enable Cloud IAP on staging Cloud Run service
- Only allow specific Google accounts / Google Workspace group
- Zero-trust access without VPN
- Terraform-managed IAP member list

## Verification

1. **Phase 1**: `docker compose -f compose.yml -f compose.prod.yml build` succeeds; health checks pass locally
2. **Phase 2**: `terraform plan` shows expected resources; `terraform apply` creates staging infra
3. **Phase 3**: Push to main → images build → staging deploys → `curl staging.quill-medical.com/api/health` returns healthy
4. **Phase 4**: Structured logs visible in Cloud Logging; uptime checks green
5. **Phase 5**: Unauthorised users get 403 on staging; allowed users can access

## Scope

**Included**: Infrastructure, CI/CD, Docker hardening, security headers, DNS, TLS, basic monitoring, staging access control

**Excluded**: Application feature work, clinical data migration, production data seeding, custom domain email, CDN (add later), disaster recovery runbook, penetration testing, compliance certifications

## Implementation order

Phases 1 and 2.1 (manual GCP setup) start **in parallel**. Phase 2.2+ depends on 2.1. Phase 3 depends on 1 + 2. Phase 4 is parallel with 3. Phase 5 follows staging deployment. ~20 distinct implementation tasks, each walkthrough-able individually.
