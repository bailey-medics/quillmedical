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

## Phase 3: Let CI accept a migrations squash

Lands before the squash, as its own pull request, because the
`DB migration immutability check` runs on the squash pull request and
would refuse it otherwise.

- [x] Give `check-migrations-unmodified.sh` a narrow, explicit exception
      rather than bypassing the check at merge. It refuses deletions by
      design, and is right to almost always. The exception: a pull
      request may delete merged migrations only when it deletes every
      one of them and adds exactly one replacement, whose
      `down_revision` is `None` and whose `revision` is the deleted
      head's id. That describes a squash and nothing else, so it cannot
      be used to quietly drop one migration. Done as `is_squash` in the
      script, with `head_revision_at` working the old head out from the
      merge base. Two things found while writing it: the chain at the
      merge base must hold two or more migrations, because a lone
      baseline moved to a new filename would otherwise pass as a squash
      of itself; and the diff is taken with `--no-renames`, because git
      pairs the new baseline with whichever deleted migration it
      resembles (a baseline looks a lot like the old one) and would
      report a rename instead of a delete and an add. Bats tests cover
      the accepted squash, a new id, a `down_revision`, a partial
      deletion, two added files and the chain of one. The rule is
      written into `.github/instructions/backend.instructions.md`,
      `.claude/rules/backend.md` and the migration safety page.

- [x] Make the exception temporary. Decided by Mark on 2026-10-15: it
      is closed again once the squash has landed, in the plan's last
      phase, so the immutability check goes back to refusing every
      deletion. A future squash opens its own exception, in its own
      pull request, and closes it the same way. That keeps the check
      as strict as it was for everything except the one pull request
      that needs otherwise.

- [x] Confirm the destructive-migration gate does not trip. It only
      inspects migrations added on a pull request, and
      `check_migrations.py` reads `upgrade()` alone, so the baseline's
      `downgrade()`, which drops every table, is not looked at. A
      baseline's `upgrade()` contains only `create_table` calls, so it
      passes without a marker. Confirmed on the squash pull request
      once it opens.

## Phase 4: Squash the migrations

- [x] Delete every file in `backend/alembic/versions/`, including the
      first baseline `878bc9300d4f`. `git rm` took the empty directory
      with it, and `just migrate` then failed listing it, so the recipe
      now makes the directory and tolerates an empty chain.

- [x] Generate the new baseline against an empty database.
      `just migrate "initial baseline schema"` already does this correctly:
      it brings up a throwaway Postgres from `compose.migrate.yml`,
      upgrades to head (now nothing), autogenerates against this
      worktree's models and refuses an empty result. Keep the generated
      `downgrade()`, which drops everything back to `base`; with
      nothing below the baseline that is the complete reverse. Give it
      a real module docstring, with no em dash, since a merged
      migration docstring is frozen. Forty tables, 744 lines.

- [x] Give the baseline the head revision id noted in Phase 2, in place
      of the random one Alembic generated: change `revision` in the file
      and rename the file to match. `down_revision` stays `None`. This
      is the whole trick: App production's `alembic_version` row already
      holds that id, so Alembic sees it as up to date, and nobody has to
      touch the database by hand. The file is
      `2026_10_15_1043-ea2ae2e4854b_initial_baseline_schema.py`.

- [x] Dump the schema the baseline builds, with the recipe from Phase 2,
      and compare it with the first dump. A plain `diff` ran to 550
      lines, nearly all of it history rather than schema: column order,
      the names Postgres gives NOT NULL constraints, and sequence names
      a renamed table keeps (`organisation_features_id_seq` behind
      `org_unit_feature`). None of those can be reproduced by a
      baseline and none affects a migration or the app. So the
      comparison is `backend/scripts/compare_schema_dumps.py`, added
      here with its tests, which reads past those three and reports
      everything else. It found one real difference: eighteen foreign
      keys whose names Postgres had kept through table renames
      (`sites_parent_id_fkey` on `org_unit`, `fk_site_member_org_unit_id_sites`
      on `org_unit_member` and so on), where the autogenerated baseline
      gave them today's default names. A later migration that drops or
      alters one by name would then work on production and fail on a
      fresh database, or the reverse, so the baseline names all eighteen
      as production has them, with a comment saying why. The models
      leave them unnamed and autogenerate compares an unnamed foreign
      key by its columns, so the drift check is unaffected: run against
      a database built from the baseline through `compose.migrate.yml`,
      `pytest -m migration` passed. The comparer now reports no
      differences.

