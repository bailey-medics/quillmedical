# One framework per repository plan

A framework repository may publish more than one framework today. Each
repository's entry in `local.framework_repositories` in `infra/main.tf`
is a list of framework ids. The sync, `read_repository_versions` in
`backend/app/features/passport/sync.py`, reads every
`frameworks/<id>.yaml` file whose id is on that list. Every publisher's
repository holds one framework in practice, but nothing says it must. One
framework per repository is safer and easier to manage. Each framework
then has its own history, its own reviewers and its own pipeline run, so
a pull request changes one framework and its CI (continuous integration)
check gates that framework alone.

The tests stand in the way. `quill-medical-framework-testing` holds five
frameworks on purpose. Four are copies of real frameworks: `clinical`,
`ghnft_radiotherapy_record`, `ruh_sact_passport` and
`uk_sact_board_2023`. Quill copies them into `shared/framework-fixtures/`,
and the unit tests, Storybook, the end-to-end stack and the dev seed all
use them. Tests should not depend on a real framework, which changes when
its publisher changes it, so they move to two made-up frameworks, each in
a testing repository of its own. Two testing repositories also let the
network test prove that one repository cannot publish another's
framework. Only then can the one-framework rule be enforced, in two
deploys, so the setting's new form never reaches a backend that cannot
read it.

**Built in one unattended run, then reviewed and merged in order.** The
pull requests in the testing repositories are opened without waiting for
each other to merge: each branches from the one before it, and shows red
until that one merges and its branch is updated. Quill's fixture copy
records the exact commits it copied, so the Quill pull requests pass CI
while the testing ones are still open. The merge order, and the one wait
for a deploy, are in the last section, "Merge order".

## Phase 1: Two made-up frameworks, each in its own testing repository

- [x] **List what the tests need from a framework before writing one.**
      Read every test, story and end-to-end test that names one of the
      four real fixtures. Write down each feature they rely on:
      - levels, the grade a sign-off is given at;
      - scopes, the area a sign-off covers;
      - a retired level, scope and competency;
      - specialties;
      - competency names the PDF (portable document format) export must
        print;
      - anything else that turns up, such as how many competencies a page
        shows before it pages.

      `uk_sact_board_2023` is in 34 files and has both levels and scopes,
      so most of the list comes from it. `clinical` has neither levels nor
      scopes, and stands for the plain shape. Record the list in this
      step, so the two frameworks below are checked against it.

      **Found on 12 November 2026**, by searching the backend, the
      frontend and the end-to-end tests for every id in the four
      fixtures:
      - **One competency with ordered levels and many scopes.**
        `uk_sact_board_2023_prescribe_sact` is named in 31 files. It has
        five levels in order, from `observation_only` up to
        `prescribe_for_complex_patients`, and 13 scopes. The tests lean
        on `review_and_authorise` (14 files), on `prescribe_subsequent_cycles`
        and on the scopes `lung` (27 files) and `breast` (14 files).
        `quill_test` needs one competency like it: at least five levels
        and at least two scopes, so "a higher level" and "another scope"
        both exist.
      - **A record path built from the competency, a date and a scope**,
        such as `uk_sact_board_2023_prescribe_sact.2026-04-02-lung`, in
        `paths.py` and its tests. Any competency with scopes gives this.
      - **A second competency with levels in another framework.**
        `ruh_sact_passport_prescribe_sact` and
        `ghnft_radiotherapy_record_refer_palliative` are used only a few
        times, as "a different framework's competency". `quill_2_test`
        is plain, so `quill_test` carries a second competency with
        levels instead, and the tests that need two frameworks take one
        competency from each.
      - **Plain competencies, many and assessable.** `clinical` gives
        `clinical_perform_cannulation` and
        `clinical_perform_lumbar_puncture` (32 files each),
        `clinical_perform_venepuncture` (12) and
        `clinical_take_informed_consent` (7), plus a few named once.
        `quill_2_test` needs about eight competencies with no levels or
        scopes, and an empty `specialties` list, as `clinical` has.
      - **Specialties from Quill's own list.** The real fixtures name
        `oncology` and `haematology`. These are Quill's vocabulary, not a
        framework's content, so `quill_test` may name them too.
      - **No retired items.** None of the four fixtures retires anything.
        The tests of retirement build their own frameworks inside the
        test. So version 4 of `quill_test` is for the network test and
        the sync's history, not something an existing test needs.
      - **Many ids prefixed `clinical_` are not the framework.**
        `clinical_lead`, `clinical_safety_officer` and
        `clinical_services_enabled` are positions and settings. The move
        in Phase 3 touches only the competencies in `clinical.yaml`.

