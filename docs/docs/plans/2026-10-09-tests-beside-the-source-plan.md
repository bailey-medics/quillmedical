# Tests beside the source plan

Every backend test lives in `backend/tests/`, away from the code it
tests. That is the commoner Python layout, and it has a cost that showed
up during a line-by-line review of `backend/app/`: the tests were not
being read, because nothing puts them in front of somebody reading a
module. The frontend and the shell scripts keep a test beside its source,
and there they are read as part of it.

This plan moves each test whose subject is one module to sit beside that
module, and leaves in `backend/tests/` the tests that are about a rule or
a journey no single module owns. Afterwards a module with no test beside
it is visible at a glance, which is what makes the last phase, finding
the modules that lack a test of their own, nearly free. Agreed with Mark
on 9 October 2026.

## Phase 1: Let a test anywhere under `backend/` run, with none moved yet

- [x] Move `backend/tests/conftest.py` to `backend/conftest.py`. This is
      the step that would otherwise break everything after it: pytest
      gives a test only the fixtures from `conftest.py` files in its own
      folder or above, and `backend/tests/` is not above `backend/app/`.
      A test moved into `app/` would lose `db_session`, `test_user` and
      the rest. At `backend/` both trees can see it.

- [x] Leave the shared helpers where they are: `competencies.py`,
      `places.py`, `registrations.py` and the `fixtures/` folder, all in
      `backend/tests/`. Tests import them as `tests.competencies` and so
      on (47 files do), and that import works from anywhere because
      `pythonpath` is `backend/`. `conftest.py` imports none of them, and
      nothing by a relative path, so it moved as it was.

- [x] Widen `testpaths` in `backend/pyproject.toml` from `["tests"]` to
      `["tests", "app"]`, and set `python_files` to `["test_*.py",
      "*_test.py"]` so the choice is written down and not left to
      pytest's default.

- [x] Deal with `backend/app/test_api_endpoints.py` before the step
      above lands. **It is not a test.** It is a module of dummy
      endpoints for the API-compatibility harness, imported by
      `app/main.py`, and its name happens to match `test_*.py`. Once
      pytest looks in `app/` it would be collected, and a careless
      `.dockerignore` rule in Phase 4 would take it out of the
      production image and stop the backend importing. Renamed to
      `backend/app/compat_harness_endpoints.py`, with the import in
      `main.py`, its own test and
      `docs/docs/backend/api-compatibility-testing.md` updated. The
      router is still `test_api_router` and the setting still
      `TEST_API_ENDPOINTS_ENABLED`, so nothing a workflow passes changes.
      The two older plans that name the file are left as they were: they
      record what was built then, under the name it had.

- [x] Run the whole backend suite, `just ub` with no filter, and check
      the count of tests collected is what it was before. `conftest.py`
      is a shared module, so this is one of the times a full local run is
      justified. Nothing has moved yet: this proves the plumbing alone.
      4,149 tests were collected before and after, from 187 files, and
      the full run passed: 4,131 passed, 16 skipped, 2 expected failures.
      A throwaway test under `backend/app/email/` ran and was given
      `db_session`, which is the thing the move was for.

- [x] Check the tools that treat `backend/tests/` specially still treat
      a test in `app/` the same way. mypy needs nothing: its hook runs
      on whichever Python files are in a commit, tests included, wherever
      they are. Semgrep needs nothing: its one job scans the frontend
      only. CI's unit job runs `pytest` from `backend/` and takes
      `testpaths` from `pyproject.toml`. That leaves Bandit, below.

- [x] **Found on the way: the Bandit hook scans nothing.** Its
      arguments in `.pre-commit-config.yaml` are `r`, `backend`, `-x`,
      `backend/tests`. The first is `r` and not `-r`, so Bandit looks for
      a file called `r`, is given the `backend` folder without being told
      to go into it, and reports "Skipping directory (backend), use -r
      flag to scan contents" and "Total lines of code: 0". It has passed
      on every commit by checking no code at all. Not fixed in this
      phase, because turning it on fails every commit until what it
      reports is dealt with. Phase 7 does both.

## Phase 2: Move one folder, `backend/app/email/`, and look at it

