# Teaching E2E coverage plan

The end-to-end suite in `frontend/e2e/` checks Quill's foundations well:
login, navigation, the start-up spinner, caching, PDFs and keyboard use.
Teaching gets seven tests, all against one pinned module from
`respiratory-teaching`. Nothing walks what a teaching admin does all day:
making accounts, inviting people, keeping organisations and sites in
order. Nothing follows a delegate from the public pages to a certificate
either. Those are the two groups EoEETA will put in front of Quill first,
so they are where a fault would cost the most and be noticed last.

The outcome is a Playwright journey for each thing a teaching admin or a
teaching delegate sees and does. Each journey runs in the CI heavy tier
against the `compose.ci.yml` stack, as `just e2e` does today. The lists
below are not finished: Mark is still adding to the delegate list, and
each new item becomes a step in the phase it belongs to.

## Phase 1: Seed the people and places the journeys need

- [x] Give `backend/scripts/seed_ci.py` everybody the journeys log in as.
      `admin` (superadmin) and `educator` exist already, and so do
      `usermanager` (a `teaching_admin` given `manage_users`) and the
      `exam_*` sitters. Departed from the plan: no new `ta_*` accounts.
      `educator` is already the plain teaching admin, holding
      `manage_teaching` and not `manage_users`, because `User.__init__`
      writes the `teaching_admin` profession's competencies as rows. Every
      browser project already starts signed in as `educator`, so the
      teaching admin journeys need no login at all, which keeps them clear
      of the login rate limit. The collision the per-browser accounts were
      meant to prevent is avoided instead by each journey creating the
      person it edits, named for the browser project and the time, as
      `user-form-practice.spec.ts` already does.

- [x] Seed the places, in `seed_ci.py` (`seed_teaching_admin_places`).
      "CI Teaching Centre" is a site inside "CI Teaching Hospital", with
      `educator` a member. "CI Other Hospital" and its "CI Other Centre"
      are a second tree with no teaching admin in it. Item 9 of Phase 3
      needs that second organisation to prove the TA cannot move a
      delegate there, and items 10 and 12 need the TA's own organisation
      to prove what they may not change.

- [x] Add a sign-in fixture, `frontend/e2e/fixtures/signIn.ts`. Departed
      from the plan: no `storageState` per role. Only the superuser
      journeys sign in as anybody but `educator`, so `signIn(page, who)`
      goes through the form, waiting out a rate-limit refusal, as the
      guides' own helper does. It also names the seeded people and places
      (`PEOPLE`, `PLACES`), so a spec says who it is rather than a
      username.

- [x] Let a journey read an email Quill sends (item 6 of Phase 3, and
      delegate verification later). The CI stack had no mail catcher: the
      guides photograph a pre-rendered email instead. Decided: a new
      setting, `EMAIL_CAPTURE_DIR`, has `send_email` in
      `backend/app/email_send.py` write each dry-run email to a folder as
      one JSON file, and `frontend/e2e/fixtures/mail.ts` reads it for the
      link. It adds no new image or service to keep updated, unlike a mail catcher
      container. The settings refuse it at startup unless
      `BACKEND_ENV` is `testing` and `EMAIL_DRY_RUN` is on, because a
      captured invite holds an address and a link that sets a password;
      `app/config_test.py` pins both refusals. `compose.ci.yml` mounts
      `frontend/e2e/.mail/` at `/e2e-mail`, the one folder both the
      Playwright container in CI and a local `npx playwright` can see. The
      backend runs as its own user, so
      `.github/scripts/ci/prepare-e2e-mail.sh` makes the folder writable by
      anyone before the stack starts, from `just e2e`, the CI job and the
      guide screenshots workflow alike.

## Phase 2: Let a teaching admin delete a site from an organisation

- [x] Check what removal does before widening it. `confirmRemoveSite`
      calls `orgUnits.remove`, which is `DELETE /api/org-units/{id}` in
      `backend/app/org_units/router.py`. That deletes the site, not just its
      link to the organisation, and the route required `manage_users`. Two
      choices: let a scoped manager delete a site under an organisation they
      belong to, or detach the site and leave it standing. Decided: delete,
      as before. A site belongs to one organisation in the tree, so a
      detached one would belong nowhere, and the route already refuses a
      site that still has anything inside it. The route now admits a
      scoped manager and checks the caller through `require_editable`, the
      check updates already use, which refuses an organisation to a scoped
      manager and anybody else's site as not found. `manage_teaching` is
      named nowhere in the route.

- [x] Keep teaching results out of a delete. Found while checking the
      above: `Assessment.org_unit_id` is `ON DELETE CASCADE`, so deleting
      an org_unit somebody sat an assessment at would delete their
      results, which EoEETA keeps for three and a half years after an
      account closes. The route now refuses, 409, any org_unit holding an
      assessment, whoever asks, and says to mark it inactive instead.
      Assessments are normally kept at the organisation rather than its
      sites, so this rarely bites, but no route should be able to empty
      the results table by accident.

- [x] Show the action on the sites table in
      `frontend/src/pages/admin/organisations/OrganisationAdminPage.tsx` to a
      teaching admin. The action and its confirm modal already existed, but
      the column was drawn only for `manage_users` holders
      (`siteActionsColumn`), so a TA never saw it. That is why it looked
      missing.

- [x] Make the confirm modal say the site is deleted, not just removed,
      and name what goes with it. The menu item is now "Delete site", and
      the modal says the site's staff stop being members there, what they
      may practise there is withdrawn, and that it cannot be undone. The
      modal's "Removing\u2026" label, which showed those six characters
      literally because JSX does not unescape an attribute string, is now
      "Deleting…". Backend tests are in
      `backend/tests/manage_teaching_org_unit_routes_test.py`
      (`TestDeletingASite`), replacing the test that said a teaching admin
      could not delete a site. The page has no story; its `.test.tsx`
      covers the warning, cancelling, and a refused delete.