- [x] **Grow `quill_test` into the full made-up framework**, in
      `bailey-medics/quill-medical-framework-testing`, by a pull request
      there. It is at version 2 on `main`, and `check_framework_version.py`
      requires each change to raise the version by exactly one, so this
      takes two pull requests:
      1. **Version 3 adds everything, all live**: levels, scopes,
         specialties and the full set of competencies on the list above.
      2. **Version 4 retires one level, one scope and one competency**
         that version 3 made live.

      The loader would accept an item added and retired in one version,
      since it only requires `retired_in_version` to be 2 or more. But
      then the case the passport must handle never arises: an item live
      at one version and retired at the next, with sign-offs given at
      the earlier version still naming it. Every competency id starts
      `quill_test_`, as the loader requires.

      **Built on 12 November 2026** as the testing repository's #4 and
      #5, #5 branched from #4.
      - **Version 3** keeps the four competencies of versions 1 and 2,
        adds the specialties `oncology` and `haematology`, and adds
        three competencies. `quill_test_give_a_course` stands in for
        `uk_sact_board_2023_prescribe_sact`: five levels in order,
        `observe`, `review`, `continue`, `start` and `adapt`, and the
        scopes `breast`, `lung`, `bowel`, `skin` and `other`. The scope
        ids `lung` and `breast` are kept from the real fixture, because
        they are ordinary words and many tests name them.
        `quill_test_refer_to_a_team` is the second competency with
        levels. `quill_test_use_the_old_system` is plain.
      - **Version 4 retires only what no other test relies on**: the
        level `with_direct_supervision` and the scope `liver`, both on
        `quill_test_refer_to_a_team`, and the whole of
        `quill_test_use_the_old_system`. So the tests moved onto
        `quill_test_give_a_course` never meet a retired item by
        accident.
      - Both passed Quill's `validate_frameworks` and
        `check_framework_version`, version 4 checked against version 3's
        branch.

- [x] **Make a second testing repository holding one plain made-up
      framework**: no levels and no scopes. The repository is
      `bailey-medics/quill-medical-2-framework-testing`, and the
      framework is `quill_2_test`, named to match. Neither id starts with
      the other followed by an underscore, so no competency id could
      belong to both. It calls Quill's `framework-pipeline.yml`
      with `start_sync: false`, exactly as the first testing repository
      does, so it needs no secrets and starts no sync.

      **Done on 12 November 2026.** Its first commit, straight to `main`
      because an empty repository has no `main` for a pull request to
      target, holds the README, the licence, `cspell.config.json` and the
      pipeline workflow. `quill_2_test` version 1 came in by its #1:
      eight plain competencies, with no levels, no scopes and no
      specialties. Quill's `validate_frameworks` passed it alone and
      loaded together with `quill_test`. Pushing the workflow file needed
      the `workflow` scope on the `gh` sign-in, added with
      `gh auth refresh -h github.com -s workflow`.

- [x] **Protect the second testing repository like the first.**
      - Add it to `local.passport_framework_repos` in
        `infra/github/passport_framework_rulesets.tf`, after its first
        commit is on `main`. An empty repository has no `main` for the ruleset's
        pull request rule to target.
      - Add it to `repositories_without_secrets` in
        `infra/github/actions_secrets.tf`.
      - Extend the note in `infra/github-sign-in.tf` that says why the
        testing repository has no sign-in, so it covers both.

      Then apply the rulesets with `just terraform-github`. The note in
      `infra/github-sign-in.tf` is a comment only, and CI applies that
      folder on merge.

      **Done on 13 November 2026**, and `just terraform-github` run.

## Phase 2: Copy the fixtures from both testing repositories

