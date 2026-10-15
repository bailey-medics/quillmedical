# Migrations squash plan

The core DB has built up 94 migrations since the
first squash on 2026-08-11.
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
backfill tests deleted, and, once that has deployed, `api-compatibility/`
reduced to a single fresh `init` file with its tooling intact. The one
deployed core database (`quill_core` on `quill-core-app`, project
`quill-medical-app`) **keeps its data**. The baseline is given the
revision id that database already records as its head, so on the next
deploy `alembic upgrade head` finds nothing to do, while a fresh
database builds the whole schema from the one file. Nothing in App
production is dropped, stamped or emptied, and the same method works
after go-live.

## Phase 1: Clear the way

- [x] Land every open branch that adds a migration or changes
      `backend/app/models.py` before starting. Each one has a
      `down_revision` pointing into the chain this plan deletes, so it
      breaks the moment this merges. List open pull requests touching
      `backend/alembic/versions/` or `models.py` and merge or park them.
      Checked on 2026-10-15: no open pull request touches either path.
      The ESLint stack in worktree 2 is frontend only and the record
      retention branch in worktree 4 has no migration, so neither blocks
      this. Worktree 2's stack goes on merging while this plan is built;
      Phase 7 checks what it changed before anything here merges.

- [x] Freeze migrations from here until this plan's pull request
      merges. The method depends on App production being at exactly the
      head this branch squashes; a migration landing in between would
      put the database one revision past a baseline that no longer
      knows it. In force from 2026-10-15.

- [x] Branch from a freshly fetched `main`, as `feature/migrations-squash`,
      and make the first push explicit (`git push -u origin ...`).
      Record the commit it branched from, which Phase 7 compares
      against. Built as a stack from the merge of pull request #1989
      (`af3cd5cb7`), the tip of `main` on 2026-10-15.

## Phase 2: Record what App production already has

- [x] Note the current head revision id, the one migration in
      `backend/alembic/versions/` that no other names as its
      `down_revision`. This is the id the baseline will carry. It is
      `ea2ae2e4854b` (record why a marked account was not emptied), the
      94th file in the chain, merged in pull request #1986 on
      2026-10-14.

- [x] Confirm App production is on that head. There was no way to ask:
      the admin job had `run-migrations` and nothing that reads, so
      this unit adds a `show-migration` action to
      `backend/scripts/admin_cli.py` (`alembic current`, verbose) and
      `just migrate-current app` (`just mc app`) to run it and print
      the execution's log. Phase 8 uses the same recipe. For now the
      answer comes from the deploy record instead: the deploy of
      pull request #1986, the one that carried `ea2ae2e4854b`, ran its
      "Run database migrations" step successfully on 2026-10-14, and
      the two deploys since were frontend only and skipped the step.
      So App production is at `ea2ae2e4854b`. Run `just mc app` once
      signed in to `gcloud` to see it directly; if it says anything
      else, the last deploy's migrations did not run, and that needs
      finding out before going on, since the baseline would otherwise
      claim schema the database lacks.

- [x] Dump the schema the current chain builds, before deleting
      anything. App production was created empty at the first squash
      and has only ever been changed by this chain, so a fresh database
      upgraded through it has the same schema, and the comparison needs
      no access to production. Added `just migrate-dump <file>`
      (`just md`): it brings up the `compose.migrate.yml` Postgres as
      this worktree's own project, runs `alembic upgrade head`, and
      writes `pg_dump --schema-only` to the file, with owners,
      privileges and pg_dump 18's per-run `\restrict` keys stripped so
      two dumps diff cleanly. The backend image has no `pg_dump`, so it
      runs in the Postgres container. The first dump is at
      `local/migrations-squash/before-ea2ae2e4854b.sql` under `just lp`,
      not in the repository: 41 tables, 3122 lines.

## Phase 3: Squash the migrations

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

