# Accessibility testing log

One entry per test run, newest first: the date, the tool and browser,
which [journey](journeys.md), and what was found. This log is the
evidence the NHS DTAC's accessibility section (D1) asks for, and the
"how we tested" part of the accessibility statement cites it.

- Record a failure even when it is fixed the same day, with the fix.
- Record a journey as untested, with the reason, rather than leaving it
  out.
- People with access needs who test the service are recorded by the
  access need, never by name, with their consent noted.

## Entry format

- **Date** – the day of the run.
- **Tester** – who ran it, or "automated".
- **Tool** – screen reader, keyboard only, zoom level or test suite.
- **Browser and device**
- **Journey** – which of the four, or a named page.
- **Result** – pass, fail or partial, per step where it is not a pass.
- **Findings** – what failed, and the pull request that fixed it.

## Runs

### 24 September 2026 – automated keyboard journeys

- **Tester** – automated, `frontend/e2e/tests/keyboard.spec.ts`
- **Tool** – Playwright, keyboard only (Tab, typing, Enter)
- **Browser and device** – Chromium, desktop, 1280 × 720
- **Journey** – 1 (log in with two-factor authentication), and reaching
  Settings through the side navigation
- **Result** – pass, after the fixes below
- **Findings** – the side navigation was not reachable from the keyboard
  at all; the closed navigation drawer left invisible tab stops and a
  modal dialog in the page; the authenticator code field appeared
  without focus. All fixed in #1091.

### 24 September 2026 – automated focus walk

- **Tester** – automated, a Playwright script over the layout stories
- **Tool** – keyboard only, sixty Tab presses per story
- **Browser and device** – Chromium, desktop 1280px and mobile 390px
- **Journey** – every layout and teaching-layout story
- **Result** – pass: no focused element hidden behind the sticky ribbon
  (WCAG 2.4.11)
- **Findings** – twenty-five routes had no level 1 heading. Fixed in
  #1087.

### Not yet run

- **Journeys 1 to 4 with VoiceOver** – Safari on macOS, and on iOS.
- **Journeys 1 to 4 with NVDA** – Firefox on Windows.
- **Journeys 1 to 4 with TalkBack** – Chrome on Android.
- **Journeys 1 to 4 at 200% and 400% zoom.**
- **Journey 3 with people with access needs** – a screen reader user and
  someone with a motor impairment or cognitive difference.
- **Journeys 1 to 4 again, for the envelope in the top ribbon** – added
  on 4 October 2026 by the
  [waiting on me inbox plan](../../plans/2026-10-04-waiting-on-me-inbox-plan.md).
  Every journey passes through the ribbon, which now ends in an "Inbox"
  button whose name carries how many things are waiting. Check that it
  is reached and announced with its count, that it does not come between
  the skip link and the page, and that the Inbox page's two tables read
  in order. On journey 3, check the ribbon holds the exam's timer alone.
- **Journeys 1 to 4 again, for the Guides link in the navigation** –
  added on 5 October 2026 by the
  [in-app guides plan](../../plans/2026-10-05-in-app-guides-plan.md).
  Every journey passes through the side navigation, which now holds a
  "Guides" link for anybody with a guide to read, with the open guide
  named beneath it. Check it is reached in order and announced, and on
  journey 1 that "How to join a course" under the login form is reached
  after "Don't have an account? Register".
- **Journey 4 again, for confirming a logbook entry** – added on 7
  October 2026 by the
  [passport registrar portfolios plan](../../plans/2026-10-07-passport-registrar-portfolios-plan.md).
  A supervisor asked to confirm a logbook entry opens it from the Inbox,
  as an assessor opens a sign-off, and the side navigation names the
  page "Confirm entry" beneath Passport. Check that link is reached and
  announced, that the tickbox "This happened as recorded here" is
  announced with its description, and that "Confirm entry" is announced
  as unavailable until the box is ticked.
- **A guide page, by itself** – not one of the four journeys. Open
  `/guides/join-a-course` signed out and
  `/guides/add-a-delegate-by-hand` signed in. Check the headings read in
  order under one h1, that each numbered step is announced with its
  number, that every screenshot's alt text says what the picture shows,
  and that a picture which has not loaded reads as its alt text. Signed
  out, check the page has a main landmark and that "Sign in to Quill" is
  reached last.