- [x] Move the tests whose subject is one module in `backend/app/email/`
      to sit beside it, named `<module>_test.py` and not
      `test_<module>.py`. The suffix form sorts each test directly under
      its module in a file listing, as `Brand.tsx` and `Brand.test.tsx`
      do in the frontend. With the prefix form every test sorts under
      "t", away from what it tests, and most of the point is lost. Use
      `git mv`, so history follows the file. The candidates:
      `test_email_brand.py` to `brand_test.py`, `test_email_render.py` to
      `render_test.py`, `test_email_previews.py` to `previews_test.py`,
      `test_email_theme.py` to `theme_test.py`, and
      `test_accessibility_reminder.py` to
      `accessibility_reminder_test.py`.

- [x] Decide each of the rest by its subject, not by counting what it
      imports. A test moves if one module is what it is about, whatever
      else it imports: a test of `newsletter.py` that stubs the email
      sender is still a test of `newsletter.py`. It stays in
      `backend/tests/` if it is about a rule or a journey. So
      `test_email_send.py` goes beside `backend/app/email_send.py`,
      `test_marketing_newsletter.py` beside
      `backend/app/marketing/newsletter.py`, and `test_email_templates.py`
      beside `backend/app/features/teaching/email_templates.py`.
      `test_account_emails.py`, `test_email_verification.py` and
      `test_email_addresses_are_lower_case.py` are about what routes do
      and stay. Where it is not clear, it stays.

- [x] Update what names a moved file. The docstrings in
      `backend/app/email/previews.py`, `backend/app/paths.py`, the two
      scripts under `backend/scripts/`, `compose.unit-tests.yml`, the
      `Justfile` and three frontend comments said
      `tests/test_email_previews.py` or `tests/test_email_theme.py`. The
      rule for where a test lives is written into
      `.github/instructions/backend.instructions.md`, with its copy in
      `.claude/rules/backend.md`, and pointed at from
      `.github/copilot-instructions.md` and `CLAUDE.md`.

- [x] Keep the moved tests out of the production image, in the root
      `.dockerignore`: `backend/app/**/*_test.py` and
      `backend/conftest.py`. **Brought forward from Phase 4**, where this
      plan first put it. `backend/Dockerfile` copies `backend/app` whole,
      so the first test moved would otherwise have shipped until Phase 4
      was reached. Checked by building a small image from the real build
      context: no `_test.py` under `app/`, no `conftest.py`, the renamed
      `compat_harness_endpoints.py` present, and 131 Python files, the
      number of modules there were before.

- [x] Stop a check that scans every file under `app/` from reading the
      moved tests as application code. One did:
      `tests/test_no_raw_exceptions_in_details.py` runs once for each
      Python file under `app/`, and gained eight cases when eight tests
      moved in. It now skips `*_test.py`. The count of tests collected is
      4,149 again, as it was before anything moved.

- [x] Stop and look at `backend/app/email/` with Mark before going on.
      This folder is the trial: whether a test beside its module does get
      read, and whether the naming and the split read well, are judged
      here and not assumed. Mark said to carry on, on 9 October 2026.

## Phase 3: Move the rest, a folder at a time

A survey on 9 October 2026 found 79 of the 203 test files import exactly
one application module and 58 import two or three; most of both groups
have one module as their subject and move. One area to a pull request
keeps each diff readable and lets the rule be corrected as it is applied.

**Where a module has several tests, each is named for the module first
and what it covers second**: `validate_test.py`, `validate_config_test.py`,
`validate_items_test.py`. They then sort together under `validate.py`.

**A test that finds a file by its own place on disk has that one line
changed when it moves**, and nothing else. Several teaching tests read
fixtures from `backend/tests/fixtures/`, which stays where it is.

- [x] `backend/app/cbac/` and `backend/app/org_units/`: nine tests.
      `base_professions`, `positions`, `practising`, `competencies` (and
      `competencies_retirement`), `grant_scope`, and for the tree `tree`
      (and `tree_stays_a_tree`) and `types`. Left in `backend/tests/`:
      `test_one_place_column.py` and `test_competency_id_validation.py`,
      which are each about a rule, and `test_org_unit_links.py` and
      `test_org_unit_surface.py`, which drive the API.

