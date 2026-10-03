# Second migrations squash plan

The core DB has built up 69 migrations since the
[first squash](2026-08-11-migrations-squash-plan.md) on 2026-08-11.
About 39 of them move data rather than shape the schema: site staff to
members, organisations and sites to org units, `system_permissions` to
`platform_role`, grants into practising competencies. Each was written
for data that does not exist, since nothing is live yet, and about a
dozen `backend/tests/` files exist only to prove those backfills work.
Running the chain is cheap, so CI speed is a small gain. The real cost
is that the schema can only be understood by replaying history, and
every pass through the test suite carries tests for data paths no
database will ever take.

The outcome is one baseline migration that is both base and head, the
backfill tests deleted, `api-compatibility/` reduced to a single fresh
`init` file with its tooling intact, and the one deployed core database
(`quill_core` on `quill-core-app`, project `quill-medical-app`)
rebuilt empty. The GCP project and its infrastructure stay as they are.
This is only safe while there is no live data; once there is, a squash
means `alembic stamp` against the live database, never a drop.

## Phase 1: Clear the way

- [ ] Confirm, with the user, that nothing in `quill-medical-app` must
      be kept. The app environment is the only one left (teaching,
      staging and production were retired under
      [environment isolation](2026-09-18-environment-isolation-and-iap-plan.md)),
      and `enable_fhir = false` in `infra/environments/app/terraform.tfvars`,
      so `quill_core` is the only database to reset. Anything in it
      (test accounts, question banks, CPD records, passport uploads) is
      lost, and the objects in the teaching-video and passport buckets
      are orphaned by it. Decide here whether the buckets are emptied
      too or left to sit unreferenced.

- [ ] Check that no other open branch adds a migration. Every such
      branch has a `down_revision` pointing into the chain this plan
      deletes, so it breaks the moment this merges. Either land those
      first or plan to regenerate their migration on top of the
      baseline straight after. List open pull requests touching
      `backend/alembic/versions/`.

- [ ] Branch from a freshly fetched `main`, as `feature/second-migrations-squash`,
      and make the first push explicit (`git push -u origin ...`).

## Phase 2: Squash the migrations

- [ ] Delete every file in `backend/alembic/versions/`, including the
      first baseline `878bc9300d4f`.

- [ ] Generate the new baseline against an empty database.
      `just migrate "initial baseline schema"` already does this correctly:
      it brings up a throwaway Postgres from `compose.migrate.yml`,
      upgrades to head (now nothing), autogenerates against this
      worktree's models and refuses an empty result. Keep the generated
      `downgrade()`, which drops everything back to `base`; with
      nothing below the baseline that is the complete reverse. Give it
      a real module docstring, with no em dash, since a merged
      migration docstring is frozen.

- [ ] Check the baseline carries any rows the app needs, not just
      tables. `alembic check` proves the schema matches the models but
      says nothing about data. Every `INSERT` in the current chain was
      read while drafting this plan and all of them copy rows between
      tables (`organisations` to `org_unit`, grants to
      `practising_competency` and so on), so the expected answer is
      none, with reference data coming from `shared/` YAML at runtime.
      Confirm it by running `just e2e`, which seeds through
      `seed_ci.py` on top of the migrations exactly as CI does.

- [ ] Delete the tests whose only subject was a deleted migration.
      These import a migration module or pin a revision id:
      `test_answer_tag_backfill.py`, `test_close_removal_rows.py`,
      `test_drop_granted.py`, `test_drop_professional_registrations.py`,
      `test_drop_resolved_tags.py`, `test_manage_teaching_migration.py`,
      `test_organisation_passport_grants_do_not_lapse.py`,
      `test_practising_competency_backfill.py`,
      `test_profession_seed_backfill.py`,
      `test_professional_registration_backfill.py`,
      `test_rename_external_assessor.py` and
      `test_user_competency_backfill.py`. Read each before deleting it:
      if any test also checks behaviour that still exists (a rule the
      app enforces, not only the backfill that introduced it), move
      that test somewhere that outlives the migration instead.
      `test_alembic_check.py` and `test_check_migrations.py` stay; they
      guard every future migration.

- [ ] Update every place that names the first baseline. At least
      `docs/docs/backend/alembic-migration-safety.md` cites
      `878bc9300d4f`; search the repository for it and for any other
      deleted revision id quoted in `.github/instructions/`,
      `.claude/rules/` and `docs/docs/backend/`. Plans under
      `docs/docs/plans/` that cite old revisions are point-in-time
      records and are left alone.

## Phase 3: Reset the API compatibility record