## Phase 3: Teaching admin journeys

Each item is one Playwright test, grouped in specs under
`frontend/e2e/tests/teaching-admin/`. Where an item is a refusal, the test
checks the API as well as the screen: a hidden button proves nothing if
the request behind it still succeeds.

Each item is written as a user story, for a superuser, a teaching admin
(TA) or a teaching delegate (TD), with what the test checks beneath it.

- [x] 1. As a superuser, I want to sign in and reach the pages for
      running Quill, so that I can operate it.
      Tested in `teaching-admin/sign-in.spec.ts`, with item 2. Found on
      the way: the seeded `admin` had the `superadmin` platform role and
      no profession, so no competencies, and the admin area was a 404 to
      them. A real operator is given `superadmin_profession`, as
      `seed_guides.py` gives `guide_operator`, so `seed_ci.py` now does
      the same.
- [x] 2. As a TA, I want to sign in and land on teaching, with admin
      open to me and the operator's pages not, so that I see what is mine
      to run and nothing else.
      Tested: lands on teaching, opens admin, and is shown a 404 on the
      operator's feedback page.
- [x] 3. As a superuser, I want to create a TA account for somebody else,
      so that a teaching partner has someone to run teaching.
      Tested: a teaching admin at "CI Teaching Hospital". Items 3 to 9 are
      in `teaching-admin/accounts.spec.ts`.
- [x] 4. As a TA, I want to create a TA account for somebody else, so
      that I can share running teaching without asking a superuser.
- [x] 5. As a TA, I want to create a TD account with their organisation,
      site, practice and enrolment set, so that they can start a module
      straight away.
      Tested afterwards on the delegate's page at the site: taking modules
      is switched on there, and the module is ticked.
- [x] 6. As a TA, I want to send a new user a join invite, so that they
      can set their own password and sign in.
      Tested: the link in the email sets a password the new user then
      signs in with, in a browser of their own.
- [x] 7. As a TA, I want to deactivate an account, so that somebody who
      has left can no longer sign in.
      Tested: the login form is answered 400 for that account.
- [x] 8. As a TA, I want to change a user's profile, such as their name
      and email, so that their details stay correct.
      Tested through the edit form, and read back from the API.
- [x] 9. As a TA, I want to be unable to move a TD to an organisation or
      site I am not a member of, so that I cannot act outside my own
      places.
      Tested: neither is offered in the form, and a forged
      `PATCH /api/users/{id}` naming either is refused, with the
      delegate's places unchanged afterwards.

      Items 6 to 9 make the account they act on through the API
      (`e2e/fixtures/api.ts`), so each tests its own action rather than
      the user form again. Tables are paged at ten rows, and each run adds
      accounts, so rows are found by searching (`e2e/fixtures/tables.ts`).
- [x] 10. As a TA, I want to be unable to add an organisation, so that new
      organisations are only made by those who operate Quill.
      Tested: no button, a 404 at `/admin/organisations/new`, and
      `POST /api/org-units` for an organisation answered 403. Items 10 to
      23 are in `teaching-admin/places.spec.ts`.
- [x] 11. As a TA, I want to add a new site from the list of sites, so
      that a new member hospital can have delegates.
- [x] 12. As a TA, I want to be unable to change my organisation's
      details, so that only a user manager can reshape it.
      Tested: no edit button on its page, a 404 at its edit page, and
      `PUT /api/org-units/{id}` answered 403.
- [x] 13. As a TA, I want to add staff on my organisation's page, so that
      people can work across the organisation.
- [x] 14. As a TA, I want to remove staff on my organisation's page, so
      that people who have left stop belonging there.
- [x] 15. As a TA, I want to add a site on my organisation's page, so that
      I can sign up a member hospital where I am already looking.
- [x] 16. As a TA, I want to delete a site on my organisation's page,
      after a warning, so that a hospital that has left is taken off
      without my deleting one by mistake.
      Tested through the warning modal from Phase 2, and the site is gone
      from the API afterwards.
- [x] 17. As a TA, I want to edit a site's details, such as its name and
      location, so that they stay correct.
- [x] 18. As a TA, I want to add staff on a site's page, so that delegates
      belong to the hospital they work at.
      Tested as staff, rather than the first role offered, which names
      them clinical lead.
- [x] 19. As a TA, I want to remove staff on a site's page, so that people
      who have left stop belonging there.
- [x] 20. As a TA, I want to open a user from a site's page and switch
      their competencies on and off there, so that I decide what they may
      practise at that site.
      Tested: taking modules is switched on and saved, then switched off
      and saved.
- [x] 21. As a TA, I want to open a user from a site's page and enrol them
      on a module or take them off it, so that I decide which modules they
      can reach.
      Assumed: "reaching" meant the Teaching panel on that page, the one
      control there besides the practice switches. The panel's own comment
      says the separate control for somebody's place at a centre was built
      and removed, so enrolment is what is left to switch.
- [x] 22. As a TA, I want to see only the "All delegates" card on
      `/admin/teaching`, so that I am shown what is mine to use.
- [x] 23. As a TA, I want to see the total number of delegates, the number
      passed, the first-pass rate, and each delegate's result with its
      date on `/admin/teaching/all-delegates`, so that I can follow how my
      delegates are doing.
      `seed_ci.py` now seeds `results_delegate` with a pass yesterday
      (`seed_delegate_result`), so the table has a row before any test
      sits an assessment. The table shows each delegate's latest result
      rather than a best score: that is deliberate, since delegates
      re-pass every three years, so the test checks what is there.

## Phase 4: Getting in, for a teaching admin and a teaching delegate

Specs under `frontend/e2e/tests/getting-in/`. Unless a story names one,
each is tested for both a TA and a TD. An unregistered teaching delegate
(uTD) is somebody who has no account yet. This list is still being
written.