- [x] **Copy from both repositories in `scripts/framework-fixtures-refresh.sh`.**
      It copies every file in each repository's `frameworks/` folder.
      `quill_test.yaml` is no longer left out, because it is now a fixture
      the tests use. `SOURCE` names both repositories, each with the
      commit copied from, as one `source=<repository> <commit>` line
      each. The four real fixtures still come across from the first
      repository until Phase 4 deletes them, so nothing breaks while
      Phase 3 moves the tests.

      A repository may be named with `#<branch>`, so a Quill pull request
      can copy from a testing pull request that has not merged. This
      stack copies from #5's branch. `just framework-fixtures-refresh`
      passes its arguments on.

- [x] **Copy every version too, not only the newest.** Found while
      building: the sync stores a framework from a folder of newest files
      only if it is at version 1. It refuses one first seen at version 4,
      on purpose, and
      `test_a_framework_first_stored_above_version_1_is_refused` pins
      that. So `quill_test` at version 4 could not be synced from its
      newest file, and nor could any fixture that ever changed. That rule
      is right, so the fixtures carry their history instead:
      `shared/framework-fixtures/history/<id>/<version>.yaml`, read from
      each repository's first-parent history, oldest first, keeping the
      first text of each version, exactly as `read_repository_versions`
      in `sync.py` reads a repository. The newest files stay where they
      were for everything that reads a framework as it stands. The
      `stored_frameworks` fixture in `backend/conftest.py`,
      `backend/scripts/seed_ci.py` and `python -m
      app.features.passport.sync` with no folder now catch up from
      `history/` with `sync_framework_versions`, keeping every rule.
      `FRAMEWORK_FIXTURE_HISTORY_DIR` in `backend/app/paths.py` names it,
      and `sync_frameworks` no longer defaults to the fixtures folder.

- [x] **Check both repositories in `.github/scripts/ci/check-framework-fixtures.sh`.**
      It clones each repository at its commit in `SOURCE`, and fails a
      pull request whose fixtures differ from either, in the newest files
      or in `history/`. It also refuses one framework held by both
      repositories. Add bats (Bash Automated Testing System) cases to
      `check-framework-fixtures.bats` for a second repository, and for a
      fixture that differs from it.

- [x] **Update `shared/framework-fixtures/README.md`** to say there are
      two testing repositories, one made-up framework in each, and why.

## Phase 3: Move every test onto the made-up frameworks

- [x] **Move the backend tests.** Every test naming `uk_sact_board_2023`
      or `ruh_sact_passport` moves to `quill_test`. Every test naming
      `clinical` or `ghnft_radiotherapy_record` as a framework moves to
      `quill_2_test`. A test that needs two frameworks takes one of each.
      The files include `sync_test.py`, `definitions_test.py`,
      `catalogue_test.py`, `competencies_test.py` and the passport
      router, sign-off, export, PDF and audit tests. Grep for the four ids
      to find the rest. A test that only needs "a second framework" takes
      `quill_2_test`, not a third fixture.

      **Done on 12 November 2026**, by one mapping applied to every
      backend Python file, then the failures fixed by hand:
      - `uk_sact_board_2023_prescribe_sact` became
        `quill_test_give_a_course`, its levels `observation_only`,
        `review_and_authorise`, `prescribe_subsequent_cycles`,
        `prescribe_first_cycle` and `prescribe_for_complex_patients`
        became `observe`, `review`, `continue`, `start` and `adapt`, and
        its wording became `quill_test`'s.
      - The eight `clinical` competencies the tests use became the eight
        in `quill_2_test`, such as `clinical_perform_cannulation` to
        `quill_2_test_insert_a_cannula`, and the framework id
        `"clinical"` became `"quill_2_test"`.
      - Tests that assumed version 1 now use `quill_test`'s version 4: a
        version "above the newest" is 5.
      - `test_general_clinical_skills_holds_its_own_ids`, about the real
        framework's split from the permissions, became
        `test_a_framework_holds_ids_of_its_own`: `quill_2_test`'s ids all
        carry its prefix and none is a permission.
      - `backend/scripts/seed_guides.py` reads the synced fixtures, so it
        moved too, and the guide screenshots will show
        "Quill second test framework". `backend/app/email/previews.py`
        only holds example wording and reads no fixture, so it was left
        alone.
      - `test_the_gloucestershire_record_carries_every_signed_line`
        checked the real Gloucestershire record's content, which now
        belongs to that framework's own repository and pipeline. It
        became `test_a_framework_keeps_its_competencies_in_the_files_order`,
        over `quill_test`.
      - The `clinical`, `ruh_sact_passport`, `ghnft_radiotherapy_record`
        and `uk_sact_board_2023` lines left in the two fixture version
        lists go in Phase 4, with the files.