- [x] `backend/app/marketing/`: four tests, `mailing_list_import`,
      `preferences`, `suppression` and `subscribers`, beside
      `newsletter_test.py`, which moved in Phase 2. Left in
      `backend/tests/`: `test_marketing_registration.py` and
      `test_marketing_unsubscribe.py`, which each follow a person through
      a journey that crosses several modules. `admin_router.py` and
      `router.py` have no test beside them, being routers.

- [x] `backend/app/features/teaching/`: sixteen tests. `certificate`,
      `door`, `enrolment`, `mdx_parser` (and `mdx_parser_validation`),
      `media_inventory` and `media_progress`, `object_paths`, `router`,
      `scoring`, `storage` (and `storage_gcs_layout`), `sync` (and
      `sync_actor`), `transcode` and `video_access`. Two found files by
      their own place on disk and had that line changed. Four tests
      borrow helpers from the router's test and now import them from
      `app.features.teaching.router_test`: a test may import from
      another test wherever each of them sits. Left in `backend/tests/`:
      the tests named for a rule, such as
      `test_teaching_learner_gates.py`, `test_teaching_place.py` and
      `test_teaching_admin_needs_membership.py`.

- [x] `backend/app/features/teaching/tooling/`, as a pull request of
      its own: thirteen tests. Nine are for `validate.py`, the content
      validator, and are named for it first: `validate_test.py`,
      `validate_certificate_test.py`, `validate_config_test.py`,
      `validate_image_bytes_test.py`, `validate_inventory_test.py`,
      `validate_items_test.py`, `validate_question_bank_test.py`,
      `validate_result_test.py` and `validate_retired_test.py`. The rest
      are `certificate_schema`, `cli`, `check_version_lock` and
      `check_version_lock_integration`. Four read golden modules from
      `backend/tests/fixtures/teaching_tooling/` and had that line
      changed; the fixtures stay there, since `test_ci_teaching_sync.py`
      reads them too. This folder is also installed on its own by a
      content repository's CI. Nothing there imports the tests, and the
      two tests that police what the folder may import still pass. Left
      in `backend/tests/`: `test_teaching_tooling_dependencies.py`,
      which compares two `pyproject.toml` files and is about no module.

- [x] `backend/app/features/passport/`: twenty-five tests, one or more
      for each of `archive`, `commits`, `cover`, `cpd_periods`,
      `definitions`, `email_templates`, `export` (and `export_audit`),
      `frameworks`, `gcs_store`, `hashing`, `ids`, `models`, `paths`,
      `pdf`, `reconcile`, `records`, `render`, `router` (with
      `router_records` and `router_registrations_from_rows`), `schemas`,
      `serialise`, `service` and `store`. Left in `backend/tests/`:
      `test_passport_api_contract.py` and
      `test_passport_entitlement_at_onboarding.py`, which are about a
      contract and a journey; `test_passport_invite_token.py`, whose
      subject is in `security.py`; and `test_passport_storage.py` and
      `test_passport_api_schemas.py`, whose modules are outside this
      folder and move with the top-level ones.

- [x] `backend/app/feedback/` and `backend/app/inbox/`: nothing moved.
      `test_feedback.py` and `test_inbox.py` each drive the API across
      several modules, and neither folder has a test whose subject is
      one module. That is a finding for Phase 5: `feedback/replies.py`,
      `feedback/labels.py`, `feedback/slack.py` and `inbox/sources.py`
      are tested only through routes.

- [x] Move the tests of the top-level modules in `backend/app/`, in a
      pull request of their own: nineteen tests. Beside their modules in
      `backend/app/`: `api_compatibility`, `compat_harness_endpoints`,
      `config`, `ehrbase_client`, `fhir_client`, `log_context`, `models`,
      `organisations` (as `organisations_place_resolver` and
      `organisations_member_capacity`), `passport_storage`, `push`,
      `push_send`, `rate_limit`, `registrations` and `security` (with
      `security_passport_invite_token`). In the folders below it:
      `db/core_db_test.py`, `schemas/passport_test.py` and
      `utils/colors_test.py`. `test_security_pentest.py` stays where it
      is: `security-pentest.yml` runs it by path, and it attacks the
      running app and is about no one module.

