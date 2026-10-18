# Teaching sync without a GitHub secret plan

The teaching pipeline ends by calling `POST /api/ci/teaching/sync` with
`curl`, presenting `BACKEND_SYNC_TOKEN` as a bearer token. That makes
GitHub a holder of a runtime credential the live app accepts, which the
rule in `CLAUDE.md` forbids: a secret lives where it is used, and CI
should hold identifiers rather than credentials. The pipeline is a
reusable workflow (`workflow_call`) run by each teaching repository, so
the token is visible to every repository that can call it.

The fix is the pattern `accessibility-review.yml` already uses: GitHub,
signed in through Workload Identity Federation, starts the
`quill-admin-app` Cloud Run job with an `ADMIN_ACTION`, and the job does
the work inside GCP. Once the sync runs that way, the route and both
GitHub secrets are removed. `TEACHING_SYNC_TOKEN` itself stays: the
other three `/api/ci/teaching/*` routes are called by GCP's own
transcode, caption and poster jobs, which read it from Secret Manager.

## Phase 1: A sync action on the admin job

- [x] Add `sync-teaching` to `ACTIONS` in
      `backend/scripts/admin_cli.py`. It opens its own session with
      `CoreSessionLocal()`, calls `sync_every_bank`, the function the
      route calls today, and commits, since nothing commits for a job
      (see "Transactions" in `.claude/rules/backend.md`). When
      `outcome.errors` is not empty it prints each rejected bank and its
      reason, then exits non-zero, so the job fails exactly where the
      route answered 422 today.

- [x] Test the action, in
      `backend/tests/admin_cli_test.py`, beside the other actions' tests:
      a clean sync exits 0 and commits; a rejected bank still commits the
      banks that synced, exits non-zero and names the rejected bank;
      nothing to sync passes and says so; a sync that raises is rolled
      back and fails.

## Phase 2: A job that can only sync

- [x] Check which service account the pipeline signs in as, and what it
      may do. It is `content-sync@quill-medical-app.iam.gserviceaccount.com`
      (`content_ci_service_account`, set in `infra/environments/app`
      only), which may write the teaching bucket and nothing else.

      Found on 2026-10-16: the plan as first written had the pipeline
      start `quill-admin-app` with `ADMIN_ACTION` as an env override.
      That needs `roles/run.jobsExecutorWithOverrides`, which lets the
      caller choose **any** action, `create-superadmin` with a password
      of its choosing among them. A teaching repository, where content
      authors push, would then hold more than the bearer token gives it.
      The admin job also has no `TEACHING_GCS_BUCKET`, which only the
      backend service is given. Decided by Mark on 2026-10-17: a
      dedicated job instead, below.

- [x] Add `module "cloud_run_teaching_sync_job"` in `infra/main.tf`: the
      `cloud-run-job` module again, named `teaching-sync`, the admin
      image with `ADMIN_ACTION=sync-teaching` fixed in its env, the core
      database settings and `TEACHING_GCS_BUCKET`. It runs as the admin
      job's identity, mounting only `CORE_DB_PASSWORD` and `JWT_SECRET`
      of that identity's secrets.

- [x] Grant, in `infra/runtime-identities.tf`: the admin identity
      `roles/storage.objectViewer` on the teaching bucket, as the
      backend has; and `content-sync`, on the sync job alone,
      `roles/run.invoker` and `roles/run.viewer`. Google's role
      reference lists `invoker` as `run.instances.invoke`,
      `run.jobs.run` and `run.routes.invoke`, with no
      `runWithOverrides`, and its job guide gives `invoker` for
      starting a job from gcloud. No run role carries
      `run.executions.get`, which `gcloud run jobs execute --wait` needs
      to watch the execution end, so `viewer` is added on that job:
      read-only, and the job's env names its secrets without holding
      them. Whether `viewer` is enough for `--wait` is checked by the
      trial run below. Sources:
      [Cloud Run roles](https://docs.cloud.google.com/iam/docs/roles-permissions/run),
      [executing jobs](https://docs.cloud.google.com/run/docs/execute/jobs).

      Lands on its own, before anything uses the job: Terraform applies
      on merge, and a `deploy.yml` step naming a job Terraform has not
      made yet would fail the deploy.

## Phase 3: The pipeline starts the job

- [ ] Point the job at each build in `.github/workflows/deploy.yml`,
      with a `gcloud run jobs update quill-teaching-sync-<env> --image`
      step beside the transcode and caption ones, using the admin image.
      The admin job's own image is set by `run-migrations.sh`, so
      without this the sync job would run whatever image it was last
      given.

- [ ] Replace the "Trigger backend sync" step in
      `.github/workflows/teaching-pipeline.yml` with a script under
      `.github/scripts/teaching-pipeline/`, with its `.bats`, that runs
      `gcloud run jobs execute quill-teaching-sync-app --wait`. The
      project is the one in the service account's email, so the
      teaching repositories need no new secret.

- [ ] Rework "Capture the sync response". The HTTP body is gone, and
      reading the job's log from GitHub would need `logging.viewer`,
      which is project-wide. So the Slack failure notice names the
      execution and says the rejected banks are in its log, rather
      than quoting them.

- [ ] Run the pipeline from one teaching repository with one module
      changed, and confirm the bank updates. Then with a deliberately
      broken bank, and confirm the run fails and Slack names the
      execution.

## Phase 4: Remove the route and the secrets

- [ ] Remove `POST /api/ci/teaching/sync` from
      `backend/app/features/teaching/ci_router.py` and its entry in
      `PUBLIC` in `backend/tests/every_route_is_guarded_test.py`. This is
      a breaking API change: CI's `api_schema_diff` flags it, so add the
      decision file with `backend/scripts/new_compat_decision.py`
      (`forces_reload: false`, since no browser calls it) and approve it
      in `api-breaking-change-review`. Lands only after Phase 3 is live
      in every teaching repository, or a pipeline run between the two
      would fail.

- [ ] Delete `BACKEND_SYNC_TOKEN` and `BACKEND_SYNC_URL` wherever they
      are held: the teaching repositories, and the organisation if they
      are organisation secrets. Check `gh secret list` for each, and the
      organisation's list, before and after.

## Phase 5: One guard for the three callbacks

- [ ] Superseded on 2026-10-17 by
      `2026-10-17-job-callbacks-off-the-internet-plan.md`, which replaces
      the shared token with the jobs' own identity and gives the three
      routes one guard, `require_job_identity`, that
      `every_route_is_guarded_test.py` recognises. Its Phase 5 also
      depends on Phase 4 here: the `/api/ci/` prefix is refused at the
      load balancer only once the sync route is gone.

## Decisions

- **The job, not a narrower token** - GitHub could keep a token scoped
  to the sync alone, but it would still be a credential GitHub holds.
  Starting the job needs only the Workload Identity provider and a
  service account email, which are worth nothing to whoever reads them.

- **`TEACHING_SYNC_TOKEN` stays for the callbacks** - its other callers
  are GCP jobs reading it from Secret Manager, which is where the rule
  says a secret belongs. Replacing it with Cloud Run's own identity
  tokens is a separate change with no GitHub exposure to remove, now
  planned in `2026-10-17-job-callbacks-off-the-internet-plan.md`.
