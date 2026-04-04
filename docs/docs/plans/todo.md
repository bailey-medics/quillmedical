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

## FHIR/EHRbase VM (COS)

_See [learnings/fhir-ehrbase-issues.md](../learnings/fhir-ehrbase-issues.md) for full context._

- [ ] Redesign `infra/modules/compute-fhir/startup.sh` for COS — Docker
      Compose binary cannot be installed or executed anywhere on
      Container-Optimised OS (read-only root, noexec on writable paths).
      Options: use direct `docker run` commands, run Compose via a container
      image, or switch to a standard VM image.

- [ ] Automate `uuid-ossp` extension creation for the EHRbase Cloud SQL
      database. EHRbase Flyway migrations require `uuid_generate_v4()`, but
      Cloud SQL does not install the extension by default. Currently created
      manually — **must be re-run if the Cloud SQL instance or `ehrbase`
      database is ever destroyed and recreated**. Automate via the VM startup
      script (run `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` using a
      disposable postgres container before starting EHRbase).

- [ ] Add missing EHRbase env vars (`DB_USER_ADMIN`, `DB_PASS_ADMIN`) to the
      Terraform compute-fhir module so Flyway can run schema migrations.

- [ ] Rotate temporary postgres admin password (`temp-admin-pw-2026`) on the
      `quill-ehrbase-staging` Cloud SQL instance.

## Real-time auth state refresh

- [ ] Implement automatic auth state refresh when users return to Quill, so
      that nav links and permissions update without a manual page reload.
      **Scenario:** IT adds a doctor to a hospital's organisation — the
      doctor's nav should update when they switch back to Quill, not require
      a full refresh.

      **Options (in order of complexity):**

      1. **Visibility listener** — add a `visibilitychange` listener in
         `AuthContext.tsx` that calls `reload()` when the page becomes visible
         (with a debounce, e.g. max once per 30s). Zero backend changes. Covers
         tab switching, alt-tabbing back from other apps, unminimising, and
         returning from lock screen. Simple and effective for most cases.

      2. **Periodic polling** — add a `setInterval` in `AuthContext` to
         re-fetch `/api/auth/me` every 60s. Wasteful since 99% of polls return
         identical data, but simpler than SSE.

      3. **Server-Sent Events (SSE)** — backend pushes events when org
         membership or features change, frontend subscribes in `AuthContext`.
         True real-time but requires new backend infrastructure, connection
         management, and Caddy config for persistent connections. Worth
         considering if real-time updates are needed elsewhere (e.g. messaging,
         appointments, clinical alerts).

      Option 1 is recommended as a first step; option 3 may be worth investing
      in later as the app grows.

## Dependency management (Renovate / Dependabot)

- [ ] Enable **Dependabot alerts** in repo Settings → Security & analysis
- [ ] Ensure the `info@quill-medical.com` GitHub account **Watches** the repo
      (All activity or Custom → Security alerts)
- [ ] Configure **email routing** in that account's Settings → Notifications →
      Custom routing to route `bailey-medics/quillmedical` notifications to
      `info@quill-medical.com`
- [ ] Create the following repo labels if they don't already exist:
      `dependencies`, `security`, `major-version-bump`, `hotfix`,
      `tier-1-clinical`, `back-merge`

## Web push notifications

The plumbing works (service worker, `pywebpush`, VAPID signing) but it is
currently a proof-of-concept. The following items are needed before push
notifications are production-ready:

- [ ] **Persistent subscription storage** — subscriptions are held in an
      in-memory Python list (`push.py`) and lost on every backend restart.
      Move to the database (new `PushSubscription` model linked to `User`).

- [ ] **Automated triggers** — nothing in the codebase sends notifications in
      response to real events (new messages, appointments, etc.). The only way
      to fire one is the manual `POST /api/push/send-test` endpoint. Add
      triggers for the events that matter (messaging, appointment reminders,
      clinical alerts).

- [ ] **Auth on push endpoints** — both `/api/push/subscribe` and
      `/api/push/send-test` are completely unauthenticated. Add
      `DEP_CURRENT_USER` to `/subscribe` and restrict `/send-test` to admins.

- [ ] **VAPID key documentation** — `frontend/.env` needs `VITE_VAPID_PUBLIC`
      and `backend/.env` needs `VAPID_PRIVATE`, otherwise subscription/sending
      silently fails. Ensure `dev-env-check.sh` validates these exist and
      document in the developer setup guide.

- [ ] **Deduplicate subscription logic** — the enable-notifications code is
      copy-pasted between `EnableNotificationsButton.tsx` and `Settings.tsx`.
      Extract into a shared hook (e.g. `usePushSubscription`).

- [ ] **Use `api` client** — both subscription call sites use raw `fetch()`
      instead of the `api` client from `@/lib/api.ts`, bypassing CSRF and
      auth cookie handling.

### Verifying push notifications work in dev

1. Ensure VAPID keys are in `.env` files (`just vapid-key` to generate)
2. Click "Enable notifications" on the settings page and accept the browser
   permission prompt
3. `curl -X POST http://localhost/api/push/send-test` — you should see a real
   browser notification

## MISC

- [ ] Update all libraries to most recent
- [ ] Lock value in teaching schema, once locked, same version teaching config.yaml cannot be used, you will need to iterate upwards
- [ ] Redirect `/` to `/teaching` when `CLINICAL_SERVICES_ENABLED` is false —
      currently only the post-login redirect is handled; if an authenticated
      user navigates directly to `/` they see the clinical home page (patient
      list) instead of the teaching dashboard
- [ ] Create `/settings/password` page — the settings page links to it via
      "Change password" but no route or page component exists, resulting in a
      404

## Caddy documentation

- [ ] Audit the Caddy documentation (`docs/docs/backend/caddy/index.md`) —
      the "Key Features" subsections (Reverse Proxy, Static File Serving, CORS
      Handling, Request Logging) contain generic Caddy examples that do not
      match either the dev or prod Caddyfile. Replace with accurate snippets
      or remove. The "Why Caddy?" section is fine.
