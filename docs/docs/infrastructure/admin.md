# Remote admin tasks

## What this is

Our live environments (staging, teaching, production) run on Google Cloud Run — a serverless platform with no SSH access to the servers. This means you cannot log in and run scripts the way you would on a traditional server.

To solve this, we have a **Cloud Run Job** called `quill-admin` that can run admin tasks against the live database on demand. It connects securely to the same database as the live backend, but only runs when you manually trigger it.

Think of it as a secure, one-shot tool that you fire from your terminal, it does the task, and then shuts down.

## Prerequisites

Before using these commands, you need:

1. **Google Cloud CLI** (`gcloud`) installed on your Mac — [install guide](https://cloud.google.com/sdk/docs/install)
2. **Authenticated to the correct GCP project** — run `gcloud auth login` if you haven't recently
3. **The admin Docker image built and pushed** — see [First-time setup](#first-time-setup) below

## First-time setup

Before you can run any admin commands against a live environment, you need to login, build and push the admin image once. You only need to repeat this if the admin tooling code changes.

```bash
gcloud auth login
just build-admin staging
```

Replace `staging` with `teaching` or `prod` as needed. This builds the admin container, pushes it to the environment's container registry, and updates the Cloud Run Job to use it.

## Available commands

### Create a superadmin account

This is the most common task — creating your own account with full superadmin access on a live environment.

```bash
just create-superadmin staging
```

You will be prompted for:

- **Username** — your login username (e.g. `mark`)
- **Email** — your email address
- **Password** — your account password (hidden as you type)

This creates a new user (or updates an existing one) with:

- `superadmin` system permission level (the highest level)
<!-- Really, the person setting up the system should have lowest base profession, eg same as patient or lower, and that can be increased in the system if needed manually -->
- `consultant` base profession (full clinical competencies)
- `System Administrator` role

Replace `staging` with `teaching` or `prod` to target a different environment.

### Update a user's permission level

Change the system permission level for an existing user:

```bash
just update-permissions-remote staging
```

You will be prompted for the username and the new permission level. The four levels, from lowest to highest, are:

| Level        | Access                                             |
| ------------ | -------------------------------------------------- |
| `patient`    | Own records only                                   |
| `staff`      | Clinical application access                        |
| `admin`      | User management, patient admin, audit logs         |
| `superadmin` | System configuration, database access, full access |

### Add a role to a user

Assign an additional role to an existing user:

```bash
just add-role-remote staging
```

You will be prompted for the username and the role name. Available roles:

- System Administrator
- Clinical Administrator
- Clinician
- Clinical Support Staff
- Patient
- Patient Advocate

## Command aliases

All commands have short aliases for convenience:

| Full command                             | Alias             |
| ---------------------------------------- | ----------------- |
| `just build-admin staging`               | `just ba staging` |
| `just create-superadmin staging`         | `just cs staging` |
| `just update-permissions-remote staging` | `just up staging` |
| `just add-role-remote staging`           | `just ar staging` |

## Environments

Replace the environment name in any command above:

| Environment | When to use                               |
| ----------- | ----------------------------------------- |
| `staging`   | Integration testing, pre-release checks   |
| `teaching`  | Educational environment, demonstrations   |
| `prod`      | Live clinical environment (use with care) |

## How it works (technical detail)

The system is built from four pieces:

1. **Admin CLI script** (`backend/scripts/admin_cli.py`) — a Python script that reads environment variables to determine what action to take, then connects to the database and executes it. No interactive prompts — everything is passed via environment variables, which is how Cloud Run Jobs work.

2. **Docker image** (`admin` target in `backend/Dockerfile`) — a lightweight container that includes only the admin script and the app's database libraries. It does not include the full backend server.

3. **Terraform module** (`infra/modules/cloud-run-job/`) — infrastructure-as-code that creates the `google_cloud_run_v2_job` resource in each GCP project. It has the same VPC access and database credentials as the backend service.

4. **Justfile commands** — developer-friendly wrappers that handle Docker builds, image pushes, and `gcloud run jobs execute` calls with the right project and region.

When you run `just create-superadmin staging`, what happens behind the scenes:

1. The Justfile looks up the GCP project ID for `staging`
2. It prompts you for username, email, and password
3. It calls `gcloud run jobs execute quill-admin-staging` with those values as environment variables
4. Google Cloud spins up the admin container inside the VPC
5. The container connects to the Cloud SQL auth database (via private IP)
6. It creates/updates the user, sets permissions, assigns the role
7. The container shuts down and the job execution is marked complete

The `--wait` flag means your terminal will wait for the job to finish and show you the output.

## Troubleshooting

### "Permission denied" or "not authenticated"

Run `gcloud auth login` and make sure you have the correct project permissions.

### "Job not found"

The Cloud Run Job hasn't been created by Terraform yet. Run `terraform apply` for the target environment first.

### "Admin image not found"

You need to build and push the admin image first:

```bash
just build-admin staging
```

### User created but role not assigned

If you see a warning about the System Administrator role not being found, the database roles haven't been seeded yet. Create the user first, then add the role once the application has been deployed and seeded:

```bash
just add-role-remote staging
```