- [x] Serve the public site in the end-to-end stack. The public pages,
      `quill-medical.com`, are a separate Vite build
      (`frontend/public_pages/`, `yarn workspace public-pages build`),
      deployed to GCS by `public-site.yml`, and `compose.ci.yml` does not
      serve them, so no test can open them today. Playwright can test any
      page it can reach, so the gap is the stack, not the tool. Build the
      public pages into the stack and serve them from a second Caddy site
      on their own port. Their buttons are written as
      `https://app.quill-medical.com/...`, because the site is a separate
      build with no access to the app's routes. A test checks each
      button's address is the live one, then follows the same path on
      the stack, so nothing in the public build changes for the tests.

      Built as `public-build` and `public-ci` stages in
      `frontend/Dockerfile`, kept above `prod` so a build with no target
      still makes the app's image. `caddy/public-ci/Caddyfile` serves clean
      addresses and `not-found.html`, as the bucket does. `compose.ci.yml`
      runs it as the `public` service on `E2E_PUBLIC_PORT`, 8081 in CI;
      `just e2e` picks a free port and passes it to Playwright as
      `E2E_PUBLIC_URL`. CI builds, caches and pulls it beside the app's
      two images. `e2e/fixtures/publicSite.ts` answers a request for the
      live app with a page that moves straight on to the same path on the
      stack: a 302 would be simpler, but WebKit refuses a route answered
      with a redirect.

- [x] 1. As a TA or a TD, I want to land on the public page, so that I
      can find out about the teaching before I sign in.
      Tested: the home page and `optical-diagnosis-polyps` load, with no
      uncaught errors and a clean axe scan, light and dark. Stories 1 to 4
      are in `getting-in/public-site-and-sign-in.spec.ts`.
- [x] 2. As a TA or a TD, I want a button on the public page that takes
      me to the app, so that I can get from one to the other without
      typing an address.
      Tested: all three "Log in" links on `optical-diagnosis-polyps`, in
      the header, the menu and the page, point at the app. Following the
      page's own reaches the login page, and the TA and the TD each sign
      in from there.
- [x] 3. As a TA or a TD with valid credentials, I want to sign in, so
      that I can use the app.
- [x] 4. As Quill, I want nobody without valid credentials to be able to
      sign in, so that only people with an account get in.
      Tested for a wrong password, an unknown username, and a TA and a TD
      account that has been deactivated.
- [x] 5. As a uTD, I want to register through the link on the login page,
      so that I can make an account myself.
      A uTD only: a TA is made by somebody else, as Phase 3 tests. Stories
      5 to 9 are in `getting-in/registering.spec.ts`. Registering needs a
      clinical lead holding the post at a site under an organisation that
      has opened the module to registration, so `seed_ci.py` now opens
      the seeded module to registration and appoints `ci_lead` clinical
      lead of "CI Teaching Centre" (`seed_clinical_lead`), as
      `seed_guides.py` does for its own lead. Found on the way:
      registration refuses an address on a reserved name such as `.test`,
      which the accounts an admin makes are allowed, so a registering
      delegate uses `example.com`. Nothing is sent: the stack captures it.
- [x] 6. As a uTD, I want a "Register" button next to "Log in" on
      `optical-diagnosis-polyps`, so that I can join straight from the
      page that tells me about the module.
      The button does not exist yet: add it to
      `frontend/public_pages/src/pages/optical-diagnosis-polyps.tsx`,
      pointing at `https://app.quill-medical.com/register`, then test it
      takes a uTD to the register page. Added beside the "Log in" in the
      page's own "Taking part" section, outlined like the buttons after
      it, rather than in the header shared by every public page: the
      register page asks for this module's clinical lead, so the button
      belongs on the module's page. The public pages have no stories or
      unit tests of their own; the end-to-end test is what checks it.
- [x] 7. As Quill, I want a uTD who picks the wrong module, or gives an
      email that is not a clinical lead's for it, to be unable to
      register, so that only delegates their lead can vouch for get in.
      Tested for each mistake on its own. A lead's address nobody holds:
      the register page says "Clinical lead not found" and goes no
      further. A wrong module: the register page offers only modules open
      to registration, so the stack has no wrong one to pick, and the
      test asks the API by hand instead. The lead check answers not
      valid, registration is refused, and no account is made.
- [x] 8. As a uTD, I want an email when I register, whose link confirms my
      address and lets me into the app, so that I can start once I have
      shown the address is mine.
      Tested with the captured email from Phase 1: following its link
      verifies the address, and the delegate then signs in.
- [x] 9. As Quill, I want a uTD who never follows the link in that email
      to be unable to get into the app, so that nobody gets in on an
      address they do not own.
      Tested: signing in before following the link is answered 403,
      `email_not_verified`, and the delegate is told to verify their
      address.

### Forgot password, following OWASP

Decided on 2026-10-16. The forgot password page says "Check your inbox"
to everybody, so it never shows whether an address has an account, and
the email says what is true. This is the OWASP Forgot Password Cheat
Sheet's advice: the same answer on screen for every address, and the
detail only where the owner alone can read it. Today
`POST /api/auth/forgot-password` in `backend/app/main.py` already answers
the same for everybody, but sends nothing to an address with no account,
and a reset leaves an unconfirmed address unconfirmed. Both change here,
then four stories test every case.

- [x] Email an address with no account, from `forgot_password` in
      `backend/app/main.py`: nobody has a Quill account with this
      address, and a link to register. A new template beside
      `password_reset.html.j2`, with its preview and its
      `app/email/previews_test.py` case. The reply on screen and from the
      API stays exactly as it is, so the page still reveals nothing. A
      deactivated account still gets nothing: it is treated as unknown
      today, and sending it a "register" email would invite a second
      account. Somebody could type a stranger's address and send them
      this email; the route allows three requests a minute and
      `send_email` ten emails an hour to one address, which keeps that
      small. Backend tests beside the route: an unknown address is sent
      the register email, a deactivated one nothing, and the response is
      identical in all three cases.

      Built as `no_account.html.j2`. Found while building it: a send that
      failed for a known address raised, so a failure could show the
      address had an account. Every forgot password email now goes
      through `_send_forgot_password_email`, which logs a refused or
      failed send, without the address, and answers "ok" regardless.
      The backend tests are in `backend/tests/auth_test.py`
      (`TestForgotPasswordEmails`), with the existing route's tests,
      rather than beside `main.py`.