- [x] Leave the tests of `backend/app/main.py`'s routes in
      `backend/tests/`. `main.py` holds a great many routes, and their
      tests are named for behaviour (`test_admin_user_route_scoping.py`).
      Scores of files beside `main.py` would bury it. They move when
      `main.py` is split by area, each to the router it then belongs to,
      and not before.

- [x] Leave in `backend/tests/` the tests that only drive the API (44
      files import nothing but the app and the models) and the ones that
      span four or more modules (22 files). What remains in that folder
      is then an honest list of what belongs to no one place.

## Phase 4: Keep tests out of the production image

- [x] Exclude the moved tests in the **root** `.dockerignore`. Done in
      Phase 2, before the first test moved: see there. The backend image
      is built with the repository root as its context (`context: .` in
      `compose.ci.yml` and `deploy.yml`), so `backend/.dockerignore`
      alone does not apply. By the suffix only, and **not `test_*.py`**:
      see the renamed endpoints module in Phase 1.

- [x] Shipping tests would do little harm, since nothing runs them and
      the test-only packages are not installed in the image. They are
      kept out because their fixtures hold strings that look like
      credentials, which a scanner flags, and because "is test code
      deployed?" is easier to answer with a no.

- [x] Add a check that fails if the built image holds a `*_test.py`, so
      the rule cannot stop working unnoticed.
      `.github/scripts/ci/check-no-tests-in-image.sh` looks inside the
      image for a `_test.py` under `/app/app` or a `conftest.py` beside
      it. It runs in the `E2E (Playwright)` job of `ci.yml`, on the image
      that job has just pulled: the `prod` target, built from the same
      Dockerfile and context as the one `deploy.yml` ships. So it gates
      a pull request leaving draft and the merge queue, before anything
      is deployed, and `deploy.yml` is left alone. It fails too if it
      finds no `main.py` where it looks, so that looking in the wrong
      place cannot read as a clean image, which is the mistake the
      Bandit hook made. Run against a production image built locally,
      it found 131 Python files and no tests.

## Phase 5: Find the modules with no test of their own

- [x] List every module under `backend/app/` with no `_test.py` beside
      it. After the move this is a directory listing. On 9 October 2026,
      once Phase 3 was done, it was 41 of 115 modules.

- [x] Sort the list into kinds. There turned out to be four, not three.

      - **Routers: 10.** `main.py`, `deps.py`, `features/gating.py`, and
        the `router.py` of `analytics`, `feedback`, `guides`, `inbox`,
        `marketing` (with `admin_router.py`) and `org_units`. Tested
        through the API, from `backend/tests/`, and needing none of
        their own.
      - **Schemas and table definitions: 14.** Everything in
        `backend/app/schemas/` but `passport.py`, and the teaching
        feature's `models.py` and `schemas.py`. They declare shapes and
        hold almost no logic. Where one carries a validator, as
        `schemas/org_units.py` and `schemas/organisations.py` do, that
        validator is worth a test of its own; none was written here.
      - **Constants: 3.** `paths.py`, and `annotations.py` and
        `module_schema.py` in the teaching tooling. Nothing to test
        apart from the code that reads them.
      - **Plain modules with logic: 14.** These are the ones the phase
        is for, and they split in two below.

- [x] Write the missing tests for the plain modules small enough to be
      tested whole. Five, each beside its module:
      `feedback/replies_test.py`, for which replies a sender has not
      opened; `feedback/labels_test.py`, that every stored category and
      status has its words; `feedback/slack_test.py`, the words of the
      Slack post and what happens when Slack cannot be reached, taking
      over two cases that sat in `tests/test_feedback.py`;
      `features/passport/entitlements_test.py`, for until when somebody
      may write to their passport; and `logging_config_test.py`.

- [x] Leave the nine larger plain modules, and the routes that hold
      logic of their own, for a later phase. Neither was done here: a
      test written for a module without first reading what the route
      tests already pin down would repeat them or be shallow. **Both
      are Phase 8**, moved there on 9 October 2026 because that is when
      they were done, after the renaming and the security scan.

## Phase 6: One name for a test file, `*_test.py`, everywhere