- [x] **Move the frontend.** That is `components/passport/fixtures.ts`,
      the passport stories, `SignOffForm.test.tsx` and
      `types/cbac.test.ts`.

      **Done on 12 November 2026**, with the backend's mapping, then a
      second for the two smaller fixtures. `oncologyFrameworks` in
      `fixtures.ts`, which the By competency tests join to the fixture
      catalogue, became `quill_2_test` and `quill_test`, its
      radiotherapy items taking `quill_2_test` competencies the
      cannulation tests do not use. The RUH competency in the sign-off
      form tests became `quill_test_refer_to_a_team`, signed at
      `with_indirect_supervision` rather than the level version 4
      retires. The mapping must not run over the member practice files:
      a permission such as `perform_venepuncture` shares its display
      name with a `clinical` competency, and those names stayed.

- [x] **Move the end-to-end tests and the CI seed**:
      `frontend/e2e/fixtures/passport.ts`,
      `tests/passport/holding-a-passport.spec.ts` and
      `backend/scripts/seed_ci.py`. The dev stack and the end-to-end stack
      then show the made-up frameworks. That is expected: they are test
      stacks.

      **Done on 12 November 2026.** A holder is given `quill_2_test`
      and `quill_test`, and `REFER_PALLIATIVE` became
      `EXAMINE_THE_CHEST`, `quill_test`'s competency with no levels and
      no scopes. The guide `start-your-passport.spec.ts` now photographs
      "Quill second test framework". `seed_ci.py` moved in Phase 2.

- [x] **Change the examples in comments.** The docstring in
      `backend/app/features/passport/paths.py` and the doc comment in
      `CompetencyFrameworkTable.tsx` name a real framework only as an
      example. They name a made-up one instead.

- [x] **Add a check that keeps real frameworks out of the tests.** A
      pytest test reads the framework ids from `local.framework_repositories`
      in `infra/main.tf`. It fails if any of them appears in a test, a
      story, an end-to-end test or `shared/framework-fixtures/`. Without
      it, the next test written by copying a real id brings the problem
      back.

      **Built on 13 November 2026** as
      `backend/tests/no_real_framework_in_tests_test.py`. It reads both
      the list form and the single-id form of the setting, so Phase 6
      needs no change to it.
      - **It looks at quoted strings only**: a real id itself, or one
        starting with the id and an underscore, which is how a
        competency id is formed. Competency ids are always written as
        strings, so a variable such as `clinical_disabled_client` is
        never mistaken for one.
      - **A name the application code uses is Quill's own.** `clinical`
        is a real id, and Quill also has `clinical_lead`,
        `clinical_services_enabled` and others. No application code
        names a framework, so any word in `backend/app` or
        `frontend/src` outside the tests is passed over, unless it is a
        real id itself.
      - **One file is exempt**: `frontend/src/featureChunks.test.ts`,
        where `clinical` is the clinical feature chunk.
      - **The unit-test container mounts what it reads**:
        `infra/main.tf`, `frontend/src` and `frontend/e2e`, read-only,
        in `compose.unit-tests.yml`. CI's backend job runs on the full
        checkout, so needs nothing.
      - **It found five frontend files still naming `clinical`** as a
        framework, in stories and tests of the passport frameworks card,
        the framework sync panel, the org unit and passport API clients.
        They now name `quill_2_test`. The card's stories had shown no
        framework chosen, because `clinical` is not in the test
        catalogue.

- [x] **Run the network test against both testing repositories.**
      `backend/tests/framework_repository_sync_test.py` syncs both
      repositories from GitHub. It checks that each framework is stored
      from its own repository, and that `quill_test` versions 1 to 4 all
      arrive, with the items retired at version 4 stored as live at
      version 3. It also checks the cross-talk: a run that lists the first
      repository as publishing `quill_2_test` is refused, because that
      repository holds no such file and the second does. The offline
      tests in `sync_test.py` already cover the refusal. This proves it
      over two real clones.

      **Done in Phase 4**, with the sync decision there, and passing
      since the testing repositories' pull requests merged on
      13 November 2026.

