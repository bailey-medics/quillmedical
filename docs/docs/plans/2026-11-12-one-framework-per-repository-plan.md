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

- [ ] **Grow `quill_test` into the full made-up framework**, in
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

- [ ] **Protect the second testing repository like the first.**
      - Add it to `local.framework_repos` in
        `infra/github/framework_rulesets.tf`, after its first commit is
        on `main`. An empty repository has no `main` for the ruleset's
        pull request rule to target.
      - Add it to `repositories_without_secrets` in
        `infra/github/actions_secrets.tf`.
      - Extend the note in `infra/github-sign-in.tf` that says why the
        testing repository has no sign-in, so it covers both.

      Then apply the rulesets with `just terraform-github`. The note in
      `infra/github-sign-in.tf` is a comment only, and CI applies that
      folder on merge.

## Phase 2: Copy the fixtures from both testing repositories

- [ ] **Copy from both repositories in `scripts/framework-fixtures-refresh.sh`.**
      It copies every file in each repository's `frameworks/` folder.
      `quill_test.yaml` is no longer left out, because it is now a fixture
      the tests use. `SOURCE` names both repositories, each with the
      commit copied from. The four real fixtures still come across from
      the first repository until Phase 4 deletes them, so nothing breaks
      while Phase 3 moves the tests.

- [ ] **Check both repositories in `.github/scripts/ci/check-framework-fixtures.sh`.**
      It clones each repository at its commit in `SOURCE`, and fails a
      pull request whose fixtures differ from either. Add bats (Bash
      Automated Testing System) cases to
      `check-framework-fixtures.bats` for a second repository, and for a
      fixture that differs from it.

- [ ] **Update `shared/framework-fixtures/README.md`** to say there are
      two testing repositories, one made-up framework in each, and why.

## Phase 3: Move every test onto the made-up frameworks

- [ ] **Move the backend tests.** Every test naming `uk_sact_board_2023`
      or `ruh_sact_passport` moves to `quill_test`. Every test naming
      `clinical` or `ghnft_radiotherapy_record` as a framework moves to
      `quill_2_test`. A test that needs two frameworks takes one of each.
      The files include `sync_test.py`, `definitions_test.py`,
      `catalogue_test.py`, `competencies_test.py` and the passport
      router, sign-off, export, PDF and audit tests. Grep for the four ids
      to find the rest. A test that only needs "a second framework" takes
      `quill_2_test`, not a third fixture.

- [ ] **Move the frontend.** That is `components/passport/fixtures.ts`,
      the passport stories, `SignOffForm.test.tsx` and
      `types/cbac.test.ts`.

- [ ] **Move the end-to-end tests and the CI seed**:
      `frontend/e2e/fixtures/passport.ts`,
      `tests/passport/holding-a-passport.spec.ts` and
      `backend/scripts/seed_ci.py`. The dev stack and the end-to-end stack
      then show the made-up frameworks. That is expected: they are test
      stacks.

- [ ] **Change the examples in comments.** The docstring in
      `backend/app/features/passport/paths.py` and the doc comment in
      `CompetencyFrameworkTable.tsx` name a real framework only as an
      example. They name a made-up one instead.

- [ ] **Add a check that keeps real frameworks out of the tests.** A
      pytest test reads the framework ids from `local.framework_repositories`
      in `infra/main.tf`. It fails if any of them appears in a test, a
      story, an end-to-end test or `shared/framework-fixtures/`. Without
      it, the next test written by copying a real id brings the problem
      back.

- [ ] **Run the network test against both testing repositories.**
      `backend/tests/framework_repository_sync_test.py` syncs both
      repositories from GitHub. It checks that each framework is stored
      from its own repository, and that `quill_test` versions 1 to 4 all
      arrive, with the items retired at version 4 stored as live at
      version 3. It also checks the cross-talk: a run that lists the first
      repository as publishing `quill_2_test` is refused, because that
      repository holds no such file and the second does. The offline
      tests in `sync_test.py` already cover the refusal. This proves it
      over two real clones.

## Phase 4: Remove the real frameworks from the testing repository

- [ ] **Delete the four real fixtures from
      `quill-medical-framework-testing`**, by a pull request there. It
      then holds `quill_test` alone. Merge it before the Quill change
      below. The copy check compares against the commit in `SOURCE`, so
      Quill's pull requests keep passing until that commit changes.

- [ ] **Run `just framework-fixtures-refresh` in Quill** and open a pull
      request with the result. `shared/framework-fixtures/` then holds
      `quill_test.yaml` and `quill_2_test.yaml` and nothing else, and the
      check from Phase 3 passes.

## Phase 5: One framework per repository, step one

The setting changes form, from a list of ids to one id. Terraform writes
it, and the backend reads it, in separate deploys. So this step teaches
the backend to read both forms, and Phase 6 changes what Terraform
writes. App production must run this step before Phase 6 merges.

- [ ] **The framework pipeline refuses a second framework.**
      `validate` in
      `backend/app/features/passport/tooling/validate_frameworks.py`
      fails when the `frameworks/` folder holds anything other than
      exactly one `.yaml` file. It says which files it found. Every
      framework repository runs this on every pull request through
      `framework-pipeline.yml`, so a second framework is refused before
      it merges. By this point every repository, both testing ones
      included, holds one file, so none goes red.

- [ ] **`FRAMEWORK_REPOSITORIES` accepts one id or a list of one.** In
      `backend/app/config.py`, a validator turns each repository's value
      into a single id. It accepts a string, or a list of exactly one,
      which is the form Terraform writes today. It refuses an empty list
      or a list of two or more, and names the repository.

- [ ] **The sync takes one id per repository.** In `sync.py`,
      `may_publish: set[str]` becomes `framework_id: str`. A file under
      `frameworks/` with any other id is refused with "this repository
      publishes <id>". The check that two repositories never publish the
      same framework stays.

- [ ] **Say "one repository per framework" everywhere.** Update:
      - the comment in `infra/github/framework_rulesets.tf`, which says
        "one repository per publisher";
      - the docstring of `validate_frameworks.py`;
      - the frameworks paragraph in `.github/copilot-instructions.md`,
        which says "its publisher's own repository", then
        `/sync-copilot-config` into `CLAUDE.md`.

- [ ] **Tests**: the pipeline check refuses two files and an empty
      folder. The setting accepts both forms and refuses the rest. The
      sync refuses a file whose id is not the repository's one.

## Phase 6: One framework per repository, step two

- [ ] **Check that step one is running in App production** before this
      merges. The framework sync job and the admin job's
      `run-migrations` must both be on an image that reads the single-id
      form.

- [ ] **Terraform writes one id.** In `infra/main.tf`,
      `local.framework_repositories` maps each repository to a string,
      `"…-framework" = "clinical"`, not `["clinical"]`.
      `infra/github-sign-in.tf` reads only its keys, so it needs no
      change, but check that it still plans clean.

- [ ] **Drop the list form.** `FRAMEWORK_REPOSITORIES` becomes
      `dict[str, str]`, and the validator from Phase 5 goes. First check
      the order the merge runs things: `terraform.yml` must apply the
      string form before `deploy.yml` deploys a backend that no longer
      reads lists. If both run at once on a merge to `main`, put this
      bullet in a pull request of its own, after the Terraform one has
      applied.

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
