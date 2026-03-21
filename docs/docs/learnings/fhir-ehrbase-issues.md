# FHIR and EHRbase staging issues

## 21 March 2026 — Staging infrastructure bootstrap

### Summary

Staging returned `"Database is initialising"` because neither FHIR nor EHRbase containers were running on the Compute Engine VM. Six cascading issues were discovered and resolved.

### Issues found

#### 1. Wrong Docker image on Cloud Run

Cloud Run was serving an **admin** Docker image instead of the **prod** target. The deploy workflow built without `--target prod`, so the image lacked the production entrypoint.

**Fix:** Manually built with `--target prod`, pushed to Artifact Registry, and redeployed.

#### 2. COS read-only filesystem breaks startup script

The VM uses Container-Optimised OS (COS), which has a **read-only root filesystem**. The startup script tried to install Docker Compose to `/usr/local/lib/docker/cli-plugins/` and write config to `/opt/quill/` — both fail silently.

Key COS constraints:

- `/usr/`, `/opt/`, `/root/` — **read-only**
- `/var/`, `/home/`, `/mnt/stateful_partition/` — writable but **noexec** (cannot execute binaries)
- Docker Compose binary **cannot be installed anywhere** on COS

**Fix:** Bypassed Docker Compose entirely and used direct `docker run` commands. The startup script still needs a permanent redesign (either use `docker run` commands, run Compose via a container image, or switch to a standard VM image).

#### 3. Missing PostgreSQL extension for EHRbase

EHRbase's Flyway migration `V1__ehr.sql` calls `uuid_generate_v4()`, which requires the `uuid-ossp` PostgreSQL extension. Cloud SQL does not create it by default.

**Fix:** Created the extension manually:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

This was run via a disposable `postgres:16-alpine` container on the VM, connecting to Cloud SQL with the postgres admin user.

#### 4. Missing EHRbase environment variables

EHRbase requires `DB_USER_ADMIN` and `DB_PASS_ADMIN` for Flyway to create schemas and run DDL during migrations. Without them, Flyway tries to authenticate with the literal string `${DB_USER_ADMIN}`.

**Fix:** Added the missing env vars (postgres admin credentials) to the EHRbase container config.

#### 5. EHRbase username mismatch

The backend config default `EHRBASE_API_USER` was `ehrbase_user` (underscore), but the Docker Compose reference used `ehrbase-user` (hyphen). This caused 401 responses when Cloud Run tried to authenticate.

**Fix:** Standardised on `ehrbase_user` (underscore) everywhere — both the EHRbase container's `SECURITY_AUTHUSER` and the backend's config default.

#### 6. EHRbase startup timing

EHRbase takes 30–110 seconds to start (Flyway migrations, Spring Boot init, HikariPool). Health checks hitting EHRbase during startup received 401 because Spring Security wasn't initialised yet. This was misdiagnosed as a credentials issue during debugging.

**Fix:** Allowed sufficient startup time. The Cloud Run startup probe was also updated with `timeout_seconds = 15` (was defaulting to 1 second) to prevent premature failure.

### Infrastructure changes made

| Change                                  | File                                    | Status                                    |
| --------------------------------------- | --------------------------------------- | ----------------------------------------- |
| Startup probe timeout (1s → 15s)        | `infra/modules/cloud-run/main.tf`       | Committed (`ed5b39b`)                     |
| COS startup script path fixes           | `infra/modules/compute-fhir/startup.sh` | Committed (`ed5b39b`, needs further work) |
| `uuid-ossp` extension on Cloud SQL      | `quill-ehrbase-staging` instance        | Applied manually                          |
| EHRbase container with correct env vars | `fhir-ehrbase-staging` VM               | Running via `docker run`                  |
| FHIR container                          | `fhir-ehrbase-staging` VM               | Running via `docker run`                  |

### Remaining actions

See [plans/todo.md](../plans/todo.md#fhrehrbase-vm-cos) for the tracked to-do list.