- [x] Check the baseline carries any rows the app needs, not just
      tables. The schema diff says nothing about data. Every `INSERT` in
      the chain was read while drafting this plan and all of them copy
      rows between tables (`organisations` to `org_unit`, grants to
      `practising_competency` and so on), so the expected answer is
      none, with reference data coming from `shared/` YAML at runtime.
      The migrations added since 2026-10-03 were read the same way: the
      three with an `INSERT` (`8c1f4e2a9b37`, `13369e6db053` and
      `3d7a91c5e6f2`) all `INSERT ... SELECT` from rows that already
      exist, so they write nothing a fresh database needs. Confirmed by
      `just e2e` in Phase 5.

- [x] Delete the tests whose only subject was a deleted migration.
      These import a migration module or pin a revision id:
      `answer_tag_backfill_test.py`, `close_removal_rows_test.py`,
      `drop_granted_test.py`, `drop_professional_registrations_test.py`,
      `drop_resolved_tags_test.py`, `manage_teaching_migration_test.py`,
      `organisation_passport_grants_do_not_lapse_test.py`,
      `practising_competency_backfill_test.py`,
      `profession_seed_backfill_test.py`,
      `professional_registration_backfill_test.py`,
      `rename_external_assessor_test.py` and
      `user_competency_backfill_test.py`, plus three added since
      2026-10-03: `one_attempt_in_progress_migration_test.py`,
      `teaching_competency_split_migration_test.py` and
      `teaching_place_migration_test.py`. Each was read before deleting:
      every one steps the chain back to a revision and forward again,
      or reads a migration file, and
      `practising_competency_backfill_test.py`, the one that looked as
      if it tested live code, pins what the migration's SQL had to
      reproduce and reads the migration's source for the professions
      it names. Nothing moved elsewhere. App production's data has
      already been through every backfill, so deleting them loses
      nothing. `alembic_check_test.py` and `check_migrations_test.py`
      stay; they guard every future migration, and the first now
      carries the command for running migration tests locally that
      `user_competency_backfill_test.py` used to.

- [x] Update every place that names the first baseline.
      `.github/instructions/backend.instructions.md`,
      `.claude/rules/backend.md` and
      `docs/docs/backend/alembic-migration-safety.md` cited
      `878bc9300d4f`; all three now name both squashes, and the safety
      page gains a "Squashing the chain" section with the method so the
      next one follows it. `docs/docs/llm/rules/` is a generated copy
      and is left alone. Plans under `docs/docs/plans/` that cite old
      revisions are point-in-time records and are left alone.

## Phase 5: Verify locally

- [x] Run `just ub`, the full backend suite. This is one of the cases
      `CLAUDE.md` allows a full local run for: the change deletes tests
      and touches the migration chain everything else sits on. The
      unit tests build their schema with `create_all()` on SQLite, so
      apart from the deleted files they should pass unchanged. Passed
      with nothing failing, the new `compare_schema_dumps_test.py`
      included.

- [x] Run `just e2e`, which migrates a fresh `compose.ci.yml` stack
      from the new baseline and seeds it. This proves the deploy path
      for a new database. The stack migrated straight to
      `ea2ae2e4854b` and seeded. The first run showed 38 failures, 37
      of them WebKit not being installed on this machine and one a
      Chromium slide click that timed out while `just ub` was running
      beside it; `just e2e --project=chromium` on its own then passed
      all 43. CI runs every browser.

- [x] Run `python backend/scripts/check_migrations.py --all` (passes on
      the one-file chain) and the bats tests for the changed CI script
      (579 passed, in Phase 3). The drift check also ran against a
      database built from the baseline, through `compose.migrate.yml`,
      and passed.

## Phase 6: Local databases

- [x] Check the dev stack's core database with `alembic current`. If it
      is at the old head, it is already at the baseline's id and needs
      nothing, exactly like App production. If it is behind, its
      `alembic_version` holds a revision that no longer exists and it
      fails with "Can't locate revision": drop and recreate it, then
      migrate. The `just migrate` and `just e2e` stacks need nothing:
      both use throwaway databases. If the e2e image cache keyed on
      `backend/alembic/**` holds a stale image, it rebuilds on its own.
      On 2026-10-15 the dev stack was not running, so this could not be
      read. `just sa` migrates on every start, so the first start after
      this merges answers it: a clean start means the database was at
      the old head; "Can't locate revision" means it was behind, and
      the database is dropped and recreated.

