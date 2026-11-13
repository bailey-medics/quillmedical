# Framework fixtures

The frameworks the tests and the end-to-end stack sync from, so no test
depends on a publisher's framework repository.

Each file is a framework file in the shape a framework repository holds.
They are fixtures: a test that names a competency here names a fixture.
The aim is that every fixture is a made-up framework, `quill_test` or
`quill_2_test`, so no test changes when a real framework does. The four
copies of real frameworks still here are on their way out; see the one
framework per repository plan.

## Where they come from

Each made-up framework lives in a testing repository of its own, and is
changed there by a pull request:

- **`quill_test`**, the full shape, with levels and scopes, in
  [`bailey-medics/quill-medical-framework-testing`](https://github.com/bailey-medics/quill-medical-framework-testing).
- **`quill_2_test`**, the plain shape, in
  [`bailey-medics/quill-medical-2-framework-testing`](https://github.com/bailey-medics/quill-medical-2-framework-testing).

Two repositories, because a framework repository holds one framework,
and because Quill's integration test can then check that one repository
cannot publish the other's framework.

This folder is a copy, so the unit tests, Storybook and the end-to-end
stack read the fixtures offline.

1. Merge the change in its testing repository.
2. Run `just framework-fixtures-refresh` here. It copies each framework
   from both repositories' `main`, and writes each commit to `SOURCE`.
   To copy a branch whose pull request has not merged, name it:
   `just framework-fixtures-refresh https://github.com/bailey-medics/quill-medical-framework-testing.git#feature/x https://github.com/bailey-medics/quill-medical-2-framework-testing.git`.
3. Open a pull request with the result, so the change is reviewed here
   too.

`check-framework-fixtures.sh`, in `.github/scripts/ci/`, fails a pull
request whose fixtures differ from the testing repositories at the
commits in `SOURCE`. So a fixture edited here by hand fails CI.

## Two forms of each framework

- **`<id>.yaml`** is the newest version, for everything that reads a
  framework as it stands.
- **`history/<id>/<version>.yaml`** is every version it has had, read
  from its repository's history as the framework sync reads it. The sync
  refuses a framework whose first stored version is not 1, so anything
  that fills the tables reads this folder, not the newest files.

Read by:

- **`stored_frameworks`** in `backend/conftest.py`, which syncs
  `history/` into a test's tables.
- **`files_catalogue`** in `backend/tests/frameworks.py`, which reads the
  newest files, for a test that never touches the database.
- **`backend/scripts/seed_ci.py`**, which fills the end-to-end stack's
  tables from `history/`.
- **`python -m app.features.passport.sync`**, with no folder, which the
  dev migrate recipe runs, also from `history/`.
- **`frontend/scripts/generate-json-from-yaml.ts`**, which writes the
  newest files to `framework-fixtures.json` for the frontend tests and
  Storybook.
