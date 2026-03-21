# Project to-do list

## Branch protection

- [ ] Increase `required_approving_review_count` from 0 to 1 (or higher) in
      `infra/github/branch_rules.tf` when a second developer joins the team.
      Currently set to 0 because a solo developer cannot approve their own PRs.
      The PR requirement still creates an auditable change record for DCB 0129.

## Public site

- [ ] Update the EPR nav link from `https://staging.quill-medical.com` to the
      production URL once `quill-medical-production` is active. The link
      currently points to staging because the production GCP project is
      hibernated for cost savings.

- [ ] Add public pages to the production build and configure the 404 page: 1. Update `frontend/Dockerfile` build stage to also run
      `yarn workspace public-pages build` 2. Merge public pages output into the SPA dist (or serve alongside) 3. Update `caddy/prod/Caddyfile` to serve `.html` pages for clean URLs
      (e.g. `/about` → `about.html`) and use `not-found.html` as the error
      page instead of falling back to the SPA's `index.html` for all routes

## Database naming

- [ ] Rename the auth database to remove "auth" from the name — it is now used
      for more than authentication (organisations, messaging, etc.). This
      affects: 1. Cloud SQL instance name (`quill-auth-{env}` → e.g. `quill-db-{env}`) 2. Database name (`quill_auth` → e.g. `quill`) 3. Terraform variables and module references (`cloud_sql_auth`,
      `auth-db-password`, `AUTH_DB_*` env vars) 4. Backend config (`AUTH_DB_HOST`, `AUTH_DB_NAME`, `AUTH_DB_USER`,
      `AUTH_DB_PASSWORD` in `app/config.py`) 5. Backend DB module (`app/db/auth_db.py`, `AuthSessionLocal`,
      `AuthBase`, `get_auth_db`) 6. All scripts and tests that reference the auth DB 7. Docker Compose service name and environment variables 8. CI/CD workflows and Justfile commands 9. Cloud Run Job admin tooling (env vars set in `build-admin`)