- [ ] Give the baseline the head revision id noted in Phase 2, in place
      of the random one Alembic generated: change `revision` in the file
      and rename the file to match. `down_revision` stays `None`. This
      is the whole trick: App production's `alembic_version` row already
      holds that id, so Alembic sees it as up to date, and nobody has to
      touch the database by hand.

- [ ] Dump the schema the baseline builds, with the recipe from Phase 2,
      and diff it against the first dump. They must match. Autogenerate
      misses some things, among them check constraints, server default
      changes, enum values and index names left over from old renames,
      so any difference is the baseline being wrong, not the chain. Edit
      the baseline by hand until the diff is empty, because a baseline
      that differs would tell App production it is up to date when it
      is not.

- [ ] Check the baseline carries any rows the app needs, not just
      tables. The schema diff says nothing about data. Every `INSERT` in
      the chain was read while drafting this plan and all of them copy
      rows between tables (`organisations` to `org_unit`, grants to
      `practising_competency` and so on), so the expected answer is
      none, with reference data coming from `shared/` YAML at runtime.
      Re-check the migrations added since 2026-10-03, then confirm it by
      running `just e2e`, which seeds through `seed_ci.py` on top of the
      migrations exactly as CI does. A seed row found here goes into the
      baseline: App production has it already, but a fresh database
      would not.

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
      `test_user_competency_backfill.py`, plus any added since
      2026-10-03 (search `backend/tests/` for imports from
      `alembic.versions`). Read each before deleting it: if any test
      also checks behaviour that still exists (a rule the app enforces,
      not only the backfill that introduced it), move that test
      somewhere that outlives the migration instead. App production's
      data has already been through every backfill, so deleting them
      loses nothing. `test_alembic_check.py` and
      `test_check_migrations.py` stay; they guard every future migration.

- [ ] Update every place that names the first baseline. At least
      `docs/docs/backend/alembic-migration-safety.md` cites
      `878bc9300d4f`; search the repository for it and for any other
      deleted revision id quoted in `.github/instructions/`,
      `.claude/rules/` and `docs/docs/backend/`. Plans under
      `docs/docs/plans/` that cite old revisions are point-in-time
      records and are left alone. Add a short section to
      `alembic-migration-safety.md` describing this squash method, so
      the next one follows it.

## Phase 4: Let CI accept a migrations squash

- [ ] Give `check-migrations-unmodified.sh` a narrow, explicit exception
      rather than bypassing the check at merge. It refuses deletions by
      design, and is right to almost always. The exception: a pull
      request may delete merged migrations only when it deletes every
      one of them and adds exactly one replacement, whose
      `down_revision` is `None` and whose `revision` is the deleted
      head's id. That describes a squash and nothing else, so it cannot
      be used to quietly drop one migration. Add bats tests for both the
      accepted squash and a partial deletion that must still fail.

- [ ] Keep the exception after this lands. Decided on 2026-10-15: a
      squash that reuses the head's revision id is safe after go-live
      too, because it never touches the live data, so the next squash
      should need no CI change. The exception's own conditions (every
      file deleted, the head's id reused) are what stop it passing by
      accident.

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
      for a new database.

- [ ] Run `python backend/scripts/check_migrations.py --all` and the
      bats tests for the changed CI script.

## Phase 6: Local databases

- [ ] Check the dev stack's core database with `alembic current`. If it
      is at the old head, it is already at the baseline's id and needs
      nothing, exactly like App production. If it is behind, its
      `alembic_version` holds a revision that no longer exists and it
      fails with "Can't locate revision": drop and recreate it, then
      migrate. The `just migrate` and `just e2e` stacks need nothing:
      both use throwaway databases. If the e2e image cache keyed on
      `backend/alembic/**` holds a stale image, it rebuilds on its own.

## Phase 7: Check what merged to main meanwhile

Worktree 2's ESLint stack merges while this plan is built, so `main`
moves under every pull request here. Run this check before each one
is marked ready, and again immediately before it merges.