## Phase 7: Check what merged to main meanwhile

Worktree 2's ESLint stack merges while this plan is built, so `main`
moves under every pull request here. Run this check before each one
is marked ready, and again immediately before it merges.

- [x] Fetch `main` and list what landed since the commit recorded in
      Phase 1, with `git diff --name-only <branch point>..origin/main`.
      Check the list for `backend/alembic/versions/`,
      `backend/app/models.py`, `shared/` and `api-compatibility/`. The
      ESLint stack is frontend only, so the expected answer is none of
      them; anything else that merged is checked the same way. Run on
      2026-10-15 after the squash pull request opened: nothing had
      merged since `af3cd5cb7`. Repeat before merging.

- [x] If a migration landed, stop: the head has moved, so redo Phase 2
      and the baseline steps of Phase 4 against the new head before
      going on. If `models.py` or `shared/` changed without a migration,
      re-run the schema dump and diff from Phase 4, since the models
      the baseline was generated from are no longer the ones on `main`.
      Nothing had landed, so nothing to redo; the step stands for the
      repeat.

- [x] Rebase onto `origin/main` and check the rebase touched nothing
      this plan wrote: the baseline, the deleted tests, the Justfile
      recipe, the CI script and its bats tests. A frontend-only merge
      should rebase cleanly. Then run the targeted tests for anything
      the merges changed that this plan also relies on, and let CI run
      the rest. `just stack-submit` rebases the stack on every run and
      found nothing to replay; the same holds for the repeat.

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

Done as its own pull request on top of the squash, so each merge
changes one thing and a problem in either is easy to place. Run the
Phase 7 check against it too: backend pull requests routinely add
decision files, so anything merged meanwhile may have added more.

- [x] Delete every file in `api-compatibility/` (173 on 2026-10-15) and
      add one fresh `init` file, `20261015000000-init.yaml`
      (`generation: 1`, `forces_reload: false`, `change: "none"`). Not
      one of the 173 set `forces_reload: true`, so
      `compute_required_client_generation()` in
      `backend/app/api_compatibility.py` returns 1 before and after,
      and no client is told to reload. Had one, the fresh `init` would
      carry that generation instead of 1, so the required generation
      did not move. The files are a record of decisions made while
      nothing was live, and git keeps that record anyway.
      `new_compat_decision.py`, `validate-compat-files.sh` and the
      breaking-change gate in `.github/workflows/gate-breaking.yml` all
      stay: they are what will matter once the API has real clients.
      The backend and frontend read the directory afresh at build time,
      and their tests use their own temporary directories, so nothing
      else changes.

- [x] Give rule 5 of `validate-compat-files.sh`, which refuses deleted
      decision files outright, the same narrow exception as Phase 3: a
      pull request may delete merged decision files only when it
      deletes every one of them and adds exactly one `init` file at the
      generation they required, with `forces_reload: false` and
      `change: "none"`. Done as `is_compat_reset`, with
      `required_generation_at_base` reading the deleted files as they
      stand at the base. Bats tests cover the accepted reset, a reset
      at the generation a `forces_reload: true` file required, the
      wrong generation, a partial deletion, two added files, an `init`
      that forces a reload or records a change, and the message. Like
      the migration one, it is temporary and closed in Phase 10. The
      rule is written into the backend instructions, the Claude rules
      and `docs/docs/backend/api-compatibility.md` for as long as it is
      open.

- [ ] Merge (a human does this), then confirm the app loads in an open
      browser without being told to reload.

## Phase 10: Close the exceptions

Decided by Mark on 2026-10-15: both CI exceptions are temporary. Once
the squash and the reset have merged, the immutability check and rule 5
go back to refusing every deletion, so neither check stays looser than
it was before this work for the sake of a squash nobody has planned.
Its own pull request, at the top of the stack, merged last.

- [x] Restore `check-migrations-unmodified.sh` and
      `validate-compat-files.sh`, with their bats tests, to how they
      stood before Phase 3. Nothing else in the stack changed them, so
      this takes out `is_squash`, `head_revision_at`,
      `revision_values`, `migrations_at`, `is_compat_reset`,
      `required_generation_at_base` and `get_base_compat_files`, and
      the failure messages that named the exceptions.

