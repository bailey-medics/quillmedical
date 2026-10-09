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
      reports is dealt with. Phase 6 does both.

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

- [ ] `backend/app/feedback/` and `backend/app/inbox/`.

- [ ] Move the tests of the top-level modules in `backend/app/`, such as
      `security.py`, `config.py` and `organisations.py`, in a pull request
      of their own.

- [ ] Leave the tests of `backend/app/main.py`'s routes in
      `backend/tests/`. `main.py` holds a great many routes, and their
      tests are named for behaviour (`test_admin_user_route_scoping.py`).
      Scores of files beside `main.py` would bury it. They move when
      `main.py` is split by area, each to the router it then belongs to,
      and not before.

- [ ] Leave in `backend/tests/` the tests that only drive the API (44
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

- [ ] Shipping tests would do little harm, since nothing runs them and
      the test-only packages are not installed in the image. They are
      kept out because their fixtures hold strings that look like
      credentials, which a scanner flags, and because "is test code
      deployed?" is easier to answer with a no.

- [ ] Add a check that fails if the built image holds a `*_test.py`, in
      the job that builds it, so the rule cannot stop working unnoticed.

## Phase 5: Find the modules with no test of their own

- [ ] List every module under `backend/app/` with no `_test.py` beside
      it. After the move this is a directory listing. The survey found 24
      modules that no test imports at all.

- [ ] Sort the list into three kinds. **Plain modules with no test**
      should get one: `feedback/replies.py`, `feedback/labels.py`,
      `features/passport/entitlements.py`, `messaging.py`, `push.py` and
      `push_send.py` were the candidates on 9 October 2026, unchecked.
      **Routers** are tested through the API and need none of their own.
      **Modules whose logic sits inside a route** cannot be tested alone
      as they stand.

- [ ] Write the missing tests for the first kind.

- [ ] Record the third kind as candidates for pulling logic out of
      routes into plain functions, as `cbac/grants.py` and
      `cbac/practising.py` already do. That is what makes a test of one
      module possible, and it is part of the review this plan came out
      of. Each is its own piece of work and not part of this plan.

## Phase 6: Turn the Bandit scan on, and deal with what it reports

Added on 9 October 2026 at Mark's request, after Phase 1 found the scan
had never run. It is here because that is where it was found, not
because it depends on the tests moving: it can be done at any point.

Run as it was meant to be, skipping tests, Bandit reports 89 findings in
the backend: 49 medium and 40 low, none high. The command that produced
the list, for anybody repeating it, is `bandit -r backend -x
'backend/tests,backend/conftest.py,*_test.py'`.

- [ ] Triage before fixing: read each finding and sort it into a real
      defect to fix, a false alarm to mark, or a rule that does not fit
      this codebase and should be switched off for everybody. Record the
      verdict for each group in this plan. The groups, largest first:

      - **B608, SQL built from a string: 34.** 32 are in
        `backend/alembic/versions/` and 2 in `backend/app/ehrbase_client.py`.
        The two in the EHRbase client are the ones to read with care:
        they build a query that goes to the clinical record store.
      - **B105 and B106, something that looks like a hard-coded
        password: 12.** 7 are the placeholder settings in
        `backend/scripts/dump_openapi.py`, which are meant to be
        placeholders. Check the one in `backend/app/features/passport/`.
      - **B113, a web request with no timeout: 7**, all in
        `backend/app/ehrbase_client.py`. Likely real: a request with no
        timeout can hold a worker for ever if EHRbase stops answering.
      - **B603, B607 and B404, running another program: 18**, in the
        passport and teaching features and `transcode_cli.py`. These run
        `git` and `ffmpeg`. Check that nothing a user typed reaches the
        command line.
      - **B704, `Markup` on text that may not be safe: 3**, in
        `backend/app/email/previews.py`, `backend/app/email/render.py`
        and the teaching email templates. Each marks text as safe HTML
        after escaping or sanitising it; confirm that for each one.
      - **B314 and B405, parsing XML with the standard library: 3**, in
        `backend/app/ehrbase_client.py`. Check where the XML comes from.
      - **B110, an error caught and ignored: 4.**
      - **B310 and B311, opening a URL and a random number generator
        that is not for secrets: 6.** Check none of the random numbers
        is a token or a password.
      - **B101 and B108: 2**, an `assert` and a path under `/tmp`, both
        in scripts.

- [ ] Decide what to do about the migrations. A merged migration's code
      is frozen (see "Database migrations" in `.claude/rules/backend.md`),
      so the 32 findings there cannot be fixed by changing the SQL. A
      comment may still be edited, so each could carry a `# nosec` with
      its reason; or `backend/alembic/versions/` could be left out of
      the scan, since a migration is run once by the deploy and never
      with anything a user supplied. The recommendation is to leave the
      folder out and say why beside the setting.

- [ ] Fix the real defects, each with a test where the behaviour
      changes. A timeout on the EHRbase requests is the likeliest
      candidate, and belongs with whatever the EHR production work
      decides a sensible wait is.

- [ ] Mark each false alarm where it is, with `# nosec <rule>` and a
      few words saying why it is safe. Never a bare `# nosec`: that
      silences every rule on the line, including ones added later.

- [ ] Correct the hook in `.pre-commit-config.yaml`: `-r` for `r`, and
      leave out `backend/conftest.py` and `*_test.py` as well as
      `backend/tests`, or every `assert` in a test that sits beside its
      module is reported. This goes in last, in the same change as the
      final fix, so that no commit in between fails on findings still
      being worked through.

- [ ] Add a check that the scan covered something. A hook that reports
      "Total lines of code: 0" and passes is how this went unnoticed for
      a year: fail the hook, or a test, when Bandit scans no files.

- [ ] Run the same scan in CI, so that a commit made without the hooks
      is still checked.

## Decisions

- **By subject, not by counting imports** - the first wording of the rule
  was "a test that covers two or more modules stays". Counting is the
  wrong test: many tests import a second module only to stub it. What
  decides it is whether one module is what the test is about.

- **A file beside the module, not a `tests/` folder beside it** - both
  are standard pytest layouts. A subfolder keeps the test one click away
  and out of sight, which is the problem being solved.

- **`brand_test.py`, not `test_brand.py`** - for the sorting. It also
  gives one unambiguous pattern for "a test that lives in the
  application", which the `.dockerignore` rule and the tool exclusions
  rely on. Tests that stay in `backend/tests/` keep their `test_` prefix.

- **Two styles side by side is accepted** - some tests beside the source
  and some in `backend/tests/`. It is the right split, and the rule for
  which is which is written above. The alternative, forcing behaviour
  tests next to a module, would put them somewhere arbitrary.

- **Size was not a reason to hold back** - about 200 files is a quick
  mechanical move. The work is in deciding where each belongs, which is
  why it goes a folder at a time with a stop after the first.

- **Half the tests go through the API on purpose** - 98 of the 203 files
  make requests with a test client. Much of the logic is in routes, and
  an access rule exists only where a route, a competency and a
  membership check combine. This plan does not try to turn those into
  unit tests.