- [x] Confirm the address and set the password in one email. For an
      account whose address is not confirmed yet, `forgot_password` sends
      a "confirm your email and set your password" email instead of the
      reset one, carrying the same token. `reset_password` marks
      `email_verified` true whenever it accepts a token, for any account:
      following a link sent to the address proves the address is theirs,
      as the verification link does, which the route's own comment
      already says. The page reads "Set your password" rather than "Reset
      password" when the link came from that email, through a flag on the
      link as `invite=1` already does. Check while building it whether an
      admin-made account is unconfirmed when its invite is sent; the
      invite uses the same token, so this would confirm it too. Backend
      tests beside the route, and the page's own test for its heading.

      Checked: `backend/app/users/create.py` makes an admin's account
      with `email_verified` already true, so an invite never needed this.
      Built as `confirm_and_set_password.html.j2` and a `confirm=1` flag
      on the link, which `ResetPasswordForm`'s new `isConfirming` turns
      into "Set your password" and a "Set password" button. The invite's
      page is left saying "Reset password", as it did; that was not
      asked for.

- [x] 10. As a uTD who has forgotten I never registered, I want forgot
      password to email me that I have no account and how to register,
      so that I am not left waiting for a reset that never comes.
      Tested: the page says "Check your inbox", and the captured email
      names no account and links to `/register`.
- [x] 11. As a TD who registered and never confirmed my address, I want
      forgot password to confirm it and set my password in one email, so
      that I can get in without a second round.
      Tested: the email asks to confirm and set a password, following it
      sets one, and the TD then signs in with no `email_not_verified`
      refusal and no second email.
- [x] 12. As a TD or a TA, I want forgot password to email me a link to
      set a new password, so that I can get back in.
      Tested: the reset email's link sets a new password, the old one no
      longer works, and the new one signs in.
- [x] 13. As Quill, I want a deactivated TD or TA who asks for a reset to
      be sent nothing, so that a closed account cannot be opened again
      this way.
      Tested: the page says "Check your inbox" as for anybody, and no
      email is captured for that address after the notice that closed
      it, which deactivating sends. Stories 10 to 13 are in
      `getting-in/forgot-password.spec.ts`. Found on the way: forgot
      password refuses a reserved address such as `.test`, as
      registration does, so the accounts these stories reset are made
      with an `example.com` address through `createAccount`'s new
      `email`.

## Phase 5: Taking a module, for a teaching admin and a teaching delegate

Specs under `frontend/e2e/tests/taking-a-module/`. Each story is tested
for both a TA and a TD unless it names one; a uTD becomes a TD by
registering (Phase 4), so from sign-in on the two are the same. Each
browser project signs in as its own TA and TD, so their attempts and
results never mix: the dashboard counts in story 19 depend on it.

The module is "Chest X-ray Interpretation" from `respiratory-teaching`,
pinned by `.github/scripts/ci/fetch-e2e-teaching.sh`. It is public, so CI
clones it with no token; the EoEETA module is private and would need a
deploy key, which is Phase 11's question. Its assessment offers four of
five questions, needs three right (75%) to pass, and each question's
`question.yaml` names its answer in `correct_option_id`. So the tests need
no made-up questions: a fixture reads the pinned module's answers, finds
the question on screen by its text, and picks the right option to pass or
a wrong one to fail. A new pin is then picked up with no test change.

- [x] Seed a TA and a TD per browser project, at "CI Teaching Centre",
      given a place and enrolled on the module, so each browser sits its
      own attempts. The TD's clinical lead is `ci_lead`, from Phase 4,
      who is the person emailed on a pass.

      Departed from the plan: nothing is seeded. Each journey makes its
      own learner through the API, as the seeded teaching admin, which
      `createAccount`'s new `takesModule` makes able to take the module
      (practising at a site, enrolled at the organisation). Fresh for
      each run, so the dashboard holds exactly the two attempts the run
      sits, and a retry starts clean, where a seeded learner would carry
      a failed run's attempts into the retry. Each learner also gets a
      site and a clinical lead of their own, because of the two findings
      below.

- [x] Found while building story 16: one refused certificate email
      stopped the rest. A pass queues an email to the candidate and one
      to each clinical lead as background tasks, Starlette runs them in
      turn and stops at the first that raises, and `send_email` raises
      once an address has had ten emails in an hour. So a busy lead
      over the limit silently cost everybody queued after them their
      email. Fixed: each is sent through `_send_certificate_email` in
      `backend/app/features/teaching/router.py`, which logs a refused or
      failed send, without the address, and lets the next go. Tested in
      `backend/tests/certificate_email_recipients_test.py`
      (`TestOneRefusedEmailStopsNoOther`), both tests checked to fail
      with the catch removed.

- [ ] Found while building story 16: a pass emails the clinical lead of
      **every** site under the organisation, not just the delegate's own.
      `_maybe_enqueue_certificate_emails` takes `descendant_ids` of the
      organisation and emails every lead found, so with EoEETA's member
      hospitals a lead at one would be sent the certificates, names and
      scores of delegates at all the others. Decided by Mark on
      2026-10-16: only the clinical lead of the site the delegate is at
      is emailed. Built in Phase 10, where the leaks across sites and
      organisations are tested.

