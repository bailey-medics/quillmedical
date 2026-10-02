# Docs review findings plan

On 2 October 2026 every page under `docs/docs/` was checked against the code.
The documentation was corrected in its own pull requests. This plan holds what
that review found wrong in the **code**, which the review did not touch: one
security setting, one recipe that fights Terraform, a layout mismatch, and a
list of small faults and comments that no longer match what the code does.

Each finding below was confirmed by opening the file named, unless it says
otherwise. The outcome wanted is that each is fixed or deliberately closed,
with the security setting first because it is the only one with a consequence
on the live site.

## Phase 1: Restrict CORS in production

- [x] Set `CORS_ORIGINS` for the backend Cloud Run service, in the `env_vars`
      block of `module "cloud_run_backend"` in `infra/main.tf`. Nothing sets
      it today, so production runs on the default in `backend/app/config.py`,
      which is `["*"]`. `backend/app/main.py` passes that to `CORSMiddleware`
      with `allow_credentials=True`, and with that pair Starlette answers any
      origin by naming it as allowed, with credentials.

      The value is the app's own origin, built the way `FRONTEND_URL` already
      is in the same block: `https://${var.lb_domains[0]}`. The setting is a
      `list[str]`, which pydantic-settings reads from the environment as
      JSON, so the variable has to be a JSON list, for example
      `jsonencode(["https://${var.lb_domains[0]}"])`.

      What limits the exposure today is that the session cookies are
      `SameSite=Lax`, so a browser does not send them from an unrelated
      site. But `quill-medical.com`, the landing site, is the same site as
      `app.quill-medical.com`, so a script running there could call the API
      as the logged-in user and read the reply.

      Done as written. The app calls the API from its own origin, which a
      browser never checks against CORS, and the public site makes no API
      calls, so no page of ours depends on the header being sent. Two tests
      in `backend/tests/test_config.py` pin the format: a JSON list in the
      environment is read as a list, and unset still falls back to `["*"]`.

- [x] Let Terraform change a Cloud Run service's settings at all. The
      apply for the step above failed on 2 October with `Error 409:
      Revision named 'quill-backend-app-00170-cip' with different
      configuration already exists`, so the variable was not set and
      production CORS stayed open.

      It was not the CORS change. Since 24 September
      `infra/modules/cloud-run/main.tf` had ignored `template[0].revision`,
      and an ignored field is still sent: Terraform returned the name of
      the revision the deploy had just made, with a different
      configuration, and Cloud Run refused. Every template change failed
      that way; this was the first environment variable since. The module
      no longer ignores the name, so each apply clears it and Cloud Run
      picks a new one. The cost is one spare revision per service per
      apply, which serves nothing because the deploy pins traffic.

      Phase 2 must not merge until this has applied and a deploy has run
      after it.

- [ ] After the Terraform apply and the next deploy, confirm on the live site
      that a request carrying `Origin: https://example.com` gets no
      `Access-Control-Allow-Origin` back, and that the app itself still works:
      log in, load a page that calls the API, and upload a lecture, which
      goes to Google Cloud Storage and has its own CORS policy on the bucket.
      `infra/` changes apply through `terraform.yml` on merge, so check that
      run first.

- [ ] `docs/docs/cybersecurity/index.md` already says production CORS is
      "explicitly configured via `CORS_ORIGINS`". Once this phase is live
      that sentence is true and needs no change.

## Phase 2: Refuse an unsafe CORS setting at startup

Lands after phase 1 is live. Merged alongside it, the backend could start
before Terraform has set the variable, and refuse to boot.

- [x] Add a validator to `Settings` in `backend/app/config.py` that raises
      when `BACKEND_ENV` is `production` and `CORS_ORIGINS` contains `"*"`.
      Phase 1 fixes today's value; this stops the next environment being
      built without one, which is how this happened. Development and the
      end-to-end stack keep the default, since everything there is served
      from one origin through Caddy.

      Only the backend service is given `BACKEND_ENV=production`. The admin,
      transcode and caption jobs leave it unset, so they are not caught by
      this. `compose.prod.cloud-run.yml` sets it too but is only ever built,
      never run; its comment listing `quill-medical.com` as an allowed
      origin was wrong and now points at `infra/main.tf`.

- [x] Add unit tests in `backend/tests/` for both directions: production
      with the wildcard is refused, production with a named origin and
      development with the wildcard are accepted. Run with
      `just ub -k "cors"`.

## Phase 3: Stop `just build-admin` overwriting Terraform's job settings

