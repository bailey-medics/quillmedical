# Remote admin tasks

## What this is

Our live environment (`app`) runs on Google Cloud Run - a serverless platform with no SSH access to the servers. This means you cannot log in and run scripts the way you would on a traditional server.

To solve this, we have a **Cloud Run Job** called `quill-admin` that can run admin tasks against the live database on demand. It connects securely to the same database as the live backend, but only runs when you manually trigger it.

Think of it as a secure, one-shot tool that you fire from your terminal, it does the task, and then shuts down.

## Prerequisites

Before using these commands, you need:

1. **Google Cloud CLI** (`gcloud`) installed on your Mac - [install guide](https://cloud.google.com/sdk/docs/install)
2. **Authenticated to the correct GCP project** - run `gcloud auth login` if you haven't recently
3. **The admin Docker image built and pushed** - see [First-time setup](#first-time-setup) below

## First-time setup

Before you can run any admin commands against a live environment, you need to log in. The deploy pipeline builds and pushes the admin image on every backend change, so you only need to build it by hand to run admin tooling that has not been deployed yet.

```bash
gcloud auth login
```

```bash
just build-admin app
```

This builds the admin container, pushes it to the environment's container registry, and updates the Cloud Run Job to use it.

## Available commands

### Create a superadmin account

This is the most common task - creating your own account with full superadmin access on a live environment.

```bash
just create-superadmin app
```

You will be prompted for:

- **Username** - your login username (e.g. `steve.jones`)
- **Email** - your email address
- **Password** - your account password (hidden as you type)

This creates a new user (or updates an existing one) with:

- `superadmin` platform role
- `superadmin_profession` base profession for a new user (an existing user keeps their profession and gains its competencies)
- `System Administrator` role


## Command aliases

All commands have short aliases for convenience:

| Full command                 | Alias         |
| ---------------------------- | ------------- |
| `just build-admin app`       | `just ba app` |
| `just create-superadmin app` | `just cs app` |
| `just add-role-remote app`   | `just ar app` |
| `just migrate-remote app`    | `just mr app` |

## Environments

There is one environment, and the commands refuse any other name:

| Environment | When to use                                           |
| ----------- | ----------------------------------------------------- |
| `app`       | The only environment: teaching and clinician passport |

## How it works (technical detail)

The system is built from four pieces:

1. **Admin CLI script** (`backend/scripts/admin_cli.py`) - a Python script that reads environment variables to determine what action to take, then connects to the database and executes it. No interactive prompts - everything is passed via environment variables, which is how Cloud Run Jobs work.

2. **Docker image** (`admin` target in `backend/Dockerfile`) - a container built on the same base as the backend (the application code and its dependencies) with the admin script added. It does not start the backend server.

   !!! warning "Multi-stage Dockerfile ordering"
   The `prod` stage is not the last stage in the Dockerfile: `admin` and `transcode` come after it. If you build without `--target`, Docker builds the last stage by default - which means you get the transcode job image, not the web server. CI deploy workflows must always specify `target: prod` explicitly.

3. **Terraform module** (`infra/modules/cloud-run-job/`) - infrastructure-as-code that creates the `google_cloud_run_v2_job` resource in each GCP project. It has the same VPC access and database credentials as the backend service.

4. **Justfile commands** - developer-friendly wrappers that handle Docker builds, image pushes, and `gcloud run jobs execute` calls with the right project and region.

When you run `just create-superadmin app`, what happens behind the scenes:

1. The Justfile looks up the GCP project ID for `app`
2. It prompts you for username, email, and password
3. It calls `gcloud run jobs execute quill-admin-app` with those values as environment variables
4. Google Cloud spins up the admin container inside the VPC
5. The container connects to the Cloud SQL auth database (via private IP)
6. It creates/updates the user, sets permissions, assigns the role
7. The container shuts down and the job execution is marked complete

The `--wait` flag means your terminal will wait for the job to finish and show you the output.

## Troubleshooting

### Backend service running the admin image by mistake

**Symptom:** Cloud Run backend fails its startup probe. Logs show `ERROR: ADMIN_ACTION environment variable is required` repeating in a loop.

**Cause:** The backend _service_ is running the `admin` Docker image instead of the `prod` image. The admin image is a CLI tool that exits immediately - it does not start an HTTP server, so health checks always fail.

This can happen if:

- Someone manually deploys the admin image to the backend service by mistake
- The CI deploy workflow builds Docker without `--target prod`, causing Docker to build the last stage in the Dockerfile (which is `transcode`, not `prod`)

**Fix:** Deploy the correct `prod` image:

```bash
# Build the prod stage locally
docker build --target prod -f backend/Dockerfile -t quill-backend-prod .

# Auth to the environment's Artifact Registry
gcloud auth configure-docker europe-west2-docker.pkg.dev --quiet

# Tag and push (replace {env} and {project})
docker tag quill-backend-prod \
  europe-west2-docker.pkg.dev/{project}/quill/backend:main
docker push \
  europe-west2-docker.pkg.dev/{project}/quill/backend:main

# Deploy to Cloud Run
gcloud run services update quill-backend-{env} \
  --project={project} \
  --region=europe-west2 \
  --image=europe-west2-docker.pkg.dev/{project}/quill/backend:main
```

**Prevention:** The deploy workflow must always specify `target: prod` in the Docker build step. See the `build` job in `deploy.yml`.

### Startup probe failures (general)

**Symptom:** `The user-provided container failed the configured startup probe checks.`

**Diagnosis:** Check the Cloud Run revision logs:

```bash
gcloud beta run revisions logs read {revision-name} \
  --project={project} \
  --region=europe-west2 \
  --limit=30
```

Or for the whole service:

```bash
gcloud run services logs read quill-backend-{env} \
  --project={project} \
  --region=europe-west2 \
  --limit=30
```

Common causes:

- **Wrong image** - admin CLI image instead of prod (see above)
- **Slow cold start** - VPC connector setup and Cloud SQL connections can be slow. The startup probe allows 70 seconds (10s delay + 6 failures x 10s period)

### Deploy pipeline blocked on migration failure

**Symptom:** The `Run database migrations` step in `deploy.yml` fails, and the subsequent `Deploy backend` step never runs.

**Cause:** This is the pipeline working as intended - `alembic upgrade head` runs once as a pre-deploy Cloud Run Job (`quill-admin-{env}`), before the new backend revision is created. A failed migration transaction rolls back cleanly (no partial schema change) and blocks the deploy, rather than crash-looping the serving container. See [Alembic migration safety](../backend/alembic-migration-safety.md).

**Diagnosis:** Check the job execution logs:

```bash
gcloud run jobs executions list --job=quill-admin-{env} --project={project} --region=europe-west2 --limit=5
gcloud beta run jobs executions logs read {execution-name} --project={project} --region=europe-west2
```

**Fix:** Fix the migration (or the underlying schema conflict), push a new commit, and let the pipeline re-run. To manually re-run migrations without a full deploy, use `just migrate-remote {env}`.

### Terraform state lock

**Symptom:** `Error acquiring the state lock` with `conditionNotMet`.

**Cause:** A previous Terraform run (usually a failed CI apply) didn't release the GCS state lock.

**Fix:**

```bash
gcloud storage rm gs://quill-medical-app-terraform-state/terraform/state/{env}.tflock
```

Then re-run the Terraform apply (or re-trigger the CI workflow).

### "Permission denied" or "not authenticated"

Run `gcloud auth login` and make sure you have the correct project permissions.

### "Job not found"

The Cloud Run Job hasn't been created by Terraform yet. Run `terraform apply` for the target environment first.

### "Admin image not found"

You need to build and push the admin image first:

```bash
just build-admin app
```

### User created but role not assigned

If you see a warning about the System Administrator role not being found, the database roles haven't been seeded yet. Create the user first, then add the role once the application has been deployed and seeded:

```bash
just add-role-remote app
```