- [ ] Delete the 119 files in `api-compatibility/` and add one fresh
      `init` file (`generation: 1`, `forces_reload: false`,
      `change: "none"`). Not one existing file sets
      `forces_reload: true`, so `compute_required_client_generation()`
      in `backend/app/api_compatibility.py` returns 1 before and after,
      and no client is told to reload. The files are a record of
      decisions made while nothing was live, and git keeps that record
      anyway. `new_compat_decision.py`, `validate-compat-files.sh` and
      the breaking-change gate in `.github/workflows/gate-breaking.yml`
      all stay: they are what will matter once the API has real
      clients.

- [ ] Check what `validate-compat-files.sh` makes of the deletions.
      Rule 5 refuses deleted decision files outright. Handle it in
      Phase 4 together with the migration check, the same way.

## Phase 4: Let CI accept a squash, once

- [ ] Give `check-migrations-unmodified.sh` and rule 5 of
      `validate-compat-files.sh` a narrow, explicit exception rather
      than bypassing either check at merge. Both refuse deletions by
      design, and both are right to almost always. The exception: a
      pull request may delete merged files only when it deletes every
      one of them and adds exactly one replacement (for migrations,
      one file whose `down_revision` is `None`; for decision files, one
      `init` file at generation 1). That describes a squash and nothing
      else, so it cannot be used to quietly drop one migration. Add
      bats tests for both the accepted squash and a partial deletion
      that must still fail.

- [ ] Decide whether the exception stays or is removed in a follow-up
      pull request once this lands. Leaving it means the next pre-launch
      squash needs no CI change; removing it means a squash after go-live
      cannot pass by accident. Recommended: remove it, since after
      go-live the right tool is `alembic stamp`, not deletion.

- [ ] Confirm the destructive-migration gate does not trip. It only
      inspects migrations added on a pull request, so it will read the
      new baseline; a baseline contains only `create_table` calls, so
      it should pass without a marker.

## Phase 5: Verify locally

- [ ] Run `just ub`, the full backend suite. This is one of the cases
      `CLAUDE.md` allows a full local run for: the change deletes tests
      and touches the migration chain everything else sits on. The
      unit tests build their schema with `create_all()` on SQLite, so
      apart from the deleted files they should pass unchanged.

- [ ] Run `just e2e`, which migrates a fresh `compose.ci.yml` stack
      from the new baseline and seeds it. This proves the deploy path
      in miniature.

- [ ] Run `python backend/scripts/check_migrations.py --all` and the
      bats tests for the two changed CI scripts.

## Phase 6: Reset local databases

- [ ] Drop and recreate the dev stack's core database, then migrate to
      the new head. Its `alembic_version` holds a revision that no
      longer exists, so it fails with "Can't locate revision" rather
      than upgrading. The `just migrate` and `just e2e` stacks need
      nothing: both use throwaway databases. If the e2e image cache
      keyed on `backend/alembic/**` holds a stale image, it rebuilds on
      its own.

## Phase 7: Reset the deployed database

Do this after the pull request is approved and immediately before it
merges, because the deploy on merge runs `alembic upgrade head` through
the `quill-admin-app` job (`.github/scripts/deploy/run-migrations.sh`),
and that fails against a database stamped with a deleted revision.
The app is unusable in the gap between the drop and the deploy, which
is acceptable with nobody relying on it.

- [ ] Drop and recreate `quill_core` on `quill-core-app` with the Cloud
      SQL control plane, which works despite the private-only IP. The
      instance, the `quill` user and its Secret Manager password are
      untouched, so no Terraform change is needed:

      ```sh
      gcloud sql databases delete quill_core \
        --instance=quill-core-app --project=quill-medical-app
      gcloud sql databases create quill_core \
        --instance=quill-core-app --project=quill-medical-app
      ```

      Confirm the instance name with `gcloud sql instances list` first;
      the module builds it as `quill-core-{environment}`. The first
      squash replaced the whole instance to rename it; there is no
      rename this time, so replacing it would add risk for nothing.

- [ ] Empty the buckets, if Phase 1 decided to.

- [ ] Merge (a human does this), let the deploy run, then confirm
      `/api/health` reports the core DB available and `alembic current`
      through the admin job reports the new baseline as head.

- [ ] Recreate the accounts needed to use the app, with the
      create-user recipes.

## Decisions

- **Squash now, not later** – this is the last point a squash can drop
  the database. After go-live it can only re-stamp, and every backfill
  test written until then is carried for good. CI speed is not the
  reason: 69 migrations on an empty Postgres take seconds.

- **Reset the database, not the GCP project** – starting the project
  afresh was considered and rejected. It would rebuild Workload
  Identity, IAP, DNS, certificates and secrets to clear one database,
  and dropping `quill_core` does the same job.
