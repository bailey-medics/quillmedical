# Framework fixtures

The frameworks the tests and the end-to-end stack sync from, so no test
depends on a publisher's framework repository or on the frameworks still
living in `shared/competency-definitions/`.

Each file is a framework file in the shape a framework repository holds.
They are fixtures: they need not follow the real frameworks when those
change, and a test that names a competency here names a fixture.

## Where they come from

The fixtures are changed in the testing repository,
[`bailey-medics/quill-medical-framework-testing`](https://github.com/bailey-medics/quill-medical-framework-testing),
by a pull request there, and this folder is a copy. It stays a copy so
the unit tests, Storybook and the end-to-end stack read them offline.

1. Merge the change in the testing repository.
2. Run `just framework-fixtures-refresh` here. It copies each file in the
   testing repository's `frameworks/` folder, except its own test
   framework `quill_test.yaml`, and writes the commit to `SOURCE`.
3. Open a pull request with the result, so the change is reviewed here
   too.

`check-framework-fixtures.sh`, in `.github/scripts/ci/`, fails a pull
request whose fixtures differ from the testing repository at the commit
in `SOURCE`. So a fixture edited here by hand fails CI.

Read by:

- **`stored_frameworks`** in `backend/conftest.py`, which syncs them
  into a test's tables.
- **`files_catalogue`** in `backend/tests/frameworks.py`, for a test that
  never touches the database.
- **`backend/scripts/seed_ci.py`**, which fills the end-to-end stack's
  tables from them.

See Phase 7 of
`docs/docs/plans/2026-11-01-passport-record-and-catalogue-plan.md`.
