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
- **Check the page, never the API.** No `send(...)`, `read(...)` or
  `page.request` in a test body. A saved setting is checked by opening
  the page it changes. Where a save gives no sign that it has landed,
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
- **One exception: making the user accounts.** `createAccount` in
  `fixtures/api.ts` makes the people a journey acts on. Account making is
  the admin pages' job, walked by their own specs, and doing it on screen
  in every test would make the suite far slower. What those people then
  do, a passport included, is on screen.
- **Watching the browser's own request is not calling the API.** A test
  may wait for a response the page itself made, such as a file loading in
  a frame, to check what the person was shown. It never sends one.

The passport specs follow this throughout; see Phase 7 of
`docs/docs/plans/2026-10-31-passport-landing-views-plan.md`. Some older
teaching specs still set up or check through the API. Write new and
changed specs this way, and move an older one across when it is next
touched.

Mark, 1 November 2026: "The whole point of playwright is to test
frontend UX matters. API checks are for unit testing and integration
testing."