- [x] The `build-admin` recipe in the `Justfile` ends with
      `gcloud run jobs deploy "quill-admin-{{env}}"`, passing
      `--vpc-egress=private-ranges-only` and a full `--set-env-vars` and
      `--set-secrets`. Terraform owns that same job in `infra/main.tf`
      (`job_name = "admin"`), with `vpc_egress = "ALL_TRAFFIC"` and three
      `PASSPORT_*` variables the recipe does not pass. So running the recipe
      leaves the job with the wrong egress and without the passport
      variables until the next apply. The comment in `infra/main.tf` says
      `ALL_TRAFFIC` is what the deploy's in-VPC smoke test depends on, and
      the passport variables are what `delete-passport` reads.

      The fix is for the recipe to change the image and nothing else:
      `gcloud run jobs update "quill-admin-{{env}}" --image="$IMAGE"`, with
      the database lookup above it removed. `deploy.yml` already builds and
      pushes the admin image on every backend change, so the recipe is only
      for running tooling that has not been deployed yet.

- [x] Update `docs/docs/infrastructure/admin.md`, which describes the recipe
      as updating the Cloud Run Job, if the wording no longer fits.

      No change needed. The page says the recipe "updates the Cloud Run Job
      to use it", which is now exactly what it does, and its troubleshooting
      section already says Terraform creates the job.

## Phase 4: One value for the `sm` breakpoint

- [x] `frontend/src/theme.ts` sets `breakpoints.sm` to `"40em"`, the value
      `CLAUDE.md` names as the standard. Three build configurations set the
      PostCSS variable `mantine-breakpoint-sm` to `48em`:
      `frontend/postcss.config.cjs`, `frontend/.storybook/main.ts` and
      `frontend/public_pages/vite.config.ts`. So a CSS module using
      `$mantine-breakpoint-sm` switches layout at 768px while JavaScript
      using `theme.breakpoints.sm` switches at 640px.

      Check the other four breakpoints in those three files against
      `theme.ts` at the same time. Then decide which value is right before
      changing either: the CSS has been rendering at 48em, so moving it to
      40em changes how every responsive CSS module looks between 640px and
      768px, on the app and on the public site.

      Decided: 40em. The other four breakpoints already agreed. The move is
      much smaller than feared, because only one CSS module uses the
      variable at all: `PublicFooter.module.css`. Twelve others write
      `40em` out by hand, so they were already right. The footer therefore
      now stays in its desktop row down to 640px instead of stacking at
      768px, and nothing else moves. `ErrorMessage.module.css` wrote `48em`
      by hand for its icon size and is now `40em` too.

      The widths now live in one file, `frontend/src/breakpoints.json`,
      which `theme.ts` and all three build configurations read, so there is
      no second list to fall behind. `.storybook/main.ts` needs
      `with { type: "json" }` on that import: Storybook loads it through
      Node's own loader, which refuses a JSON import without it.

- [x] Add a unit test that fails when the two disagree, reading the
      breakpoints from `theme.ts` and from `postcss.config.cjs`, so the next
      change to one cannot leave the other behind. Run with `just uf` on
      that test file.

      `frontend/src/breakpoints.test.ts`. It also checks that the Storybook
      and public site configurations read the shared file instead of
      listing widths of their own.

- [ ] Run `just sbtci` on its own, never alongside `just e2e`, and look at
      the pages by hand at 700px wide. The automated checks cannot say
      whether a layout that moved still reads well.

      Still open. `just sbtci` was run twice on 2 October and no story
      failed an assertion, but both runs ended red: two suites in the first
      and three different ones in the second timed out loading their page,
      with the machine's load average above 40. That is the saturation
      `CLAUDE.md` warns of, not a finding, so the heavy CI tier is the
      result to trust. The look by hand at 700px has not been done; the
      public site's footer is the one thing to look at.

## Phase 5: Small code faults

One pull request, since each is a line or two.

- [x] **A missing `f` prefix.** `backend/scripts/new_compat_decision.py`,
      in `print_success_message`, prints the literal text `{generation}` in
      "Once merged, required_client_generation will become {generation}."

- [x] **A stale Renovate pin.** `renovate.json` holds Docker `python` to
      `<3.14`, with the note "Revisit Q3 2026". `backend/Dockerfile` is
      already `python:3.14-slim`, so the rule now only blocks updates.
      Remove it, or change it to hold below 3.15.

      Removed. `renovate.json` merges nothing on its own, so a 3.15 image
      arrives as a pull request to read like any other, and a new hold
      would only go stale the same way.

- [x] **A recipe name that does not exist.** The `prune-branches` recipe in
      the `Justfile` tells the reader to run `just clone-teaching`. The
      recipe is `initial-install`.

