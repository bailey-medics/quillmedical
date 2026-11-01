---
paths:
  - "frontend/e2e/**"
---

# End-to-end test conventions

**An end-to-end test does what a person does, through the screen, and
checks what a person would see.** Playwright is here to test the
frontend as it is used. Checking the API belongs in the backend unit and
integration tests, which are faster and say exactly which route broke.

- **Set up through the page a person would use.** A logbook entry is
  added from the competency's page, a sign-off is asked for there, a
  competency is granted on the admin edit page. A shared helper in
  `fixtures/` keeps each one in a single place, so a changed form is
  mended once.
- **Check the page, never the API.** No `send(...)`, `read(...)`,
  `createAccount`, `page.request` or `waitForResponse` anywhere in a
  test or its fixtures. A saved setting is checked by opening the page
  it changes. Where a save gives no sign that it has landed,
  open that page until it shows the change, as `openUntil` in
  `fixtures/passport.ts` does, rather than asking the API.
- **A refusal is what the person meets.** The button is not there, the
  address shows "Not found" or an error, or the record appears nowhere.
  Show the thing to the person it belongs to first, so its absence
  elsewhere proves the guard rather than a record that was never made.
- **The API's half of a refusal is a backend test.** Before taking an API
  check out of a spec, find the backend test that makes the same refusal,
  and name it in a comment beside the screen check. Where none exists,
  write it in the same change.
- **No exceptions for anything a person does, setup included.** The people a journey acts on are
  added by an admin on the add-user form, as `addOnTheForm` in
  `fixtures/passport.ts` does. A shortcut through the API, however
  quick, is how a part of the app goes untested: making accounts that
  way hid that nothing walked a passport admin through the form.
- **The one thing that is not a person: an outside job's report.** No
  person reports a malware scan or a finished video, and there is no
  screen for it. A test plays that job's part and posts what it would
  report, to the job callback routes under `/api/ci/` only, signed as
  the job: `fixtures/scanJob.ts` and `fixtures/mediaJobs.ts`. Mark
  agreed this on 1 November 2026. It never covers anything a person
  does.

The passport specs follow this throughout; see Phases 7 to 9 of
`docs/docs/plans/2026-10-31-passport-landing-views-plan.md`. Other specs
still use the API, and Phase 9 moves them across. If anything else
seems impossible on screen, ask a person rather than deciding.

Testing the API is the backend unit and integration tests' job. An
end-to-end test never does it.

Mark, 1 November 2026: "The whole point of playwright is to test
frontend UX matters. API checks are for unit testing and integration
testing." And, when making accounts through the API was kept as an
exception: "It is dangerous to give you exceptions for using APIs. So do
not do ever. This is a E2E test after all."