Added on 9 October 2026 at Mark's request, once the moves were done.
Phases 2 and 3 left two conventions: `<module>_test.py` beside a module,
and `test_<what>.py` for the 109 files still in `backend/tests/`. The
prefix was kept on the thought that it shows which side of the line a
test is on. The folder already shows that, so the second convention says
nothing and costs a rule to remember.

- [x] Rename every `backend/tests/test_<what>.py` to
      `backend/tests/<what>_test.py`, with `git mv`: `test_feedback.py`
      becomes `feedback_test.py`. 109 files. The files do not move; only
      the name changes.

- [x] Repoint the tests that import from another test by its module
      name. Three do: `app/features/teaching/enrolment_test.py` and
      `tests/test_teaching_place.py` import from
      `tests.test_validate_clinical_lead`, and
      `tests/test_drop_resolved_tags.py` from
      `tests.test_answer_tag_backfill`.

- [x] Update what names a test file by its path.
      `.github/workflows/security-pentest.yml` runs
      `tests/test_security_pentest.py`. `.claude/skills/f/SKILL.md`,
      `docs/docs/cybersecurity/index.md`,
      `docs/docs/backend/alembic-migration-safety.md` and
      `docs/docs/safety/hazards/Hazard-0048.md` name files, as do the
      docstrings of several tests. Older plans are left as they are:
      they record the names the files had. 41 files had a reference
      rewritten, each by the exact name of a renamed file.

- [x] Tell pytest to collect `*_test.py` only, by taking `test_*.py`
      out of `python_files` in `backend/pyproject.toml`. A source file
      whose name starts with `test_` then stops being a hazard at all:
      pytest no longer collects it, as it would have collected
      `test_api_endpoints.py` before Phase 1 renamed it. Do this in the
      same change as the renames, or every test in `backend/tests/`
      stops running.

- [x] Check the count of tests collected is what it was before, and
      run the whole backend suite once. A rename that pytest cannot see
      does not fail: it runs fewer tests and passes. The count is the
      only thing that shows it. It was 4,181 when this phase was
      written, and 4,181 after the renames, with the 59 tests marked
      `integration`, which the usual recipe leaves out, counted
      separately and also unchanged. The full suite passed.

- [x] Rewrite the rule in `.github/instructions/backend.instructions.md`
      and its copy in `.claude/rules/backend.md`, "Where a test lives",
      to say one thing about names: a test file ends `_test.py`,
      wherever it is. Where it lives still follows its subject.

- [x] Leave `backend/conftest.py` and the helpers `competencies.py`,
      `places.py` and `registrations.py` as they are. They are not
      tests.

- [x] Add a test that fails when a file holding tests has a name pytest
      will not collect. Asked for by Mark while the renames were being
      made. With only `*_test.py` collected, a test written into
      `test_brand.py` is never run and nothing says so: the suite
      passes with one file fewer. `tests/test_file_names_test.py` reads
      every Python file under `backend/app/`, `backend/tests/`,
      `backend/scripts/` and `backend/alembic/`, and fails on any that
      defines a test and does not end `_test.py`. It reads the syntax
      tree and not the name alone, because a source file may start with
      `test_` and hold no tests, as `compat_harness_endpoints.py` once
      did. Planting a `test_zz_probe.py` made it fail by name; removing
      it made it pass.

## Phase 7: Turn the Bandit scan on, and deal with what it reports

Added on 9 October 2026 at Mark's request, after Phase 1 found the scan
had never run. It is here because that is where it was found, not
because it depends on the tests moving: it can be done at any point.

Run as it was meant to be, skipping tests, Bandit reports 89 findings in
the backend: 49 medium and 40 low, none high. The command that produced
the list, for anybody repeating it, is `bandit -r backend -x
'backend/tests,backend/conftest.py,*_test.py'`.