- [x] **An old job name.** `scripts/run-github-actions-locally.sh` calls the
      job `python-styling` in three places. `ci.yml` names it
      `Python pre-commit`, from the `python_checks` job.

      Renamed to `python-pre-commit`, in the script and in
      `scripts/README.md`. The script has a larger fault this does not fix:
      it runs `.github/workflows/non-main.yml` and `main.yml`, and neither
      file exists, so it cannot run at all. Repairing or deleting it is a
      decision for a person; see Decisions.

- [x] **A mock user from the old permission model.**
      `frontend/.storybook/preview.tsx` gives the mock user
      `system_permissions: "superadmin"`, a field that no longer exists, and
      no `platform_role`. A story that depends on being an operator is
      therefore not testing what it appears to.

- [x] **An unpinned image.** `compose.ci.yml` uses `caddy:2-alpine`.
      `compose.dev.yml` and `frontend/Dockerfile` pin the same image by
      digest. Pin it, so the end-to-end stack cannot change under a pull
      request that touched nothing.

- [x] **The public site deploys under an environment called `teaching`.**
      The job in `.github/workflows/public-site.yml` is `deploy-teaching`
      with `environment: name: teaching`, while it reads the `GCP_APP_*`
      secrets and `infra/github/environments.tf` manages only `app`. Its
      header comment says both "the app project, not teaching" and "the
      teaching project's landing bucket". Before renaming, check where the
      secrets it reads are scoped: if they are only reachable through the
      `teaching` environment, moving the job to `app` needs them there
      first.

      Moved to `app`. Checked on 2 October: the `teaching` environment
      holds no secrets at all, so the job had been reading the
      repository-level copies, and `app` holds all three it needs. Google
      Cloud trusts the job by repository and branch
      (`bailey-medics/quillmedical@refs/heads/main`), not by environment
      name, so the rename does not change who it can sign in as. The job is
      now `deploy` and the notifier `notify-failure`. The Slack channel is
      still called `teaching` and is left alone.

## Phase 6: Comments and docstrings that contradict the code

Comments only, so no behaviour changes and no tests. They matter because
they are what the next reader, human or model, takes as the reason.

- [x] `backend/app/main.py`
    - the docstring of `_require_shared_org_with_patient` says
      `check_user_patient_access` returns `True` for any admin. That
      shortcut was removed.
    - the docstring of `update_my_competencies` says 403 when the caller
      lacks `manage_users`. The code checks `platform_role`.
    - the docstring of `register` says a password needs 6 characters. The
      code enforces 8.

- [x] `backend/app/security.py` – the docstring of the TOTP check says it
      allows one step of clock drift, "default pyotp behavior". The call
      passes no `valid_window`, so only the current step is accepted. Decide
      which is wanted: if drift tolerance is, this is a code change and not
      a comment.

      The docstring now says what the code does: only the current step is
      accepted. Whether to allow drift is left open, because it changes
      who can log in; see Decisions.

- [x] `backend/app/cbac/competencies.py` – a comment still names
      `feature-admin.yaml`, and a docstring says "defined in more than one
      org_unit" where it means more than one file.

- [x] `shared/competency-definitions/clinical.yaml` – the header says
      `resolve_user_competencies()` is how a user's final list is worked
      out. A user now holds what their `user_competency` rows say.

- [x] `backend/app/models.py` – the docstring on `org_unit_member` still
      explains the name `site_member`, and the one on `OrgUnitLink` says
      both ends point at `sites`.

- [x] `frontend/src/components/tables/DataTable.tsx` says
      `theme.breakpoints.sm` is 768px. It is 640px. Found while doing
      phase 4. Left alone here: pull request #1393, open on 2 October,
      already deletes that comment, and a second edit would only conflict.

- [x] `frontend/src/components/profile-pic/ProfilePic.tsx` gives the
      gradient index range as 0 to 35. There are 30 gradients.

- [x] `backend/tests/test_alembic_check.py` and
      `backend/scripts/remove_avatar_gradients.py` tell the reader to run
      them with `docker exec quill_backend`, the pattern `CLAUDE.md` forbids.

      The script now says `just eb`. The test file says the truth, which is
      that only the `alembic_drift_check` CI job runs it: no recipe gives
      those tests a migrated Postgres locally.

- [x] `.claude/hooks/session-start.sh` runs `pre-commit install`, which
      `CLAUDE.md` says never to do. It only warns on failure, so it is
      harmless where `core.hooksPath` is set, but the two disagree.

      The hook is right and the rule was too broad. A web session is a
      fresh clone where nobody has run `just initialise-repo`, so
      `core.hooksPath` is unset and `pre-commit install` is the only thing
      that gives it a hook. The hook's comment and the rule in `CLAUDE.md`
      now both say so. No behaviour changed.