- [ ] Fetch `main` and list what landed since the commit recorded in
      Phase 1, with `git diff --name-only <branch point>..origin/main`.
      Check the list for `backend/alembic/versions/`,
      `backend/app/models.py`, `shared/` and `api-compatibility/`. The
      ESLint stack is frontend only, so the expected answer is none of
      them; anything else that merged is checked the same way.

- [ ] If a migration landed, stop: the head has moved, so redo Phase 2
      and the baseline steps of Phase 3 against the new head before
      going on. If `models.py` or `shared/` changed without a migration,
      re-run the schema dump and diff from Phase 3, since the models
      the baseline was generated from are no longer the ones on `main`.

- [ ] Rebase onto `origin/main` and check the rebase touched nothing
      this plan wrote: the baseline, the deleted tests, the Justfile
      recipe, the CI script and its bats tests. A frontend-only merge
      should rebase cleanly. Then run the targeted tests for anything
      the merges changed that this plan also relies on, and let CI run
      the rest.

## Phase 8: Merge and deploy

- [ ] Merge (a human does this). The deploy runs `alembic upgrade head`
      through the `quill-admin-app` job
      (`.github/scripts/deploy/run-migrations.sh`), which should find
      nothing to do. App production stays up throughout: there is no
      drop and no gap.

- [ ] Confirm `/api/health` reports the core DB available, `just mc app`
      reports the baseline as head, and the data is still there (sign
      in, open a question bank and a passport).

- [ ] Lift the migration freeze from Phase 1.

## Phase 9: Reset the API compatibility record

Done as its own pull request once the squash has deployed, so each
merge changes one thing and a problem in either is easy to place. Run
the Phase 7 check against it too: backend pull requests routinely add
decision files, so anything merged meanwhile may have added more.

- [ ] Delete every file in `api-compatibility/` (173 on 2026-10-15) and
      add one fresh `init` file (`generation: 1`, `forces_reload: false`,
      `change: "none"`). Check first that no existing file sets
      `forces_reload: true`; none did on 2026-10-03, in which case
      `compute_required_client_generation()` in
      `backend/app/api_compatibility.py` returns 1 before and after,
      and no client is told to reload. If one does, the fresh `init`
      carries the current generation instead of 1, so the required
      generation does not change. The files are a record
      of decisions made while nothing was live, and git keeps that record
      anyway. `new_compat_decision.py`, `validate-compat-files.sh` and
      the breaking-change gate in `.github/workflows/gate-breaking.yml`
      all stay: they are what will matter once the API has real
      clients.

- [ ] Give rule 5 of `validate-compat-files.sh`, which refuses deleted
      decision files outright, the same narrow exception as Phase 4: a
      pull request may delete merged decision files only when it deletes
      every one of them and adds exactly one `init` file at the current
      generation. Add bats tests for the accepted reset and for a
      partial deletion that must still fail, and keep the exception
      afterwards, for the same reason as the migration one.

- [ ] Merge (a human does this), then confirm the app loads in an open
      browser without being told to reload.

## Decisions

- **Keep App production's data, by reusing the head's revision id** -
  decided on 2026-10-15, replacing the earlier plan to drop
  `quill_core` and empty the buckets. Dropping was only ever needed
  because the database's recorded revision would no longer exist;
  giving the baseline that same id removes the reason. It was preferred
  over `alembic stamp --purge` to a new id because stamping needs a
  one-off step run against production through the admin job, while
  reusing the id needs nothing beyond the normal deploy.

- **Squash now, not later** - the method works after go-live, but now
  the migration freeze is easy to hold, a mistake costs nobody, and
  every backfill test written until then would otherwise be carried
  for good. CI speed is not the reason: the chain on an empty Postgres
  takes seconds.

- **Prove the schema from the chain, not from production** - the two
  dumps compared in Phase 3 both come from throwaway databases, so the
  check needs no access to App production. That holds because
  migrations are the only thing that has ever changed its schema;
  Phase 2's `just mc app` is the one look at production itself.