- [x] Give the module a video. The pinned module has none, so story 7
      cannot be tested against it. Add one short, licence-free clip to a
      small test-only module kept in this repository beside the pinned
      one, synced by `seed_ci.py` the same way, rather than to
      `respiratory-teaching`, which is real teaching content. Check first
      how a video slide is served when `TEACHING_STORAGE_BACKEND` is
      `local`: if the local backend cannot serve one, story 7 is marked
      `test.fail()` with a comment naming what is missing, so the suite
      reports the moment it starts passing, and the gap goes in this
      plan.

      Not needed: this was wrong. The pinned module does have a video,
      its "Recorded lecture" slide, a YouTube lecture played in Quill's
      own player, so story 7 plays that. Playing is checked in Chromium.
      Playwright's own WebKit build cannot decode the video YouTube sends
      it (the player shows Pause and its clock never moves), so in WebKit
      the test is skipped with that reason. That slide is also why the
      existing slide journey failed now and then at slide 3: the player
      goes on laying itself out after the slide appears and moves the
      Next button, so a click aimed just before lands on nothing. The new
      journey presses Next until the address moves.

- [x] Add "Back to dashboard" to the result page when it is opened from
      the dashboard (story 21). Today the button shows only straight
      after an assessment, so somebody opening an old result has no way
      back but the navigation. With its page test and story.

      `AssessmentResultPage` now always offers it; "Try again" is still
      offered only straight after the exam. The existing component
      stories already show the button.

- [x] 1. As a TA or a TD, or a uTD, I want to open "How to join a course"
      from the login page, read the guide, and get back to the login page
      from a link in it, so that I can find out how to join before I sign
      in. The guide, `src/guides/content/join-a-course.md`, links to
      `/login`.
- [x] 2. As a TA or a TD, I want to sign in, so that I can take a module.
- [x] 3. As a TA or a TD, I want to see the one teaching module I am
      enrolled on at `/teaching`, so that I know what to take.
- [x] 4. As a TA or a TD, I want to open the module's landing page, so
      that I can see what it covers before I start.
- [x] 5. As a TA or a TD, I want to open the learning section from the
      landing page, so that I can study before the assessment.
- [x] 6. As a TA or a TD, I want to read every slide to the end, so that I
      cover all the learning.
- [x] 7. As a TA or a TD, I want every video in the learning to play, so
      that I can watch what the slides show.
      Tested: each video loads and its time moves on once played.
- [x] 8. As a TA or a TD, I want to leave the learning from the navigation
      bar, so that I am never trapped in a lesson.
- [x] 9. As a TA or a TD, I want to start the assessment, so that I can be
      tested on the module.
- [x] 10. As a TA or a TD, I want to see each question of the assessment
      and answer it, so that every one is marked.
- [x] 11. As a TA or a TD, I want to finish the assessment, so that my
      answers are submitted and scored.
- [x] 12. As a TA or a TD, I want to see my score on the result page,
      `/teaching/assessment/{id}/result`, so that I know how I did.
- [x] 13. As a TA or a TD, I want to pass when I answer well enough, so
      that my result reflects what I know.
      Tested by answering every question right.
- [x] 14. As a TA or a TD, I want to fail when I do not, so that a pass
      means something.
      Tested by answering every question wrong.
- [x] 15. As a TA or a TD who has passed, I want to download my
      certificate, so that I have proof of the pass.
      Tested: the download is a PDF.
- [x] 16. As a TD who has passed, I want my clinical lead and me each to be
      emailed the certificate, so that we both have it without asking.
      Tested with the captured email from Phase 1: one to the delegate and
      one to `ci_lead`, each with the certificate attached. For a TA the
      same is checked for whatever lead their site has.
- [x] 17. As a TA or a TD, I want "Results by question" on a pass and on a
      fail, showing each question with the right answer and mine, so that
      I can learn from my mistakes.
      Tested as the page stands: each question with the answer given and
      whether it was right. It does not show the right answer to a
      question got wrong; say if it should.
- [x] 18. As a TA or a TD, I want "Back to dashboard" on the result page to
      take me to the dashboard, so that I can carry on.
- [x] 19. As a TA or a TD, I want to see my earlier attempts on the
      dashboard, so that I can look back at them.
      Tested: after stories 13 and 14, two attempts, one pass and one
      fail.
- [x] 20. As a TA or a TD, I want to open any earlier attempt from the
      dashboard and see its result page again, so that I can look back at
      how I did.
- [x] 21. As a TA or a TD, I want "Back to dashboard" on a result page I
      opened from the dashboard too, so that I can always get back.
      Needs the button added above.

## Phase 6: Settings, for a teaching admin and a teaching delegate

Specs under `frontend/e2e/tests/settings/`, each tested for both a TA and
a TD. Each browser project changes its own seeded TA and TD, and every
switch is put back where it started, so a retry replays cleanly.

Departed from the plan: nothing is seeded. Each test makes the person it
changes, through `e2e/fixtures/people.ts`, so nothing it switches is seen
by another test, a retry or the other browser, and nothing has to be put
back.

- [x] Found while building story 23: the dark mode switch had no name of
      its own, so a screen reader announced it by its state, "No". It now
      carries `aria-label="Dark mode"`, as the other switches on the page
      already did, with a test in `src/pages/Settings.test.tsx`.

