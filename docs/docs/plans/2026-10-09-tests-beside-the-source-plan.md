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

- [ ] **Found on the way, and not fixed here: the Bandit hook scans
      nothing.** Its arguments in `.pre-commit-config.yaml` are `r`,
      `backend`, `-x`, `backend/tests`. The first is `r` and not `-r`, so
      Bandit looks for a file called `r`, is given the `backend` folder
      without being told to go into it, and reports "Skipping directory
      (backend), use -r flag to scan contents" and "Total lines of code:
      0". It has passed on every commit by checking no code at all. Run
      as it was meant to be, with `-r backend -x backend/tests`, it
      reports about 75 findings: 34 of possible SQL built from strings,
      7 of `requests` calls with no timeout, 7 each of two subprocess
      checks, and a scatter of others. Many will be false alarms, such
      as SQL in migrations, but nobody has looked. Turning it on is a
      piece of work of its own, a triage of those findings, and belongs
      to Mark to schedule. When it is turned on, exclude
      `backend/conftest.py` and `*_test.py` as well as `backend/tests`,
      or every `assert` in a moved test is reported.

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

- [ ] Stop and look at `backend/app/email/` with Mark before going on.
      This folder is the trial: whether a test beside its module does get
      read, and whether the naming and the split read well, are judged
      here and not assumed.

## Phase 3: Move the rest, a folder at a time

- [ ] Move the self-contained folders next, each as its own pull
      request: `backend/app/cbac/`, `backend/app/marketing/`,
      `backend/app/features/teaching/`, `backend/app/features/passport/`,
      `backend/app/org_units/`, `backend/app/feedback/` and
      `backend/app/inbox/`. A survey on 9 October 2026 found 79 of the
      203 test files import exactly one application module and 58 import
      two or three; most of both groups have one module as their subject
      and move. One folder to a pull request keeps each diff readable and
      lets the rule be corrected as it is applied.

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