- **Journey 1 again, for registration and verification** – added on
  5 October 2026 by phase 8 of the
  [in-app guides plan](../../plans/2026-10-05-in-app-guides-plan.md).
  The second registration step now goes back to the first when it is
  opened without it, with no message: check a screen reader user who
  refreshes there is told where they have landed by the page's title.
  The failed-verification page now says to sign in for a new link:
  check the message and its link are read together and in that order.
- **Journey 4 again, for the guide links on the passport** – added on
  5 October 2026 by phase 12 of the
  [in-app guides plan](../../plans/2026-10-05-in-app-guides-plan.md).
  "My passport" and the sign-off page each carry a "Guide: …" link under
  their title. Check each is reached straight after the page's heading
  and before the page's own controls, and that following it and coming
  back leaves a half-filled sign-off form as it was.
- **JAWS and Dragon** – deferred to a commissioned audit.
- **Journeys 1 to 4 on a phone, by touch** – the
  [touch target sizes plan](../../plans/2026-09-28-touch-target-sizes-plan.md)
  enlarged the navigation drawer, the top ribbon's buttons and every form
  field below 640px, which all four journeys pass through. The VoiceOver
  and TalkBack runs above should be done on a phone as well as a desktop,
  so that they cover these sizes, and checked for the 44px minimum of
  WCAG 2.5.5.
- **Journeys 2 and 3, the side navigation** – the
  [appraisal periods plan](../../plans/2026-09-29-appraisal-periods-plan.md)
  gave Settings its first nested link, "CPD date ranges", shown while
  `/settings/cpd-date-ranges` is open. Journey 2 opens the side navigation
  from the ribbon, and journey 3 uses the teaching sidebar, which renders
  the same Settings entry. Check that the nested link is announced as
  inside Settings and as the current page, and that the navigation
  drawer's focus trap still holds with it there.
- **Journeys 1 and 3 as a teaching admin** – the
  [manage teaching competency plan](../../plans/2026-09-30-manage-teaching-competency-plan.md)
  shows teaching admins the Admin entry in the side navigation, without
  Patients, and lets a sign-in with a link into `/admin` land there.
  Journey 1 passes through that redirect and journey 3 through the
  teaching sidebar, which renders the same navigation. Walk both signed in
  as a `teaching_admin`: check the Admin entry and its children are
  announced, and that no Patients entry is reached. No journey yet covers
  the admin pages themselves.
- **Journeys 2 and 3, the side navigation, with the Safety entry** – the
  [safety feature mock-up plan](../../plans/2026-10-02-safety-feature-mock-up-plan.md)
  adds a Safety entry after Passport, shown where the `safety` feature is
  on, with one nested link for the open page of a case (Hazards,
  Incidents and so on) while `/safety/:caseId/<page>` is open. Journey 2
  opens the side navigation from the ribbon and journey 3 uses the
  teaching sidebar, which renders the same entries. Walk both with the
  feature on: check the Safety entry is announced, that the nested link
  is announced as inside Safety and as the current page, and that the
  drawer's focus trap still holds. The safety pages themselves are a
  mock-up with fixture data and no journey covers them.
- **The site page as a teaching admin** – the same plan's Phase 6 makes
  each row of the Sites table on an organisation's admin page a link to
  `/admin/sites/:id` for everybody who can open the page, where it was a
  link for operators only. No journey covers the admin pages, so this is a
  named page rather than a journey: by keyboard and screen reader, check
  that a site row is reached and announced as something that opens, and
  that the site page's heading is read on arrival.
- **Journey 3, and the pages that let somebody into teaching** – the
  [teaching access plan](../../plans/2026-10-04-teaching-access-results-modules-and-enrolment-plan.md)
  changes who is offered the Teaching entry in the side navigation, which
  now needs the `view_teaching_results` competency as well as the
  feature, and shows the 404 page for a lesson somebody may not have.
  Walk journey 3 as a delegate enrolled on one module: check the module
  list names only that module, and that a lesson they are not enrolled on
  is announced as not found. No journey covers the admin pages, so these
  are named pages: on the user form, check the Enrolment step is
  announced in the stepper, that each module's tick box is announced
  with its organisation, and that an end date field appears and is
  reached after ticking; and on a member's page at a site, check the
  "Save enrolment" button is told apart from "Save changes", and that
  the line under a module saying whether they can enter it is read
  with that module.