- [x] Triage before fixing: read each finding and sort it into a real
      defect to fix, a false alarm to mark, or a rule that does not fit
      this codebase and should be switched off for everybody. With the
      migrations left out (the next step) there were 57. The verdict for
      each group:

      - **B113, a web request with no timeout: 7, all real.** Every
        request in `backend/app/ehrbase_client.py`. Fixed.
      - **B608, a query built from a string: 2, both real.** The two in
        `backend/app/ehrbase_client.py` wrote an EHR id into the AQL
        text. The id came from EHRbase's own answer and not from a user,
        so nothing could be exploited today, but nothing in the code
        said so. Fixed, and not marked.
      - **B101, an `assert` in a script: 1, fixed.**
        `backend/scripts/generate_vapid_keys.py` now exits with a
        message, since Python run with `-O` drops an `assert`.
      - **B404, the line `import subprocess`: 4, switched off for
        everybody.** It fires on the import whatever is then run. Each
        call is still checked by B603 and B607.
      - **B603 and B607, running another program: 14, false alarms.**
        `git` and `ffmpeg`, each with a fixed list of arguments and no
        shell. Nothing a user typed reaches the command line.
      - **B105 and B106, something that looks like a password: 12,
        false alarms.** Placeholders in `dump_openapi.py`, the passwords
        of local demo and CI accounts, the word "Pass" in a sample
        result, and in `passport/router.py` an empty `token_hash` that
        is filled in a few lines later.
      - **B704, `Markup` on text: 3, false alarms.** Each is escaped, or
        sanitised by `nh3`, before it is marked safe.
      - **B314 and B405, parsing XML with the standard library: 3,
        false alarms for now.** `upload_template` checks that an
        operator's own template file is well formed, and no route calls
        it. If one ever accepts an upload, use `defusedxml`; the comment
        beside it says so.
      - **B110, an error caught and ignored: 4, false alarms.** Three
        scripts closing a session as they exit, and the advisory unlock
        in `passport/locking.py`, which already explains itself.
      - **B310 and B311: 6, false alarms.** Each URL is the job's own
        configuration. The random numbers choose an avatar's colour, a
        file name suffix, and which questions an attempt draws: none is
        a token or a password.
      - **B108, a path under `/tmp`: 1, false alarm.** A preview a
        person opens on their own machine.

- [x] Decide what to do about the migrations. A merged migration's code
      is frozen (see "Database migrations" in `.claude/rules/backend.md`),
      so the 32 findings there cannot be fixed by changing the SQL.
      **Mark decided on 9 October 2026 to leave
      `backend/alembic/versions/` out of the scan**: a migration is run
      once by the deploy and never with anything a user supplied. The
      reason is written beside the setting, in
      `.github/scripts/ci/run-bandit.sh`.

- [x] Fix the real defects, each with a test where the behaviour
      changes.

      - **A timeout on every EHRbase request.** `REQUEST_TIMEOUT` in
        `backend/app/ehrbase_client.py`: ten seconds to connect and
        thirty for the answer, **Mark's decision on 9 October 2026**. A
        test reads the module and fails if any `requests` call lacks it,
        so a request added later cannot go without.
      - **The EHR id goes to EHRbase as a query parameter.** `query_aql`
        takes a second argument and sends it as `query_parameters`, with
        `$ehr_id` in the query, which is how the openEHR REST
        specification passes a value. The first idea was to check the id
        is a UUID before writing it into the string. A parameter is the
        better fix: it is the same rule the SQL follows, it accepts
        every id the old code did, and no later change to the check can
        reopen it. **Not yet run against a real EHRbase**: the unit
        tests check what is sent, not that EHRbase accepts it. Listing a
        patient's letters is the one journey that uses it, so that is
        what to try when the EHR production work next has a stack up.

- [x] Mark each false alarm where it is, with `# nosec <rule>`. Never a
      bare `# nosec`: that silences every rule on the line, including
      ones added later. **The reason is in a comment above the line and
      not after the mark**, which is a change from what this step first
      said. A reason on the same line makes the line too long, and Black
      then bends the statement round the comment, moving the mark off
      the line Bandit reads. Where a line already said why it is safe,
      nothing was added.

- [x] Correct the hook in `.pre-commit-config.yaml`. It now runs
      `.github/scripts/ci/run-bandit.sh`, which holds what is scanned
      and what is left out: `backend/tests`, `backend/conftest.py`,
      `*_test.py` and `backend/alembic/versions`.

- [x] Add a check that the scan covered something. The script reads
      "Total lines of code" from Bandit's report and fails below 10,000,
      or when the report does not give a number, whatever Bandit's own
      verdict. The backend is about 45,800. Tested in
      `.github/scripts/ci/run-bandit.bats`.