## Phase 4: Remove the real frameworks from the testing repository

- [x] **Delete the four real fixtures from
      `quill-medical-framework-testing`**, by a pull request there. It
      then holds `quill_test` alone. Merge it before the Quill change
      below. The copy check compares against the commit in `SOURCE`, so
      Quill's pull requests keep passing until that commit changes.

      **Opened on 12 November 2026** as the testing repository's #6,
      branched from #5, with its README saying it holds `quill_test`
      alone.

- [x] **Run `just framework-fixtures-refresh` in Quill** and open a pull
      request with the result. `shared/framework-fixtures/` then holds
      `quill_test.yaml` and `quill_2_test.yaml` and nothing else, and the
      check from Phase 3 passes.

      **Done on 12 November 2026**, copying from the deletion branch.
      `history/` keeps only frameworks the repository still holds at the
      copied commit: the four real ones are in that repository's history
      for good, and would otherwise have come back under `history/`.
      The two fixture version lists in `competencies_test.py` and
      `sync_test.py` now name `quill_test` and `quill_2_test` alone.

- [x] **Decide what the sync does with a framework deleted from a
      repository's history.** Found while rewriting the network test:
      `read_repository_versions` refused any framework file anywhere in
      `main`'s history that the repository may not publish. Once the
      deletion above merges, `quill-medical-framework-testing` holds
      `clinical.yaml` and the other three in its history for good,
      because `main` is never rewritten. So a sync listing it as
      publishing `quill_test` alone would fail, and under Phase 5's one
      id per repository it could never be synced again.

      **Decided on 13 November 2026: refuse what `main` holds now, pass
      over what it no longer holds.** `_refuse_what_main_may_not_hold`
      in `backend/app/features/passport/sync.py` lists `frameworks/` at
      the tip of `main` and refuses any file the repository may not
      publish, as loudly as before. The history walk then skips an
      unlisted framework instead of refusing it, since nothing still on
      `main` can be one. Nothing unlisted is ever stored either way. The
      rejected options were a fresh testing repository, which keeps the
      rule but replays four pull requests, and listing the four real
      ids for that repository, which contradicts Phase 5's single id.
      `check-framework-fixtures.sh` already skips a deleted framework
      the same way, so the fixtures and the sync agree.

      The network test, `backend/tests/framework_repository_sync_test.py`,
      now syncs both testing repositories as they stand once #4, #5 and
      #6 there merge: `quill_test` at versions 1 to 4, `quill_2_test` at
      1, what version 4 retired, and each repository refused the other's
      framework. Checked against local copies with #6 as `main`. Its CI
      job reads the live repositories, so it is red until those three
      merge.

## Phase 5: One framework per repository, step one

The setting changes form, from a list of ids to one id. Terraform writes
it, and the backend reads it, in separate deploys. So this step teaches
the backend to read both forms, and Phase 6 changes what Terraform
writes. App production must run this step before Phase 6 merges.

- [x] **The framework pipeline refuses a second framework.**
      `validate` in
      `backend/app/features/passport/tooling/validate_frameworks.py`
      fails when the `frameworks/` folder holds anything other than
      exactly one `.yaml` file. It says which files it found. Every
      framework repository runs this on every pull request through
      `framework-pipeline.yml`, so a second framework is refused before
      it merges. By this point every repository, both testing ones
      included, holds one file, so none goes red.

- [x] **`FRAMEWORK_REPOSITORIES` accepts one id or a list of one.** In
      `backend/app/config.py`, a validator turns each repository's value
      into a single id. It accepts a string, or a list of exactly one,
      which is the form Terraform writes today. It refuses an empty list
      or a list of two or more, and names the repository.

- [x] **The sync takes one id per repository.** In `sync.py`,
      `may_publish: set[str]` becomes `framework_id: str`. A file under
      `frameworks/` with any other id is refused with "this repository
      publishes <id>". The check that two repositories never publish the
      same framework stays.

- [x] **Say "one repository per framework" everywhere.** Update:
      - the comment in `infra/github/passport_framework_rulesets.tf`,
        which says "one repository per publisher";
      - the docstring of `validate_frameworks.py`;
      - the frameworks paragraph in `.github/copilot-instructions.md`,
        which says "its publisher's own repository", then
        `/sync-copilot-config` into `CLAUDE.md`.

