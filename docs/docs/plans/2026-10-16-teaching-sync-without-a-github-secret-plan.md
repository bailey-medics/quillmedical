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

## Phase 2: The pipeline starts the job

- [ ] Check which service account each teaching repository passes as
      `GCP_SERVICE_ACCOUNT`, and that it may run `quill-admin-app` with
      an env override (`run.jobs.runWithOverrides`) in each environment
      the pipeline syncs to. `accessibility-review.yml` already does
      this, but possibly as a different account. Grant it in `infra/` if
      it is missing; Terraform applies on merge.

- [ ] Replace the "Trigger backend sync" step in
      `.github/workflows/teaching-pipeline.yml` with
      `gcloud run jobs execute quill-admin-app --update-env-vars
      "ADMIN_ACTION=sync-teaching" --wait`, with project and region from
      secrets as `accessibility-review.yml` takes them. `--wait` makes
      the step fail when the job fails.

- [ ] Rework "Capture the sync response" so the Slack failure notice
      still quotes the rejected banks. The HTTP body is gone, so read the
      execution's log with `gcloud logging read` filtered to that
      execution, truncated as now.

- [ ] Run the pipeline from one teaching repository against the dev
      environment first, with one module changed, and
      confirm the bank updates and a deliberately broken bank fails the
      run with its name in Slack.

## Phase 3: Remove the route and the secrets

- [ ] Remove `POST /api/ci/teaching/sync` from
      `backend/app/features/teaching/ci_router.py` and its entry in
      `PUBLIC` in `backend/tests/every_route_is_guarded_test.py`. This is
      a breaking API change: CI's `api_schema_diff` flags it, so add the
      decision file with `backend/scripts/new_compat_decision.py`
      (`forces_reload: false`, since no browser calls it) and approve it
      in `api-breaking-change-review`. Lands only after Phase 2 is live
      in every teaching repository, or a pipeline run between the two
      would fail.

- [ ] Delete `BACKEND_SYNC_TOKEN` and `BACKEND_SYNC_URL` wherever they
      are held: the teaching repositories, and the organisation if they
      are organisation secrets. Check `gh secret list` for each, and the
      organisation's list, before and after.

## Phase 4: One guard for the three callbacks

- [ ] Move the bearer check copied into `transcode-complete`,
      `caption-complete` and `poster-complete` into one dependency,
      `require_teaching_sync_token` in `backend/app/deps.py`. Teach
      `every_route_is_guarded_test.py` to accept it the way it accepts
      `get_current_user`, and drop the three routes from `PUBLIC`, so
      the test sees the check rather than trusting a reason string.

## Decisions

- **The job, not a narrower token** - GitHub could keep a token scoped
  to the sync alone, but it would still be a credential GitHub holds.
  Starting the job needs only the Workload Identity provider and a
  service account email, which are worth nothing to whoever reads them.

- **`TEACHING_SYNC_TOKEN` stays for the callbacks** - its other callers
  are GCP jobs reading it from Secret Manager, which is where the rule
  says a secret belongs. Replacing it with Cloud Run's own identity
  tokens is possible, but is a separate change with no GitHub exposure
  to remove.