- [x] Run the same scan in CI, so that a commit made without the hooks
      is still checked. Nothing to add: the fast tier's `pre-commit` job
      already runs every hook over every file, so it had been running
      the broken hook, and passing, all along.

## Phase 8: The routes that hold logic, then the larger modules

The two steps Phase 5 left open, done after Phases 6 and 7 and so
written here. The list of routes comes first because it is small, and
because it says which modules are plain already and can be tested now.

- [x] Record the modules whose logic sits inside a route as candidates
      for pulling it out into plain functions, as `cbac/grants.py` and
      `cbac/practising.py` already do. That is what makes a test of one
      module possible: a route can be tested only through the API, with
      a user, a session and a request built for each case. Measured on
      9 October 2026 by reading every route function under
      `backend/app/` and counting the lines of its body. A route of 40
      lines or more is taken as holding logic of its own; shorter ones
      mostly check, call and return. **Each is its own piece of work
      and none is part of this plan.** Largest first:

      - **`main.py`** - 6,367 lines, 64 routes, 2,636 lines inside
        route bodies, 18 routes of 40 lines or more. `update_user` (294
        lines, 28 branches) and `register` (270 lines, 24 branches) are
        the two to start with: each decides several things in a row,
        and each branch can today be reached only by a full request.
        Then `ci_teaching_sync` (168), `list_users` (159) and
        `create_user_with_cbac` (119).

      - **`features/teaching/router.py`** - 4,244 lines, 38 routes,
        2,485 lines inside route bodies, and 27 of the 38 are 40 lines
        or more, the highest share of any router. `get_learning_content`
        (199), `list_delegates` (189, 17 branches),
        `list_question_banks` (127), `start_assessment` (127) and
        `list_learning_modules` (115, 16 branches). The two listing
        routes work out who may see what, which is the kind of rule
        `features/teaching/access.py` exists to hold.

      - **`features/passport/router.py`** - 4,017 lines, 44 routes,
        1,338 lines inside route bodies, 7 routes of 40 or more. In
        better shape than its size suggests: it has more plain helper
        functions (48) than routes. `request_sign_off` (120) and
        `accept_assessor_invite` (113) are the two long ones.

      - **`org_units/router.py`** - 2,247 lines, 26 routes, 909 lines
        inside route bodies, 9 routes of 40 or more.
        `add_org_unit_member` (120), `get_org_unit` (85),
        `set_org_unit_feature` (77, 10 branches) and
        `grant_and_authorise` (65).

      - **Nothing to do** - `features/teaching/door.py`,
        `feedback/router.py` and the routers of `inbox`, `guides`,
        `marketing`, `analytics` and push each have at most one route
        of 40 lines, and already keep their logic in a module beside
        them.

- [x] Write tests of their own for the larger plain modules. Each was
      exercised only through routes or through another module's test,
      which is cover but not a test of the module in its own right. For
      each, what the route tests already pin down was read first, and
      is not repeated. Nine files, 472 cases, each beside its module:

      - **`messaging_test.py`** - 108. Every refusal, who may read a
        conversation without taking part, and what is sent to FHIR,
        with FHIR replaced by a recorder.
      - **`inbox/sources_test.py`** - 71. Each source's count and its
        lines, the order, the cap on lines, and that no line carries
        the words of a message.
      - **`features/teaching/access_test.py`** - 76.
      - **`features/passport/index_test.py`** - 54, against a small
        store held in memory, so a hand-made folder can be planted.
      - **`features/passport/blobs_test.py`** - 45, on a real
        temporary folder.
      - **`features/passport/locking_test.py`** - 22. The unit suite is
        SQLite, which has no advisory locks, so these check which
        statements are sent and in what order. Whether a second writer
        really waits is not tested.
      - **`cbac/audit_test.py`** - 28, **`cbac/grants_test.py`** - 30
        and **`org_units/relations_test.py`** - 38.