- [x] **Tests**: the pipeline check refuses two files and an empty
      folder. The setting accepts both forms and refuses the rest. The
      sync refuses a file whose id is not the repository's one.

      **Built on 13 November 2026.** Found while building:
      - **The pipeline check counts every file in `frameworks/`**, not
        only `.yaml` ones, so a `.yml` file or a README there is refused
        too. All six framework repositories hold exactly one `.yaml`
        file today, checked on GitHub, so none goes red.
      - **`CLAUDE.md` was edited by hand alongside
        `.github/copilot-instructions.md`**, with the same words, rather
        than by `/sync-copilot-config`, which is interactive and reports
        drift. The next sync finds nothing to change.
      - **`docs/docs/backend/passport/index.md` said the same thing**, in
        its bullet on what the sync reads, so it changed too.
      - **The comments in `infra/main.tf` still say "framework ids"**,
        because Terraform still writes a list. Phase 6 changes them with
        the form.

## Phase 6: Terraform writes one id

Built straight after Phase 5, without waiting for it to deploy. The pull
request says plainly that it merges only once Phase 5 is running in App
production. `terraform.yml` and `deploy.yml` both start on a push to
`main` and neither waits for the other, so merge order is the only thing
that keeps a backend from meeting a form it cannot read.

- [x] **Gate this pull request on Phase 5 in App production.** Its
      description opens with a numbered list: merge Phase 5, wait for its
      deploy to finish, check that the framework sync job and the admin
      job's `run-migrations` are on that image, then merge this. Phase 5
      already reads both forms, so after that the order no longer matters.

- [x] **Terraform writes one id.** In `infra/main.tf`,
      `local.framework_repositories` maps each repository to a string,
      `"…-framework" = "clinical"`, not `["clinical"]`. Its comments say
      "the framework id", not "the framework ids". `infra/github-sign-in.tf`
      reads only its keys, so it needs no change, but check that it still
      plans clean.

      **Built on 13 November 2026.** `terraform validate` passes over
      `infra/`. A plan needs App production's credentials, so CI's
      Terraform job is the first to plan it. The comment on the framework
      sync job changed too, since it also said "framework ids". The same
      unit taught `/f` and `/crpd` that a unit waiting to merge is built
      anyway, with a "Merge only after" list at the top of its pull
      request.

## Phase 7: Drop the list form

A pull request of its own, because `terraform.yml` must have applied
Phase 6's string form before a backend that no longer reads lists
deploys. Built in the same run as Phase 6.

- [ ] **Gate this pull request on Phase 6 being applied.** Its
      description opens with a numbered list: merge Phase 6, wait for
      `terraform.yml` to apply it to App production, check that the sync
      job's `FRAMEWORK_REPOSITORIES` holds strings, then merge this.

- [ ] **Drop the list form.** The validator
      `_one_framework_per_repository` in `backend/app/config.py` goes, and
      `FRAMEWORK_REPOSITORIES` stays `dict[str, str]`, so a list is
      refused by pydantic itself. The tests of the list form in
      `config_test.py` become one test that a list is refused.

## Decisions

- **Tests use only made-up frameworks, `clinical` included.** `clinical`
  is a real framework that Quill itself publishes, from
  `general-clinical-skills-quill-medical-framework`. A test built on it
  breaks, or quietly tests something stale, when Quill edits it, just as
  one built on a trust's framework would. No app code names a framework,
  so nothing outside the tests needs a real one.

- **Two made-up frameworks, not four.** One with levels and scopes, and
  one without, cover every shape the tests use, and give "more than one
  framework" where a test needs it. The two real fixtures dropped,
  `ghnft_radiotherapy_record` and `ruh_sact_passport`, were mostly used
  as "another framework".

- **Two testing repositories, one framework each.** No repository needs
  an exception to the one-framework rule. And the network test can prove
  over real clones that one repository cannot publish another's
  framework.

- **The fixtures stay a copy, kept in step by the CI check.** The
  testing repositories run the same framework pipeline as a publisher's,
  so a fixture is checked the way a real framework is. Quill keeps a copy
  so that its tests run offline.

- **The setting changes form in two deploys, not one.** Changing
  Terraform and the backend together risks a deploy where a backend that
  reads one form meets a setting written in the other, and then the
  framework sync job cannot start.
