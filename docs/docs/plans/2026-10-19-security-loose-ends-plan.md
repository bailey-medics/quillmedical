# Security loose ends plan

Four small pieces of security work, each independent of the others and of
anything waiting to merge, gathered so they land as one series rather than
being forgotten one at a time. One closes an assumption the job callbacks
plan leans on: the load balancer refuses `/api/ci/` because every route
under it is a job's report, and nothing today enforces that. The others
come from `todo.md`: a page that fetches every patient to show a count, a
`security.txt` the procurement checklist asks for, and a Dockerfile item
that turned out to be done already.

Built as units on the `security` stack, above #2133, so `just stack-watch`
keeps the whole series in one view. None of them depends on the three
pull requests below them, so they can be reviewed in any order and merged
once those have gone in.

## Phase 1: Every `/api/ci/` route asks for a job's identity

- [x] Add a test class to `backend/tests/every_route_is_guarded_test.py`
      that walks `served_routes(app)` and asserts that every route whose
      path starts `/api/ci/` has `app.deps.require_job_identity` among
      what it asks (`_asks(route) & SERVICE_CALLER`), and that no route
      outside that prefix does. The Cloud Armor rule from Phase 5 of the
      job callbacks plan refuses the prefix from the internet on the
      strength of that being true, and the five routes there today
      (transcode, caption, no-speech, poster, scan) are true by
      convention only. With this, a sixth that forgets the guard fails
      CI rather than shipping as a public route behind a rule that
      assumes it is not. Give it the usual floor: at least four such
      routes found, so a wrong prefix cannot pass vacuously. Plant the
      fault once to see it go red, as `.claude/rules/workflows.md` asks
      of a negative assertion, then take the plant out.

## Phase 2: The admin page counts patients instead of fetching them

- [x] Add `total: int` to `PatientsListOut` in
      `backend/app/schemas/patients.py`, set in `list_patients` in
      `backend/app/patients/router.py` to the length of what
      `patients_shown` returns, so the count respects the caller's
      organisations exactly as the list does. Additive, so no
      compatibility decision is needed. Test it beside the existing
      `list_patients` tests: the total matches the list, and is 0 with
      `fhir_ready` false.

- [x] Add `GET /api/patients/count` in the same router, guarded as
      `list_patients` is (`DEP_REQUIRE_CLINICAL`, `DEP_CURRENT_USER`),
      answering `PatientCountOut(total, fhir_ready)` and nothing else.
      The admin page wants a number, and a number should not come with
      every patient's name and identifiers attached, however the
      frontend then discards them. The `total` on the list is for
      callers that already hold the list.

- [x] In `frontend/src/pages/AdminPage.tsx`, replace the `/patients`
      fetch and the `patients` state with a call to `/patients/count`,
      and give `components/admin/Admin.tsx` a `patientCount: number`
      prop in place of `existingPatients`, which nothing else on that
      page reads. Update the stories and tests for both; the stat card
      shows the number as before and the 503-while-FHIR-is-off path
      keeps its present behaviour. Tick the item in `todo.md`.

## Phase 3: A `security.txt`

- [ ] Add `frontend/public/.well-known/security.txt`, served by the
      frontend container at `/.well-known/security.txt` because Vite
      copies `public/` as is and the load balancer sends every non-API
      path to the frontend. RFC 9116 requires `Contact` and `Expires`;
      give `Contact: mailto:info@quill-medical.com`, the address the
      legal documents already name, `Expires` one year on,
      `Preferred-Languages: en`, and `Canonical:
      https://app.quill-medical.com/.well-known/security.txt`. No
      `Policy:` line until a disclosure page exists to point at. Source:
      [RFC 9116](https://www.rfc-editor.org/rfc/rfc9116).

- [ ] A test in `frontend/src/` that reads the file and checks the two
      required fields are present and `Expires` is in the future, so the
      file cannot quietly lapse: an expired `security.txt` is treated as
      absent. Add a calendar note in `todo.md` for its renewal. Tick the
      `security.txt` item there.

## Phase 4: Dev dependencies and the production image

- [ ] Already done: `backend/Dockerfile` installs with
      `poetry install --only main`, so the runtime image carries no dev
      group. The `todo.md` item saying otherwise is stale; strike it,
      naming the line that does it.

## Decisions

- **A count route as well as a `total` field** - the field alone would
  let the admin page stay on `/patients` and read one number from a
  payload of names, which is the thing being removed. A route that can
  only answer with a number cannot leak the list by accident.

- **`info@` not a new `security@`** - a new mailbox is a new thing to
  monitor, and `info@quill-medical.com` is already read and already
  named in the legal documents. The address can change in the file
  later without anything else moving.