- [x] Decide what to do about what the new tests turned up, and do it.
      No source module was changed while the tests were being written:
      a test of how a module behaves is not the place to change how it
      behaves. **Mark ruled on each on 9 October 2026**, and each was
      then fixed with a test:

      - **`create_conversation` wrote to FHIR, then could fail** - it
        never checked `participant_ids`, so an id that is no user, or
        one given twice, raised after the Communication was in FHIR,
        leaving it there with no row of ours. Now everybody named is
        looked up before the FHIR write, an unknown id is refused as
        `UserNotFound`, and somebody named twice joins once.

      - **`passport_write_lock` was called nowhere** - `locking.py`
        said writes to one passport happen one at a time, and no write
        took the lock. Ruled: wire it in. It is now a dependency of the
        whole passport router, `_lock_the_passport_being_written`, so
        every request that is not a read and names a passport in its
        path takes that passport's lock, and a route added later is
        covered without anybody remembering. Answering a logbook
        confirmation names a request and not a passport, so it calls
        the lock itself. **The lock changed kind as it went in**: from
        one held by the connection and released by a second statement,
        to one held by the transaction (`pg_advisory_xact_lock`) and
        released by the commit or rollback. A request is one
        transaction, so that is the span wanted, and a pooled session
        cannot promise that its release goes down the connection that
        took the lock. The option not to wait went with it, having no
        caller. **Only what is sent is tested**: the unit suite is
        SQLite, where the lock does nothing. That two writers really
        queue is for the E2E run, on Postgres, to show by not failing.

      - **A reply did not move a conversation up the list** -
        `send_message` changed the conversation's row only when its
        status was `new`. It now sets `updated_at` on every message.

      - **A stray folder stopped the passport index rebuilding** - a
        folder or file made by hand under `sign-offs/` or
        `certificates/`, with a name that is not a date and a slug,
        raised `PassportPathError`. Ruled: ignore it, as the comment
        there already promised.

      - **`unseeded_profession_competencies` names people who had a
        competency taken away on purpose** - ruled: removed and missing
        are the same thing. The behaviour stands, the test pinning it
        stays, and the docstring, which described removal rows that no
        longer exist, now says so.

      - **`settle_enrolments` did nothing, silently, for somebody who
        belongs nowhere under the organisation** - ruled: in medicine
        you need to be somewhere to do anything, so you need to belong
        to an org unit. It now raises `BelongsNowhere` before anything
        is written, and the user form's route answers 422. Ending every
        enrolment still needs no membership, so somebody who has left
        can be taken off what they were on.

      - **`TestTheSoldCompetency`** - renamed
        `TestPassportWriteIsGrantedByOneManager`.

      - **Smaller, fixed without a ruling** - `add_participant` refuses
        a conversation that does not exist;
        `enrol_everyone_with_a_place` checks `source` first, on a dry
        run too; `BlobStore.put` removes its `.partial` file when the
        last move fails; and the docstring of `sync_competency_rows`
        now says when a change of profession closes rows, and that a
        current row of any source counts as holding.

## Decisions

- **By subject, not by counting imports** - the first wording of the rule
  was "a test that covers two or more modules stays". Counting is the
  wrong test: many tests import a second module only to stub it. What
  decides it is whether one module is what the test is about.

- **A file beside the module, not a `tests/` folder beside it** - both
  are standard pytest layouts. A subfolder keeps the test one click away
  and out of sight, which is the problem being solved.

- **`brand_test.py`, not `test_brand.py`** - for the sorting. It also
  gives one unambiguous pattern for a test, which the `.dockerignore`
  rule, the image check and the tool exclusions rely on. The tests that
  stayed in `backend/tests/` kept their `test_` prefix at first, and
  Phase 6 renames them too: two conventions was one more than was
  needed.

- **Two places is accepted, two names is not** - some tests beside the
  source and some in `backend/tests/`. It is the right split, and the
  rule for which is which is written above. The alternative, forcing behaviour
  tests next to a module, would put them somewhere arbitrary.

- **Size was not a reason to hold back** - about 200 files is a quick
  mechanical move. The work is in deciding where each belongs, which is
  why it goes a folder at a time with a stop after the first.

- **Half the tests go through the API on purpose** - 98 of the 203 files
  make requests with a test client. Much of the logic is in routes, and
  an access rule exists only where a route, a competency and a
  membership check combine. This plan does not try to turn those into
  unit tests.