- [x] Take the exception rules out of
      `.github/instructions/backend.instructions.md` and
      `.claude/rules/backend.md`. `docs/docs/backend/alembic-migration-safety.md`
      and `docs/docs/backend/api-compatibility.md` keep a short record
      instead: the squash and the reset each needed a temporary
      exception, opened and closed in their own pull requests, and the
      pull requests that opened them are the ones to copy next time.

- [x] Let the `DB migration immutability check` compare a pull request
      with the commit it was built on, not with `main`. Found when this
      pull request failed it: comparing with `main` counted the squash
      in #2005, still underneath, as this pull request's deletions, and
      with the exception now closed it refused them. The job in
      `.github/workflows/ci.yml` now resolves the base with
      `resolve-pr-base-sha.sh`, as the destructive-migration gate in
      `gate-breaking.yml` already does for the same reason. A merge
      queue run still compares with `main`, so the stack is checked
      whole before anything lands.

- [ ] Merge after #2005 and #2006 have merged (a human does this). If
      it merged first, the squash and reset pull requests would fail
      their own checks.

## Phase 11: Measure what the squash did to CI run times

Asked for by Mark on 2026-10-15. CI speed was never the reason for the
squash (see Decisions), so this records what it actually changed rather
than justifying it. The before figures were taken on 2026-10-15, after
the work was built but before any of it merged, so they describe the
94-migration chain.

The method, the same both times, so the two sets compare:

- **Which runs** - the last 25 successful `ci.yml` runs triggered by
  `merge_group`, from `gh run list --workflow=ci.yml --event
  merge_group --status success --limit 25`. Merge queue runs carry
  every job, heavy tier included, against the tip of `main`, which pull
  request runs and `push` runs on `main` do not.
- **Each job's time** - `completed_at` minus `started_at` from
  `gh api repos/bailey-medics/quillmedical/actions/runs/<id>/jobs`,
  successful jobs only, as the median across the 25 runs with its range.
  Jobs under 20 seconds are left out: they are set-up and decision jobs
  the squash cannot touch.
- **The run's time** - the latest `completed_at` minus the earliest
  `started_at` across the run's jobs, as the median. This is the wait,
  which job times alone do not show, because the jobs run side by side.

- [x] Record the before figures. 25 merge queue runs, 2026-10-14 13:54
      to 2026-10-15 11:55 UTC. Whole run: median 361s, range 293 to
      418s. Jobs, median:

      - **E2E (Playwright)** - 224s (194 to 253s). Migrates a fresh
        database from the chain before the tests start.
      - **Alembic autogenerate drift check** - 104s (85 to 117s). Builds
        a database from the chain and runs every `migration`-marked
        test, the 15 deleted in Phase 4 among them.
      - **Python unit** - 171s. SQLite from the models, so the chain
        never runs here; included as a control.
      - **E2E image build** - 131s. Copies `backend/alembic/` into the
        image, so a much smaller folder is the only possible effect.
      - **Unaffected, for reference** - frontend unit tests 150 to 183s
        across three shards, Storybook interaction tests 167 to 177s
        across three, Python pre-commit 175s, eslint 56s, Storybook
        build 54s, SAST 34s, typecheck 27s, prettier 26s.

      An early look at two pull request runs of #2005 put the drift
      check at 78s, E2E at 218s and Python unit at 189s. Two runs is too
      few to rely on, and pull request runs are not merge queue runs,
      so the after figures below are the ones to compare.

- [ ] Record the after figures once 25 merge queue runs have finished
      with the squash on `main`, counting only runs created after #2005
      merged, by the method above. Write them here in the same shape,
      job by job beside the before figure, and say plainly which moved
      by more than their own range. The expectation, to be confirmed or
      corrected: the drift check about 25 seconds faster, E2E and the
      image build within their ranges, Python unit unchanged, and the
      whole run unchanged, because E2E and the frontend shards run
      alongside the drift check and take longer.

- [ ] Report the result to Mark: the whole run's time before and after,
      each job that moved, and whether the expectation above held.

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
  dumps compared in Phase 4 both come from throwaway databases, so the
  check needs no access to App production. That holds because
  migrations are the only thing that has ever changed its schema;
  Phase 2's `just mc app` is the one look at production itself.