- [x] Found while building story 27: a two-factor code can be used
      twice. `verify_totp_code` in `backend/app/security.py` accepts any
      code for the current 30-second step and records none as used, so
      somebody who sees a code being typed can sign in with it in the
      same half-minute. Mark asked on 2026-10-16 for industry practice,
      researched the same day:

      - **RFC 6238 section 5.2** says the verifier must not accept the
        second attempt of a code once the first has been validated, so
        each code is used once.
      - **The usual way to do it** is a high-water mark: store, per
        account, the time step of the last code accepted, and refuse any
        code whose step is at or below it. The step, not the six digits,
        is what is recorded, since codes repeat by chance. otplib builds
        this in as `afterTimeStep`; pyotp, which Quill uses, does not, so
        the comparison is Quill's to make.
      - **Real faults from leaving it out**: CVE-2026-55370 (Logto) and
        CVE-2026-61630 (nginx ignition), both a stateless check that
        accepted a used code again within its window.

      Decided: a nullable integer column on `users`,
      `totp_last_step`, written in the same transaction that accepts a
      code, and a code refused when its step is at or below it.
      The window is one 30-second step either side of now, decided by
      Mark on 2026-10-16: RFC 6238 section 5.2 recommends at most one
      step for network delay, and django-otp's default tolerance is 1.
      With the current step only, a code typed just before the step
      rolls over was refused. The reuse check is what makes the wider
      window safe; without it, a window of one is the flaw behind
      CVE-2026-55370. `totp_step_matched` tries the steps from the
      highest down and returns the latest the code is right for, so
      digits that two steps share cannot pass again at the later one,
      and compares with `hmac.compare_digest`. Tests: a code used once and
      then again is refused the second time, at login and at setup, and
      story 27 checks a second sign-in with the same code is refused.
      Sources:
      [OneUptime, blocking TOTP reuse](https://oneuptime.com/blog/post/2026-08-29-how-to-block-reuse-of-a-totp-code-during-its-30-second-validity-window/view),
      [otplib `afterTimeStep`](https://otplib.yeojz.dev/api/@otplib/totp/type-aliases/TOTPVerifyOptions.html),
      [CVE-2026-55370](https://app.opencve.io/cve/CVE-2026-55370),
      [CVE-2026-61630](https://corgea.com/advisories/vulnerabilities/CVE-2026-61630).

      Built: `totp_step_matched` in `backend/app/security.py` says which
      step a code is right for, replacing `verify_totp_code`, and
      `use_totp_code` in `backend/app/users/totp.py` claims that step with
      one conditional update, so two requests with the same code at once
      cannot both win. Login and setup both go through it, turning
      two-factor off clears the step, and emptying an account wipes it.
      The migration adds `users.totp_last_step`, nullable, with nothing to
      backfill. Story 27 now waits for the next step after setup before
      signing in, and checks the same code is refused a second time. The
      keyboard sign-in journey had both browsers sign in as one
      `twofactor` user, which a single-use code now refuses, so each
      browser has its own (`twofactor_chromium`, `twofactor_webkit`).

- [x] 22. As a TA or a TD, I want to update my account details, so that
      they stay correct.
- [x] 23. As a TA or a TD, I want to turn dark mode on and off, so that
      Quill suits how I like to read.
- [x] 24. As a TA or a TD, I want to turn off "Help improve Quill", so
      that I choose whether my use is counted.
- [x] 25. As a TA or a TD, I want to turn news and updates on and off, so
      that I get only the email I want.
- [x] 26. As a TA or a TD, I want to turn on two-factor authentication,
      so that my account is harder to break into.
- [x] 27. As a TA or a TD, I want to set up two-factor authentication with
      an authenticator app and then sign in with a code from it, so that
      it actually protects me.
      Possible end to end: the setup page shows the secret in its
      `otpauth://` link, and `e2e/fixtures/totp.ts` already works out the
      current code from a secret, as the keyboard sign-in journey does.
      The test reads the secret, enters the code to finish setting up,
      signs out, and signs in again with a fresh code. It then turns
      two-factor off, so a retry starts clean.
- [x] 28. As Quill, I want neither a TA nor a TD to see the Clinician
      passport card in settings, so that teaching users are shown only
      what is theirs.
      `Settings.tsx` shows it only with the passport feature and
      `assess_clinician_passport`; the test checks neither user gets it.

## Phase 7: Guides, for a teaching admin and a teaching delegate

Specs under `frontend/e2e/tests/guides/`. The guides list at `/guides`
groups guides by `audience` in `frontend/src/guides/registry.ts`: a
reader sees their own tier and every one below it, so a TA sees "For
admins" and "For everyone", and a TD sees "For everyone" alone. Each
teaching guide also needs the `teaching` feature.

- [x] Move "Join a course" to "For everyone": its `audience` in
      `registry.ts` goes from `admin` to `everyone`. Decided by Mark on
      2026-10-16. The comment beside it gave the old reason, that
      somebody signed in has joined already so only an admin needs it;
      it is rewritten to say that a delegate is shown it too, as the
      guide to point a colleague at. It stays `public`, so it is still
      read signed out from the login page. Update the registry's tests
      for the new grouping.

- [x] 1. As a TA, I want to see both the "For admins" and the "For
      everyone" guides, so that I can find how to run teaching and how
      delegates take part.
      Tested: "For admins" lists "Add a delegate by hand" and "See
      delegates' results"; "For everyone" lists "Join a course" and "Take
      a module and its assessment".
- [x] 2. As a TA, I want to open "Add a delegate by hand", so that I can
      learn how to make an account for somebody who cannot register.
- [x] 3. As a TA, I want to open "See delegates' results", so that I can
      learn how to follow who has passed.
- [x] 4. As a TA or a TD, I want to open "Join a course", so that I can
      follow, or pass on, how to register.
- [x] 5. As a TA or a TD, I want to open "Take a module and its
      assessment", so that I know how to work through a module.
- [x] 6. As Quill, I want a TD to see only the "For everyone" guides, so
      that delegates are shown only what is theirs.
      Tested: no "For admins" heading, and neither admin guide in the
      list. Opening an admin guide's address directly is checked too, and
      shows what the app shows for any page that is not theirs: the 404
      page. Tests are in `tests/guides/guides.spec.ts`. With one group,
      the list leaves out its heading, so a TD sees the two guides with
      no "For everyone" heading above them.

## Phase 8: What is not theirs, feedback, and signing out

Specs under `frontend/e2e/tests/everyday/`, each tested for both a TA and
a TD unless it names one. Feedback is built already: `POST /api/feedback`
takes it, "Your feedback" at `/feedback` lists what somebody sent with any
reply, `GET /api/feedback/mine` serves it, an unread reply shows in the
inbox, and `backend/app/feedback/router.py` emails the sender when an
operator writes a comment. A change of status alone sends no email, so
story 4 tests a comment.

- [x] 1. As Quill, I want neither a TA nor a TD to see the passport or
      safety areas, in the menu or by typing their addresses, so that
      teaching users are shown only teaching.
      Tested: no Passport or Safety link in the navigation, and
      `/passport`, `/passport/logbook`, `/safety` and a safety case's
      address each show the 404 page, not an error and not the area.
- [x] 2. As a TA or a TD, I want to send feedback from anywhere in the
      app, so that I can tell Quill what is wrong or could be better.
- [x] 3. As a TA or a TD, I want to see the feedback I have sent, with any
      reply, so that I know it was received and what came of it.
- [x] 4. As a TA or a TD, I want to be told in the app and by email when
      Quill replies to my feedback, so that I do not have to keep
      checking.
      Tested: the superuser writes a comment on it from
      `/admin/feedback`, the sender's inbox then shows the reply as
      unread, the captured email reaches them, and opening "Your
      feedback" marks it read.
- [x] 5. As a TA or a TD, I want to sign out and sign back in, so that I
      can leave a shared computer safely and come back later.
      Tested: after signing out, a page that needs signing in sends them
      to the login page, and signing in again lands them where they
      start.
- [x] 6. As Quill, I want a TD to see no admin section, so that delegates
      cannot reach the pages that run teaching.
      A TD only. Tested: no Admin link in the navigation, and `/admin`,
      `/admin/users` and `/admin/teaching` each show the 404 page.

      All six are in `tests/everyday/everyday.spec.ts`, each making the
      person it signs in as. The reply in story 4 is written by the
      superuser through `/admin/feedback`, as an operator would.

## Phase 9: The edges of the journeys

Specs under `frontend/e2e/tests/edges/`. Added on 2026-10-16, when Mark
asked what the earlier phases left out. Each is tested for both a TA and
a TD unless it names one.

- [x] 1. As a TA or a TD, I want an assessment I run out of time on to be
      submitted and marked with what I answered, so that the time limit
      is fair and I am not left on a page that no longer counts.
      The module allows ten minutes, and waiting that long would stretch
      the run, while moving the browser's clock would not move the
      server's. So `seed_ci.py` seeds, for each browser's TD, an attempt
      started eleven minutes ago, and the test opens it. Check first
      whether the limit is enforced by the server, the browser or both,
      and test each side that enforces it.

      Checked: the server enforces it. `finish_if_out_of_time` in
      `backend/app/features/teaching/attempts.py` finishes an attempt as
      at its deadline the next time anything touches it.
      `seed_out_of_time_attempts` begins one for `out_of_time_chromium`
      and `out_of_time_webkit`, answers its first question right, and
      dates it eleven minutes back; the test finds it marked "Fail", with
      one answer right and three not answered. Stories 1 to 5 are in
      `tests/edges/assessment-rules.spec.ts`.
- [x] 2. As a TA or a TD, I want to leave an assessment part way through
      and come back to the same attempt, with my answers kept, so that a
      dropped connection or a closed tab does not cost me the attempt.
- [x] 3. As a TA or a TD who has failed, I want to try again straight
      away, so that I can retake it while the learning is fresh.
      The module sets `allow_immediate_retry`; the test checks a new
      attempt starts with new questions drawn.
- [ ] 4. ~~As a TA or a TD, I want to come back to the learning at the
      slide I left.~~ Dropped on 2026-10-16: EoEETA asked Quill not to
      remember which slide somebody visited last. The `test.fail()` test
      for it in `tests/edges/assessment-rules.spec.ts` is to be deleted,
      since there is nothing to wait for.
- [x] 5. As a TD, I want to lose a module once a TA takes me off it, so
      that only people still enrolled can take it.
      Tested across two people: the TA unticks the module on the TD's
      member page, and the TD's dashboard no longer shows it and its
      address no longer opens it.
- [x] 6. As a TA or a TD left idle past the fifteen-minute access token,
      I want the app to carry on without signing me out, so that a long
      read or a slow assessment is not lost.
      The token's expiry is the server's clock, so the test removes the
      access cookie, as its expiry would, leaving the refresh cookie.
      The next request is answered 401, `api.ts` refreshes and retries,
      and the page carries on with no visit to the login page.
- [x] 7. As a TD on a phone, I want to sign in, take the module and see my
      result, so that I can do it on the device I have.
      A phone-sized Playwright project, Chromium at a phone's width,
      running the core of Phase 5: below `md`, 992px, the navigation is
      behind the hamburger, so these journeys open it to get about.
      Built as a `phone` project in `frontend/playwright.config.ts`, a
      Pixel 7 in Chromium, running only `*.phone.spec.ts`; the desktop
      projects skip those. The journey is
      `tests/edges/taking-a-module.phone.spec.ts`. On a phone the results
      by question are cards rather than a table, so it reads them as
      cards.
- [x] 8. As a TA, I want to filter all delegates by trust and by clinical
      lead, so that I can find the delegates I am responsible for.
      The "All delegates" card promises both; the test checks each filter
      narrows the table and that clearing it brings everybody back.
      The filter offers sites and clinical leads, not trusts, so "by
      trust" is tested as by site, the place a delegate belongs to. The
      card's subtitle still says "trust"; worth rewording to "site".
- [x] 9. As a TA or a TD, I want to change my password in settings, so
      that I can keep my account safe.
      Tested: the old password stops working and the new one signs in.
- [x] 10. As a TA or a TD, I want the unsubscribe link in a news email to
      turn news off, so that I can stop it from the email itself.
      Tested with a captured news email: following its link turns news
      off, and settings then show it off.
      Departed from the plan: a newsletter is sent by an operator's job
      (`send-newsletter`) that the browser cannot start, so the link is
      taken from the email that tells somebody their account was closed,
      which carries the same unsubscribe link for anybody sent news. The
      test reopens the account afterwards and finds news off in settings.
      Stories 6, 8, 9 and 10 are in `tests/edges/account-edges.spec.ts`.

- [ ] Found while building story 7: on a phone, tapping the menu entry
      for the page already open leaves the menu open over it. The menu
      closes when the page changes, and tapping the current page changes
      nothing. Decided by Mark on 2026-10-16: it closes. Close the menu on
      any tap of an entry, and add the case to the phone journey: tapping
      "Teaching" while on `/teaching` closes the menu.

- [ ] Found while running the journeys side by side: two requests making
      accounts with the same address at the same moment get a 500, not a
      refusal. The route checks the username and address are free, then
      inserts, and between the two the other request can insert first, so
      the database's unique constraint (`users_email_key`,
      `users_username_key`) catches the second as an unhandled
      `IntegrityError`. A double click on "Create user", or two admins
      adding the same person, is enough. Decided by Mark on 2026-10-16:
      fix it.

      Keep the checks, which give the right answer in the ordinary case,
      and also catch `IntegrityError` where the account is flushed, in
      `backend/app/users/create.py` for an admin making an account and
      in `backend/app/users/register.py` for somebody registering. Roll
      the insert back and answer as the check would have: `EmailTaken`
      or `UsernameTaken` for an admin, read from the constraint named in
      the error, and the one `UsernameOrEmailInUse` for registration,
      which must not say which was taken. Any other integrity error is
      raised as it was. Tests beside each module: a second insert made
      to collide, by holding the check open, is refused with the right
      answer and leaves one account.

- [x] Found in CI: YouTube sends nothing to CI's data-centre runners, so
      the lecture's clock never moved there and story 7 of Phase 5 failed
      on every retry. The video test now checks Quill's player starting
      everywhere, and the clock moving only in Chromium on a developer's
      machine. Also found in CI: the Playwright container could not see
      `.e2e-teaching/`, so `e2e/fixtures/answers.ts` failed there. CI
      now mounts it read-only where `../.e2e-teaching` reaches from the
      container's `/work`.

## Phase 10: Two organisations, two sites each, and what leaks

Decided by Mark on 2026-10-16, after a pass was found to email every
clinical lead in the organisation. Every teaching journey runs in a world
of two organisations with two sites each, so a test can see what reaches
across a site or an organisation and what does not. Built in this order,
so the leak tests are written before the fix they prove.

- [ ] Seed the world in `backend/scripts/seed_ci.py`: "CI Teaching
      Hospital" with "CI Teaching Centre" and a second site, and a second
      teaching organisation with two sites of its own, the module open
      at both organisations. Each of the four sites has its own clinical
      lead, and each organisation its own teaching admin. The existing
      "CI Other Hospital", which runs no teaching, stays as the place
      nobody may move a delegate to.

- [ ] Give the fixtures the world: `PLACES` names all four sites and both
      organisations, and `makeLearner` takes the site to put somebody at,
      rather than making a site of its own each time. A learner's lead is
      then the seeded lead of their site, so the emails each lead
      receives say who leaks.

- [ ] Write the leak tests, before the fix, in `tests/leaks/`:
      - a pass emails the delegate and their own site's lead, and no lead
        at the other site of the organisation, nor at either site of the
        other organisation (fails today, so written as `test.fail()`
        until the next step, then the marker comes off);
      - a teaching admin sees only their own organisation's delegates on
        All delegates, its sites in the filters, and its people on the
        users list;
      - a teaching admin cannot open the other organisation, its sites,
        or its people's pages, by the menu or by address, and the API
        refuses each;
      - a delegate sees only the modules their organisation serves, and
        cannot open the other organisation's results;
      - a clinical lead named at one site is not offered at registration
        for the other organisation's module.

- [ ] Email only the delegate's own site's lead on a pass, in
      `_maybe_enqueue_certificate_emails`: the lead of the site the
      delegate belongs to, under the organisation that served the
      module. A delegate at no site, or at a site with no lead, emails
      no lead, as a vacant post already does. Update
      `backend/tests/certificate_email_recipients_test.py`, whose
      "the lead of a linked site is emailed" cases describe today's
      behaviour, and take the `test.fail()` off the leak test.

- [ ] Move the existing teaching journeys onto the world, so each runs
      against a named site rather than one made for it, and drop
      `makeLearner`'s per-learner site and lead, which only worked
      round the leak. The rate limit on emails to one address still
      applies to a shared lead, so each journey's assertion on a lead's
      email picks it out by learner, as `waitForEmailMatching` does.

## Phase 11: Every module of teaching content

- [ ] Settle the four open questions from the discussion on 2026-10-15
      before writing this phase's steps: 1. What "all the content" means: every module and every slide, with
      each assessment sat once (recommended), or every question in
      every bank as well. 2. Which repositories: every teaching repository, private EoEETA
      ones included (recommended), which needs a read-only deploy key
      or GitHub App token in CI. 3. Where it runs: in each content repository's own CI on its pull
      request (recommended), since that pull request is the gate for
      content, with Quill's CI keeping its one pinned module. 4. What a test checks: each slide renders with no console errors and
      no broken images or video, plus an axe scan (recommended), and no
      screenshot comparison.

## Decisions

- **Refusals are checked at the API as well as on screen** - several
  admin items are about what a teaching admin may not do. The screen hiding
  a button is a convenience. The API refusing the request is the actual
  control, so each refusal test sends the request too.
- **One account per test, not per browser** - Chromium and WebKit run
  the same specs at the same time against one database. A journey that
  creates, edits or deactivates an account makes its own, named for the
  browser project and the time, so the two never act on the same person.
  The teaching admin both browsers sign in as is shared, since nothing
  changes them.