## Phase 7: References to names that have moved

- [x] **The Alembic review plan was renamed** to
      `2026-08-09-alembic-review-and-revisions-plan.md`. Three places still
      use the old name: the nav in `docs/mkdocs.yml`, the list in
      `docs/docs/plans/index.md`, and a comment at the top of
      `.github/scripts/deploy/deploy-tagged.sh`. The first two are broken
      links on the docs site.

      Three more turned up and are fixed with them: two links in
      `2026-08-11-migrations-squash-plan.md` and a path in `todo.md`. The
      two in `docs/docs/backend/alembic-migration-safety.md` are left to
      pull request #1388, open on 2 October, which already fixes them.

- [x] **Two CI job names in the backend rules are out of date.**
      `.github/instructions/backend.instructions.md` names
      `heavy_db_destructive_migration_check` and says
      `api_breaking_change_check` is in `ci.yml`. The jobs are
      `db_destructive_migration_check` and `api_schema_diff`, both in
      `.github/workflows/gate-breaking.yml`. Edit the `.github/` file, which
      is the source of truth, then run `/sync-copilot-config` to carry it to
      `.claude/rules/backend.md`.

      The same two edits were made to `.claude/rules/backend.md` by hand,
      and that one entry's hashes updated in `.claude/sync-manifest.json`,
      which is what the sync would have written. The full sync was not run,
      so that this unit carries nothing but these two names.

## Phase 8: Decide how conversation access is gated

A decision first, then code. Not urgent: these routes only exist when
clinical services are on, and the live deployment has them off.

- [ ] Decide whether reading a conversation should require a competency.
      Reaching a patient record requires one on every route, through
      `check_user_patient_access` in `backend/app/organisations.py`. The
      `/conversations` routes in `backend/app/main.py` carry only
      `DEP_REQUIRE_CLINICAL`, and admit on a shared organisation or an
      external access grant, with no competency check. Nothing found in the
      code, the comments or the plans says whether that difference is
      intended.

- [ ] If a competency is wanted, add it and its tests, following
      `backend/tests/test_patient_access_competency.py`. If the difference
      is intended, say so in a comment beside the conversation routes, so
      the next review does not raise it again.

## Decisions

- **API security headers are not here** – they were found by the same
  review and already have their own plan,
  `2026-10-02-api-security-headers-plan.md`, which has landed.

- **CORS is two phases, not one** – the Terraform value has to be live
  before the backend starts refusing a wildcard, or a deploy that lands
  first takes the service down. Phase 2 exists so the next environment
  cannot repeat the omission.

- **Whether a login code may be one step out is not decided** –
  `verify_totp_code` accepts only the current 30-second step, though its
  docstring claimed one step of drift either way until phase 6 corrected
  it. RFC 6238, section 5.2, recommends allowing at most one step for
  network delay, and most services do, since a code typed at second 29
  otherwise fails. It would be `totp.verify(code, valid_window=1)`. Left
  for a person because it widens what logs somebody in, and a code would
  then stay valid for up to 90 seconds, so it wants a check that a used
  code cannot be replayed.

- **`scripts/run-github-actions-locally.sh` cannot run** – it points `act`
  at `non-main.yml` and `main.yml`, which no longer exist; the workflows
  are `ci.yml` and `deploy.yml`. Phase 5 fixed the one job name the review
  reported and left the rest, because whether to repair the script or
  delete it depends on whether anybody still wants to run Actions locally.

- **Reported by the review and not confirmed** – these came back from the
  checkers and were not opened again before this plan was written, so
  confirm each before acting on it:

    - `_get_user_org_id` in `backend/app/features/teaching/router.py` picks
      an arbitrary organisation when the caller belongs to two. Its own
      docstring is said to call this a known bug.
    - `backend/app/ehrbase_client.py` builds AQL with an f-string around an
      `ehr_id`, and hard-codes the composition `territory` as `"US"`.
    - The three `question-bank-*` recipes in the `Justfile` clone into
      `question-bank/`, a directory nothing mounts since content moved to
      `teaching-repos/`.
    - `dev-scripts/sync-teaching-data.sh` still publishes draft items after
      a sync, though sync now writes every item as published.
    - `just worktree-create` names the new directory after the worktree it
      is run from, so run from `quillmedical-3` it makes `quillmedical-3-2`.
    - Stale comments in `terraform.yml`, `deploy.yml` and `infra/main.tf`
      that still speak of teaching, staging and production, and
      `infra/variables.tf` still accepting `prod` and `staging` as
      environment names.
