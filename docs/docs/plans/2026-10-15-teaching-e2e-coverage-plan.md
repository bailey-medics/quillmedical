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

- [x] Found while building story 16: a pass emails the clinical lead of
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
- [x] 4. ~~As a TA or a TD, I want to come back to the learning at the
      slide I left.~~ Dropped on 2026-10-16: EoEETA asked Quill not to
      remember which slide somebody visited last. The `test.fail()` test
      for it in `tests/edges/assessment-rules.spec.ts` is deleted, since
      there is nothing to wait for.
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
      - [x] Reword it, decided by Mark on 2026-10-16: "View delegate
        progress, assessment results, and filter by site or clinical
        lead." in `frontend/src/pages/admin/teaching/AdminTeachingDashboard.tsx`,
        with any test or story that quotes the old words.
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

- [x] Found while building story 7: on a phone, tapping the menu entry
      for the page already open leaves the menu open over it. The menu
      closes when the page changes, and tapping the current page changes
      nothing. Decided by Mark on 2026-10-16: it closes. Close the menu on
      any tap of an entry, and add the case to the phone journey: tapping
      "Teaching" while on `/teaching` closes the menu.
      Two places held it open. `NestedNavLink` keeps the menu open when a
      heading with children is tapped, so they can be seen; it now closes
      when that heading's own page is the one open. And the teaching
      pages' `TeachingLayout` never closed its menu on a tap at all, so it
      now closes whenever the location's key changes, which it does on
      every navigation, the same address included. The phone journey
      checks it with the menu's `inert`, since the menu slides out of
      view rather than leaving the page. Journey 3 on a phone is added to
      the accessibility testing log's "Not yet run" list.

- [x] Found while running the journeys side by side: two requests making
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

      Built slightly differently: the constraint's name is not read from
      the error, because Postgres and the SQLite unit tests word it
      differently. The insert is made in a savepoint, as
      `begin_attempt` already does for two attempts at once, and on an
      `IntegrityError` the checks are simply asked again. By then the
      other account is written, so the check that raises is the one that
      says which was taken; if neither does, the error is raised as it
      was. The unit tests' SQLite engine needed SQLAlchemy's documented
      pysqlite fix in `backend/conftest.py`: without it a savepoint
      opened its own transaction and releasing it committed, so a
      successful `begin_nested` survived the request's rollback, which
      Postgres never allows.

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

- [x] Seed the world in `backend/scripts/seed_ci.py`: "CI Teaching
      Hospital" with "CI Teaching Centre" and a second site, and a second
      teaching organisation with two sites of its own, the module open
      at both organisations. Each of the four sites has its own clinical
      lead, and each organisation its own teaching admin. The existing
      "CI Other Hospital", which runs no teaching, stays as the place
      nobody may move a delegate to.
      Built as `seed_teaching_world`: "CI Teaching Annexe" beside the
      Centre, and "CI Second Hospital" with "CI Second Centre" and "CI
      Second Annexe", led by `ci_annexe_lead`, `ci_second_lead` and
      `ci_second_annexe_lead`, with `educator_second` its teaching admin.
      The whole E2E suite was run against it: nothing it already checked
      changed.

- [x] Give the fixtures the world: `PLACES` names all four sites and both
      organisations, and `makeLearner` takes the site to put somebody at,
      rather than making a site of its own each time. A learner's lead is
      then the seeded lead of their site, so the emails each lead
      receives say who leaks.
      Built beside `makeLearner` rather than in it: `TEACHING_SITES`
      names each site with its organisation, lead and teaching admin, and
      `makeLearnerAt` puts somebody at one, made by that organisation's
      own teaching admin. `makeLearner` keeps a site and lead per learner,
      for the reason in the last step of this phase.

- [x] Write the leak tests, before the fix, in `tests/leaks/`:
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

      Built in `tests/leaks/leaks.spec.ts`. The email test fails today on
      the leak itself: `ci_lead`, at the Centre, is told of a pass at the
      Annexe. The other four pass. "Only the modules their organisation
      serves" is checked as the one module both organisations serve being
      shown once; no seeded organisation serves a module the other does
      not. The registration case asks the public lead check for one lead
      at each organisation, not all four, because it is limited to ten a
      minute and the registering journeys share that.

- [x] Email only the delegate's own site's lead on a pass, in
      `_maybe_enqueue_certificate_emails`: the lead of the site the
      delegate belongs to, under the organisation that served the
      module. A delegate at no site, or at a site with no lead, emails
      no lead, as a vacant post already does. Update
      `backend/tests/certificate_email_recipients_test.py`, whose
      "the lead of a linked site is emailed" cases describe today's
      behaviour, and take the `test.fail()` off the leak test.
      Built: the lead lookup reads the sites beneath the organisation that
      the candidate is a member of, and asks `clinical_leads_of` about
      those alone. Three new cases in the test file failed against the old
      lookup: a lead at another site of the organisation, a candidate at
      no site, and a vacant post at their site with a lead next door.

- [x] ~~Move the existing teaching journeys onto the world, so each runs
      against a named site rather than one made for it, and drop
      `makeLearner`'s per-learner site and lead, which only worked
      round the leak. The rate limit on emails to one address still
      applies to a shared lead, so each journey's assertion on a lead's
      email picks it out by learner, as `waitForEmailMatching` does.~~
      Not done, decided while building it. The per-learner site and lead
      did not only work round the leak: `send_email` refuses an eleventh
      email to one address in an hour, and counts a dry run, so a lead
      shared by every journey that passes, in two browsers with retries,
      would stop being sent the email the journey checks. And the
      journeys already run in the world: their sites are made beneath
      "CI Teaching Hospital", the first of its two organisations. So
      `makeLearner` keeps a site and lead per learner, and the seeded
      sites and leads are for the leak tests, which pass a handful of
      times a run.

## Phase 11: Every module of teaching content

- [x] Settle the open questions. Decided by Mark on 2026-10-16:
      - **What is tested** - going through a module, each slide shows
        what its file says it should: its text, its pictures and its
        videos. Each question shows its text, its picture and its
        options. Not every question bank in every combination, and no
        screenshot comparison.
      - **Which repositories** - respiratory-teaching only. It holds one
        module, `chest-xray-interpretation-test`, the one Quill's CI
        already fetches at a fixed commit, so no new credential and no
        new repository in CI.
      - **What a slide must pass** - no console errors, no broken
        picture or video, and the axe scan `fixtures/axe` already runs.
      - **Where it runs** - in Quill's CI, against the fixed commit in
        `.github/scripts/ci/fetch-e2e-teaching.sh`, as today.

- [x] Check every slide against the module's own file, in
      `tests/taking-a-module/content.spec.ts`. Read
      `learning/content.mdx` the way `fixtures/answers.ts` reads the
      questions: split it into slides as the app does, and for each
      slide check its headings and text are shown, each picture has
      loaded (a `naturalWidth` above nought, not merely an `img` in the
      page), and each `<YouTube>` has Quill's player. Fail on any
      console error or failed request for a picture or video on the way.
      Reading the file, not a copy of it in the test, means new material
      is checked as soon as the pin moves.
      Tested against the module as it is, decided by Mark on 2026-10-16:
      its slides have text, the lecture and a callout but no picture yet,
      so the picture check runs on whatever pictures a slide has, none
      today. When Mark adds slides he will ask for the E2E tests to be
      brought up to date, which is moving `PINNED_SHA` in
      `.github/scripts/ci/fetch-e2e-teaching.sh` to his commit.

- [x] Check every question against its file. An attempt draws four of
      the five at random, so sit attempts until every question has been
      shown once, checking each as it appears: its text, its picture
      loaded, and its options. The module allows an immediate retry, so
      this costs a few attempts and no waiting.

      Both built in `tests/taking-a-module/content.spec.ts`, with the
      slide reading in `fixtures/learning.ts` and each question's options
      and pictures added to `fixtures/answers.ts`. The slide test also
      checks the app makes as many slides as the file holds, and scans
      each slide with axe in light and dark. Found while building it:
      axe failed every lecture slide inside YouTube's own player frame
      (`aria-allowed-attr`, `aria-prohibited-attr`). That markup is
      YouTube's, so `fixtures/axe.ts` now leaves YouTube frames out of
      every scan. Questions are answered wrong, so the attempts send no
      certificate email and stay clear of the hourly limit per address.

## Phase 12: What a delegate can reach of anybody else's

Asked for by Mark on 2026-10-16: a teaching delegate reaches nothing of
another delegate's, of a teaching admin's or of the superuser's, and no
admin page at all. Decided the same day where each part is tested. The
API is checked by backend unit tests, which are quicker, can call every
route and run on every push; end-to-end tests check what a person sees,
with a few requests through the real stack. `every_route_is_guarded_test.py`
checks only that each route asks who is calling, not that a delegate is
refused, so nothing checks this today.

- [x] Backend: every route refuses a delegate, unless it is theirs to
      use, in `backend/tests/a_delegate_reaches_only_their_own_test.py`.
      Walk `served_routes(app)`, call each as a teaching delegate with
      real ids filled in for its path (another delegate's assessment, a
      teaching admin's, the superuser's account, an org unit, a piece of
      feedback), and expect a 403 or a 404, never a 422 or a 200. Routes
      a delegate may call are named in a list with the reason, such as
      their own modules, attempts, settings and feedback, and the list
      fails in both directions as `PUBLIC` does: a new route a delegate
      can call fails until it is listed, and an entry for a route that
      no longer exists fails until it is taken out. A floor on the
      number of routes walked, so an empty walk cannot pass.
      A route the list admits is checked with somebody else's ids too:
      admitted means a delegate may call it for their own, not for
      anybody's.

      Built. The delegate is a real learner, enrolled on a live module,
      so the teaching routes refuse them for being somebody else's and
      not for having nothing; every id in a path is another person's or
      a place. `THEIRS` names 21 routes, none taking another's id. A
      route answering 422 counts as getting through, since every guard
      in front of it has passed; the two answer routes, which check the
      attempt is theirs only after reading the body, are sent a valid
      one, and refuse.

      Found, and left for Mark in `NOT_YET_REFUSED` rather than fixed,
      since it is clinical and not teaching: sixteen patient and
      messaging routes are guarded only by the clinical services gate
      and sign-in. `GET /api/patients/{patient_id}` says "any role can
      view patients", so where clinical services are on, any signed-in
      account, a delegate included, can read any patient's demographics
      by id. App production runs with clinical services off, where all
      sixteen answer 503, so nothing is exposed today. The list fails
      when one starts refusing, so it cannot outlive the gap.

- [x] Frontend: every admin page shows a delegate the 404 page, in a
      vitest test beside `src/routes.tsx`. Walk the exported `routes`,
      take every path under `/admin` (about forty), render each as a
      teaching delegate and expect the 404 page. A floor on the count,
      and a new admin page is covered without anybody adding it.
      Built as `src/adminRoutes.test.tsx`: 41 addresses, each shown to a
      delegate holding exactly what `teaching_delegate` gives, and a
      teaching admin let past the same guard so the 404 is the guard at
      work. Rendering routes needed a router of the test's own, so
      `renderRoutes` joins `renderWithRouter` in `src/test/test-utils.tsx`.

- [x] End to end: one delegate cannot open another's pages, in
      `tests/leaks/delegate-to-delegate.spec.ts`. Two learners at
      `TEACHING_SITES.centre` and one at `TEACHING_SITES.annexe`, made
      with `makeLearnerAt`; one passes, and each of the other two is
      refused the result page, results by question and the certificate,
      each first checked to open for its owner. Story 6 of Phase 8
      already shows a delegate the 404 page for `/admin`, `/admin/users`
      and `/admin/teaching` in a real browser, and stays as it is.
      Built: run once for a delegate at the same site and once at the
      Annexe, each refused at the API (403 or 404, not merely an error)
      with nothing of the result or its answers on the page.

## Phase 13: Passport and safety places nobody in teaching can reach

Discussed with Mark on 2026-10-16. The seed has no passport or safety
place at all, so nothing tests that a teaching admin or delegate cannot
reach one. What somebody may do depends on what they hold and where they
belong, not on what a place is for, so one list of checks run against
each place covers both, and a third kind of place later is one more
entry in it. The teaching journeys stay where they are: they never go
near these places, so moving them would test nothing new.

- [x] Seed "CI Passport Hospital" with "CI Passport Centre", the passport
      feature on, and a member holding a passport record; and "CI Safety
      Hospital" with "CI Safety Centre", the safety feature on, and a
      member holding a safety post. Real data in each, so a refusal is
      protecting something rather than an empty place.

- [x] Write `tests/leaks/other-features.spec.ts`, one parametrised list
      run against each place, as the seeded teaching admin and as a
      delegate at a teaching site:
      - the organisation is not in the teaching admin's list;
      - the organisation page, the site page and the member's page do
        not open, by the menu or by address;
      - the delegate sees no passport or safety page for those places.
      Changing these places through the API is the backend's to check,
      as Phase 12 decided: the org-scoping tests in `backend/tests/`
      already refuse a teaching admin outside their own tree, and get a
      case for each new kind of place if one is missing.

      Built. `seed_other_feature_places` in `seed_ci.py` makes both, the
      passport member (`ci_passport`, a `passport_delegate`) holding a
      passport made through `service.create_passport`, and the safety
      member (`ci_safety`, a `safety_officer`) appointed clinical safety
      officer at the site. The spec takes the ids as the operator sees
      them, then as the seeded teaching admin checks neither place is in
      their list and that the organisation, site and member pages are
      refused at the API with a 403 or 404 and show nothing; and as a
      delegate that there is no link to the feature, and its page and
      the three admin pages are the 404 page. No backend case was
      missing: `manage_teaching_org_unit_routes_test.py` already refuses
      a teaching admin adding, editing, moving or deleting a site in
      another tree and naming a lead there, and refusal turns on the
      tree, not on what the place runs.

## Phase 14: The terms of service and privacy policy while registering

Asked for by Mark on 2026-10-17. The registration form's last view says
"By creating an account you agree to our terms of service and have read
our privacy policy" (`components/registration/LegalNotice.tsx`), each a
link that opens in a new tab (`ExternalTextLink`, `target="_blank"`,
`rel="noopener noreferrer"`). Nothing tests that they are there, that
they open the right page, or that somebody who reads them can come back
and finish registering.

- [x] Add story 10 to `tests/getting-in/registering.spec.ts`, as a uTD
      registering from the login page:
      - both links are on the form, named "terms of service" and
        "privacy policy";
      - each opens a new tab, caught as Playwright's `popup` event, on
        the public site's `/terms-of-service` and `/privacy-policy`, with
        the page's heading shown. The links name the live public site,
        `https://quill-medical.com`, so the test routes requests for it
        to the stack's own public site (`E2E_PUBLIC_URL`), as
        `fixtures/publicSite.ts` already does the other way round;
      - the new tab is the one in front: `document.visibilityState` is
        `visible` in it. A browser brings a tab opened by a click to the
        front by itself; the test checks it did, and if headless
        Chromium or WebKit cannot report it reliably, the step says so
        here rather than asserting something the browser cannot tell;
      - each tab is closed, and the registration tab still holds
        everything typed into the form, and registering goes on to the
        confirmation email as story 8 does.
      Opening both tabs before closing either is the case most likely to
      lose the form, so it is the order the test uses.
      Built. Each link is found by its full name, "terms of service
      (opens in a new tab)", since `ExternalTextLink` tells a screen
      reader what it does. The front-tab check was tried and dropped:
      headless Chromium and WebKit report every tab visible and focused,
      the form's tab included, so `visibilityState` proves nothing. The
      test checks instead that each link opens a tab of its own, which
      is what a browser brings to the front.

## Phase 15: Deactivating a site, and a teaching admin no longer deleting one

Raised by Mark on 2026-10-17, and settled with him the same day. EoEETA will need to stop a
whole site, say one that no longer wants the service. Deleting it is the
wrong tool: its people would be left belonging nowhere. So a teaching
admin may no longer delete a site, which overturns the decision in Phase
2 (#2035) in a pull request of its own, and a site is deactivated
instead.

What is there today:

- `OrgUnit.is_active` already exists, and the edit site page
  (`pages/admin/sites/EditSitePage.tsx`) has a "Site status" switch,
  Active or Inactive, saved with the rest of the form. Turning it off
  changes the flag and nothing else: nobody's account is touched.
- A registered delegate is made a trainee of the organisation as well as
  the site (`_join_organisation` and `_join_site` in
  `backend/app/users/register.py`), so almost every delegate belongs to
  two org_units. Somebody added through the user form is made `staff` at
  an organisation and `trainee` at anything inside one
  (`capacity_at` in `backend/app/users/membership.py`), whatever their
  profession, so a delegate a teaching admin placed at the organisation
  too reads as staff there.
- Deactivating an account (`deactivate_account` in
  `backend/app/users/activation.py`) sets `is_active` false, sends the
  closure email, and starts the clock on the 3.5 years EoEETA keeps
  records after closure.

- [x] Settle with Mark, before anything is built:
      1. **Who counts as belonging elsewhere.** Decided with Mark on
         2026-10-17: where the admin pages show somebody. An
         organisation's page lists only its `staff` members (the filter
         in `OrganisationAdminPage.tsx`), and a site's page lists
         everybody there. So a person is spared when they are on any
         other site's list, or on any organisation's staff list, this
         site's own organisation included. The `trainee` membership of
         the organisation that registering writes appears on no list,
         and is not counted. Somebody a teaching admin added to the
         organisation's staff list, through the organisation page or the
         user form, is on that list and is spared, which is what the
         admin would expect from what they can see. The modal says how
         many accounts will be deactivated, and names nobody: at a site
         of any size the list would be too long to read.
      2. **The switch.** Decided by Mark on 2026-10-17: remove the "Site
         status" switch. Deactivating is made prominent instead: red, a
         button, a confirm modal, and it deactivates the accounts of
         people with no second org_unit.
      3. **Reactivating.** Not discussed; the recommendation is taken.
         A deactivated site can be made active again from the same card,
         and the accounts it deactivated are reactivated one by one by
         an admin, not brought back in bulk. Bulk would need a record of
         which accounts the site closed: a table, one row per account.
      4. **Who may.** Decided: a teaching admin, for a site of their own
         organisation, and a superadmin. The route checks the caller
         with `require_editable`, as the delete route does now.
      5. **Emails.** Decided: each account deactivated is sent the
         closure email, as deactivating it by hand does.
      6. **A deactivated site.** Decided, and called "deactivated" on
         every page, not "inactive": it is offered for no further
         module registration, so its clinical lead's address is refused
         at registration, and nobody can be added to it, through the
         site page, the user form or the API. Past results stay, since
         they are kept.

- [x] Stop a teaching admin deleting a site, overturning Phase 2: the
      delete route goes back to `manage_users` only, the "Delete site"
      action is drawn only for them, and `TestDeletingASite` is turned
      round. Its own pull request, so the reversal reads on its own.
      Decided by Mark on 2026-10-17: #2035 stays as it is, and its
      description now says this later pull request will undo it.
      Mark, 2026-10-17: no branch already in the stack is changed for
      this, #2035 included. The work goes in new pull requests on top.
      Built. The route is back on `DEP_REQUIRE_MANAGE_USERS`, keeping
      `require_editable` and the refusal of an org_unit holding teaching
      results, whose message now says to deactivate it. The page draws
      the "Delete site" action for `manage_users` only. The unit tests
      that had a teaching admin delete now have a user manager do it,
      and a teaching admin is refused; the E2E journey checks a teaching
      admin is not offered it and the API answers 403.

- [x] Deactivate a site: a red button in a card of its own on the edit
      site page, and a confirm modal saying "Deactivating this site will
      also deactivate the accounts of anyone that does not belong to a
      second organisation or site", and how many accounts that is. The
      "Site status" switch goes. Then the route, the refusals at
      registration and on adding anybody, their tests, and an E2E
      journey, in `tests/teaching-admin/`, asked for by Mark on
      2026-10-17: a teaching admin deactivates a site, its delegates with
      nowhere else are deactivated and emailed, one also on another
      site is not, its lead's address is refused at registration, and
      nobody can be added to it.
      Built in two pull requests. The first is the backend:
      `app/org_units/deactivation.py` works out the accounts and closes
      them with `deactivate_account`, so each is checked against the
      caller's reach and emailed as one closed by hand is. The routes are
      `GET /api/org-units/{id}/deactivation`, the count for the modal,
      and `POST /api/org-units/{id}/deactivate`. `PATCH .../active` now
      refuses to switch a site off, 409, and still switches one back on;
      reactivating brings no account back. Adding anybody is refused in
      `add_member`, `settle_membership` (only for a site they are not
      already at) and `create_account`, and `clinical_lead_site` leaves
      out a deactivated site, so its lead admits nobody. A membership of
      another site that is itself deactivated does not count as
      belonging there. Only the site's own members are considered, not
      those of anything inside it.
      The second is the page. The "Site status" switch is gone from the
      edit site page; below the form, an `ActionCard` titled "Deactivate
      site" has a red button (a new `buttonDestructive` option on
      `ActionCard`, and `destructive` on `ActionCardButton`, the name
      `ConfirmModal` already uses), and a deactivated site shows a
      "Reactivate site" card instead. The modal asks for the count as it
      opens and says "N accounts will be deactivated", naming nobody.
      The site page and the organisation's sites table call it
      "Deactivated" (an `inactiveLabel` on `ActiveStatusBadge`, which
      users, patients and modules still show as "Inactive"), and the site
      page offers no "Add staff" on a deactivated site. The journey is
      `tests/teaching-admin/deactivating-a-site.spec.ts`.
      Found while building it: `ConfirmModal` gave its dialog no
      accessible name, so a screen reader announced an unnamed dialog.
      Fixed afterwards, at Mark's request on 2026-10-17, for every
      confirm modal: the title sits inside Mantine's `Modal.Title`, drawn
      as a plain wrapper round our own `Heading`, so the dialog is named
      by it through `aria-labelledby`. The journey now finds the modal
      by that name.

- [x] A guide for teaching admins, asked for by Mark on 2026-10-17:
      `frontend/src/guides/content/deactivate-a-site.md`, registered in
      `src/guides/registry.ts` for teaching admins beside "Add a delegate
      by hand". It says how (the site's edit page, the red button, the
      modal) and what it does: whose accounts are deactivated and who is
      spared, that each is emailed, that the site takes no more
      registrations and nobody can be added to it, that results are
      kept, and how to make it active again. Its links are checked by
      `links.test.ts`, as every guide's are. Built, without screenshots, which the
      other guides have; `tests/guides/guides.spec.ts` now lists it among
      a teaching admin's guides.

## Phase 16: Every certificate copy reaches the clinical lead

Raised by Mark on 2026-10-17. `send_email` lets one address receive only
ten emails an hour (`_EMAIL_MAX_PER_WINDOW` in
`backend/app/email_send.py`). Each delegate's own certificate goes to
their own address, so a cohort passing together is fine. But every pass
also sends a copy to each clinical lead, and all of those land on the
lead's one address. If 100 delegates pass in an hour, the lead gets 10
copies, and since the fix in Phase 5 the other 90 are logged and
dropped, never retried. Mark chose to let the lead's copies through
rather than send a digest.

- [x] Add a keyword-only `rate_limited: bool = True` to `send_email` in
      `backend/app/email_send.py`. When it is false, skip
      `_check_rate_limit` and `_record_send`. Every other rule still
      applies: the allow-list (`EmailNotAllowedError`), dry run, and
      error handling. The default stays true, so no existing caller
      changes, and leaving the limit off is something a caller has to
      ask for by name. Say in the docstring why it is safe to lift: the
      limit stops somebody being mailed too often by something a person
      can trigger at will, such as a password reset or a resent invite.
      A lead's copy is sent by the system, once for each real pass, and
      nobody can request one.

- [x] Pass `rate_limited=False` from the lead's copy only, at the
      `_send_certificate_email` call for each lead in
      `_maybe_enqueue_certificate_emails`
      (`backend/app/features/teaching/router.py`). The delegate's own
      certificate keeps the limit. `_send_certificate_email` still
      catches `EmailRateLimitError`, because the delegate's call can
      still raise it. Update its docstring so it no longer gives "an
      address over its hourly allowance" as the usual example for a
      lead.

- [x] Tests, in `backend/app/email_send_test.py`: with
      `rate_limited=False`, an eleventh email to one address within the
      hour is sent, and it does not count against that address, so a
      limited send afterwards still gets its full ten. The allow-list
      still refuses an address that is not allowed. In
      `backend/tests/certificate_email_recipients_test.py`: eleven
      passes in an hour, all with one lead, send all eleven copies to
      the lead, while a delegate already at the limit is still refused.
      Check each test fails with the change taken out.

- [x] Leave the E2E journeys' per-learner site and lead alone (the
      struck-through step in Phase 10). They do not depend on the lead's
      limit any more, but taking them out is a separate change, and the
      learner's own address still has the limit.

      Built as written. The certificate tests run `send_email` for real,
      in dry run, writing each email to a folder, and count what reached
      each address. Each new test was run against the code with the
      change taken out, and failed.

## Phase 17: The self-hosted video in the respiratory module

Asked for by Mark on 2026-10-17, after he added a self-hosted video to
respiratory-teaching (#9, commit `a00d608`): a "Lungs in motion" slide
holding `<Video ref="lungs-video" duration={8} />`, with
`learning/lungs-video.mp4` beside `content.mdx`. The YouTube lecture
cannot be played in CI, so this is the first video the tests can watch
play from start to end.

What it changed, found by moving the pin and running the suite: every
journey that opens the module failed, because a learner saw no module at
all. A module whose `<Video ref>` has no servable upload is hidden
(`module_media_is_complete`). Servable means uploaded on the module's
admin media page, transcoded, and its captions read and saved by a
person (`captions_reviewed_at`; saving the captions is the acceptance,
with no separate tick). The same is true in App production: once #9
syncs, the respiratory module is hidden from learners until
`lungs-video` is uploaded and captioned for each organisation running
it, since uploads are per organisation.

Decided by Mark on 2026-10-17:

- [x] Let the superadmin upload a module's video for each organisation
      running it, decided by Mark on 2026-10-17. Found while building
      the steps below: a video is stored per organisation, but the
      upload, link, caption and poster routes take the organisation from
      `_get_user_org_id`, the caller's first membership, which the code
      itself calls a known bug. So a module running at two organisations
      could only ever have one filled, and a superadmin belonging to
      none could fill neither. The video card on the module's admin page
      (`/admin/teaching/modules/{module_id}`, `ModuleMediaCard`) gets a
      section for each organisation, headed "Videos for" its name, each
      with its own uploads, captions and poster. Two sites running one
      module is unlikely as Quill is built today; sections per
      organisation serve that too if it comes.

      Built as an optional `org_unit_id` query on the eight media routes
      rather than new routes with the organisation in the path: left
      out, a route behaves exactly as before, so the change is additive
      and there is nothing to retire later. `_media_org_unit_id` in the
      router checks the named organisation against
      `media_org_unit_ids` in `listing.py`: every organisation holding
      the module's content for a superadmin, only their own for anybody
      else, and 404 otherwise, so the answer does not say who holds a
      module. "Holding the content" is a `QuestionBankConfig` row, not a
      `QuestionBankOrgStatus` one: the status row is made when an admin
      first saves the module's settings, and the video comes before the
      module goes live. The organisations list on the page gains
      `may_upload_videos`, so the page shows a section only where the
      caller may act.

- [x] Make the end-to-end stack's content folder writable, decided by
      Mark on 2026-10-17. An upload saves the file beside the content,
      and `compose.ci.yml` mounted `.e2e-teaching` read-only. Test
      machines only: App production stores uploads in its bucket. The
      mount loses `:ro`, and `fetch-e2e-teaching.sh` opens the checkout
      to every user (`open_for_uploads`), as `prepare-e2e-mail.sh` does
      for the mail folder, because the backend runs as its own user and
      on a Linux runner could write to nothing the runner made. CI's
      Playwright container keeps its read-only mount: it only reads the
      answers, and the upload is written by the backend.

- [x] Test the real gate, not a way round it. A first attempt let a
      hand-placed `learning/{ref}.mp4` count as servable where content is
      on disk (`hand_placed_media_keys` in `media.py`); it kept the
      module visible but made the gate untestable, so it is undone.
      Instead the seed uploads `lungs-video.mp4` for "CI Teaching
      Hospital" through the same code the admin page's upload uses, and
      marks it transcoded and its captions reviewed, so every existing
      journey sees the module as before. Move `PINNED_SHA` in
      `.github/scripts/ci/fetch-e2e-teaching.sh` to `a00d608`.

      Built in `seed_videos` in `backend/scripts/seed_ci.py`, called by
      `seed_teaching` for each module it opens, so `seed_guides.py` gets
      the video too. The source is the module's own
      `learning/{ref}.mp4` (`resolve_module_dir`, not
      `resolve_local_bank`, which gives the assessment folder). Where a
      transcode or caption job is configured it also writes what the job
      would, the `-720p.mp4` rendition and a `.vtt`, and marks the
      captions as read, ready for the step below. For now both teaching
      organisations are seeded: CI Second Hospital is left without a
      video by the journey step further down, which also has to run
      before the tests that expect the module there, such as the leak
      test's "View module" count.

      The new "Lungs in motion" slide moved two specs.
      `teaching-journeys.spec.ts` reads where "Summary" is from the side
      list rather than hard-coding slide 5, and clicks Next again only
      while the slide has not changed: the YouTube player grows as it
      loads and moved Next from under the click, failing one run in
      three. `content.spec.ts` no longer counts a video download the
      browser cancels on leaving a slide as a failure; a missing file
      still answers 404 and is caught.

- [x] Turn the jobs on in the stack, so the gate asks what it asks in
      App production: `TEACHING_TRANSCODE_JOB` and `TEACHING_CAPTION_JOB`
      set in `compose.ci.yml` to names nothing runs, with the callback
      token set too. The test stands in for each job by doing what the
      job does on finishing: writing its output where the stack serves
      media from, and calling `/api/ci/teaching/transcode-complete` and
      `/api/ci/teaching/caption-complete` with the token. What exactly
      each callback expects on disk is checked before building.

      Checked: the transcode callback (`record_transcode` in
      `ci_media.py`) takes the files' names, sets a flag for each
      rendition named, stamps `transcoded_at`, and asks for captions
      when a `-720p.mp4` is among them. The caption callback sets
      `has_captions` only; `captions_reviewed_at` is a person saving the
      captions in the editor. Both callbacks address the upload by the
      organisation's media prefix, not its org_unit id. Locally the
      player then asks for `{asset}-720p.mp4` and `{asset}.vtt` beside
      the upload in `learning/`. Starting a job that does not exist is
      caught and logged, but first asks Google for credentials, so
      `GCE_METADATA_IP` and `GCE_METADATA_HOST` point at a closed port
      and the lookup is refused at once instead of waiting out its
      timeouts.

- [x] A journey at "CI Second Hospital", which has no upload, in
      `tests/teaching-admin/`:
      - a TA and a TD there see no module on the teaching pages, and
        its address does not open;
      - the superadmin uploads `lungs-video.mp4` on the module's media
        page; still hidden, awaiting the transcode;
      - the transcode job finishes; still hidden, the captions unread;
      - the caption job finishes, and the superadmin reads and saves
        the captions;
      - the TA and the TD now see the module, open it, and the video
        plays.

      Built as `tests/teaching-admin/video-gate.gate.spec.ts`, in a
      Playwright project of its own, `video-gate`, which the chromium,
      webkit and phone projects depend on: until it has run the module
      is hidden at CI Second Hospital, and the leak tests expect it
      there. It starts by deleting any upload it finds there, so a retry
      begins where the first try did. `seed_teaching` gains
      `with_videos`, false for the second organisation. The uploader is
      a new seeded `ci_operator`, a superadmin with the teaching admin's
      profession and a member of CI Teaching Hospital, as every teaching
      route asks; `admin` holds no `manage_teaching`. Its id comes from
      the module's organisations list, because the org_unit list is
      scoped to where the caller belongs.

      `fixtures/mediaJobs.ts` stands in for both jobs: it writes the
      `-720p.mp4` and `.vtt` beside the upload and calls each callback
      with the stack's token. So CI's Playwright container now mounts
      `.e2e-teaching` writable, reversing the note in the step above.

      Found while building: with no bucket, captions could be neither
      read nor saved, so wherever a caption job was configured without
      a bucket the gate could never open. `local_captions_file` in
      `media_uploads.py` keeps them at `{module}/learning/{asset}.vtt`,
      where the local video route already serves them from, and both
      caption routes use it when no bucket is set but content is on
      disk. With neither, saving is still refused with a 503.

      The journey checks the video reaches the delegate as the 720p
      rendition from Quill; playing it through is the next step's test.

- [x] Test the self-hosted player: on the "Lungs in motion" slide the
      video is granted through `/video-access`, fetched from Quill's own
      origin, plays, its clock moves, and it reaches its end, in every
      browser project. Written as
      `tests/taking-a-module/self-hosted-video.spec.ts`. It now waits
      for the `-720p.mp4` rendition rather than the original upload,
      because the stack runs the transcode gate and the seed writes the
      rendition as the job would. Passing in Chromium and WebKit with
      `just e2e` on macOS; CI's Linux browsers may not decode H.264,
      which the first CI run will show.

- [x] Follow the silent video's real path, decided by Mark on
      2026-10-18, and prove the jobs' identity in the test stack.
      Built in #2096 once #2100 ("Captions: a silent video needs none")
      and #2090 ("Security: callbacks accept the jobs' identity") were
      on `main`.

      `lungs-video.mp4` has no audio track, and since #2100 the caption
      job reports no speech for such a video (`/ci/teaching/no-speech`,
      setting `no_speech_found_at`), which `is_servable` counts the same
      as captions a person has checked. So `seed_videos` now sets
      `no_speech_found_at` instead of writing a `.vtt` and
      `captions_reviewed_at`. The gate journey checks the module is
      still hidden after the transcode and visible after the no-speech
      report, and that the card reads "Ready - no speech, so no captions
      needed"; it no longer opens the caption editor. Caption review is
      left to the backend tests, as showing it end to end would need a
      video with speech in respiratory-teaching.

      Since #2090 a job proves who it is with a Google-signed identity
      token, which nothing in the test stack can get, and every callback
      answered 503 there. So, in `testing` only,
      `TEACHING_JOB_CALLBACK_TEST_KEY_FILE` names a public key the token
      is checked against instead of Google's certificates; the settings
      refuse it in any other environment, as they refuse
      `EMAIL_CAPTURE_DIR`. Audience, issuer, expiry, `email_verified`
      and the caller list are checked as in App production.
      `.github/scripts/ci/prepare-e2e-job-key.sh` makes a new key pair
      for every run, never committed, and `fixtures/mediaJobs.ts` signs
      its reports with the private half using Node's own `crypto`. The
      shared callback token the stack used to set is gone.

## Phase 18: Two more checks in the settings journeys

Asked for by Mark on 2026-10-17, about #2050. Built in a new pull request
on top, leaving #2050 as it is.

- [x] Check the two-factor QR code, not only the link beside it. Story 27
      reads the secret from the `otpauth://` text and never looks at the
      QR code, drawn on a `<canvas>` by the `qrcode` package in
      `src/pages/TotpSetup.tsx`. Decode the canvas in the browser and
      check it holds the same `otpauth://` address as the text, so the
      code an app scans is the code the test signs in with.
      The canvas has no accessible name either, so a screen reader
      passes over it without a word: worth giving it one, such as "QR
      code for your authenticator app", and finding it by that.
      Built without a decoder: `e2e/fixtures/qr.ts` builds the code's grid
      with the same `qrcode` package from the link's text, and reads the
      centre of each cell off the canvas; they match only if the picture
      holds that link. The canvas is now `role="img"` with that name.

- [x] Turn Help improve Quill off and back on. Today's test turns it off
      and reloads. Add turning it on again, and check what the switch
      does, not only how it looks: with it off, moving between pages
      sends no `POST /api/analytics/page-views`; with it on again, it
      does. The choice is kept in the browser (`quill.pageViews.optOut`
      in `localStorage`), so a reload shows each state.
      Built: the test counts requests to the page-views route while
      opening the guides page, none with it off and some with it on.

- [x] A wrong two-factor code at sign-in, asked for by Mark on
      2026-10-17. The backend refuses one (`test_login_with_invalid_totp`),
      but no browser test types one. A person with two-factor on enters
      their password, then a code that is wrong: the login page says so,
      they stay on it, and a right code then signs them in.
      Built into story 27, just before its right code: the wrong one is
      a code for no step in the window either side, and the page says
      "Wrong code entered, please try entering your 6-digit authenticator
      code again".

- [x] Signing in after two-factor is turned off, asked for by Mark on
      2026-10-17. A person sets two-factor up as story 27 does, turns
      it off in settings (which asks for their password), signs out, and
      signs in again with their password alone: no code is asked for.
      Held, found while building it: the app has no way to turn
      two-factor off. The "Two-factor authentication (TOTP)" switch in
      `src/pages/Settings.tsx` is local state, off on every visit even
      when two-factor is on, and turning it off only greys out "Configure
      TOTP"; nothing calls `POST /api/auth/totp/disable`, which needs the
      password. Building it means the switch reading `totp_enabled` from
      `/api/auth/me`, and a modal asking for the password, which no
      existing component is. That is new UI, so it waits for Mark.
      Decided by Mark on 2026-10-17: the switch shows the account's real
      state, `totp_enabled` from `/api/auth/me`, on after setup and off
      otherwise; turning it off opens a modal asking for the password,
      which calls `POST /api/auth/totp/disable`. The modal is a new
      component, `PasswordConfirmModal`, built from `ConfirmModal` and
      `PasswordField`, with a story and a test. Then this journey.

      Built. `ConfirmModal` gains a `field` slot beneath its message,
      because its message is a paragraph and cannot hold an input.
      `PasswordConfirmModal` puts a `PasswordField` there, refuses an
      empty password before any request, and shows why the action
      failed under the field while staying open. In `Settings.tsx` the
      switch is on when `totp_enabled` is, or while the person is
      setting two-factor up. `TotpSetup.tsx` now reloads the account
      after a code verifies, so the switch is on when they come back
      without a page load. The journey in `settings.spec.ts` sets
      two-factor up, tries a wrong password (refused, still on), turns
      it off with the right one, checks that survives a reload, and
      signs in again with the password alone.

## Phase 19: Telling the operator when no clinical lead is told of a pass

Asked for by Mark on 2026-10-17. Since Phase 10 a pass emails the
clinical lead of the delegate's own site, and nobody else. Where that
site has no lead, the lead has no address, or the delegate belongs to no
site, nobody is told and nobody knows: the lead never gets the
certificate and nothing says so.

- [x] Email the operator when a pass reaches no clinical lead: a module
      that emails its coordinator on a pass (`email_coordinator_on_pass`)
      where no lead with an address was found. Sent to the addresses in
      `FEEDBACK_NOTIFY_EMAIL`, the named addresses the operator is
      already told of feedback at. Decided while building it rather than
      a new setting: it is the same person, the setting is already a
      runtime secret in every environment (`runtime-identities.tf`), and
      it is deliberately named addresses, not every operator account,
      since test operator accounts exist everywhere and should get no
      mail. Its description is widened to say so. Empty, as in
      development and the tests, sends nothing.

      A new template, `no_lead_told.html.j2`, saying which delegate (by
      username), which module, which organisation, which site or that
      they belong to none, and why nobody was told: no lead there, or
      the lead has no address. It links to the site's admin page, where
      a lead is named, or to the user's page when there is no site. No
      score and no certificate: the operator needs to know who to chase,
      not the result. Its preview is committed with `just email-preview`.

      Tests in `backend/tests/certificate_email_recipients_test.py`: a
      pass at a site with no lead, with a lead who has no address, and by
      a delegate at no site each send the notice to each configured
      address and nobody else; a pass that reaches a lead sends none; no
      configured address sends none; a module that emails no coordinator
      sends none.

      Built as described. The three cases that send a notice were run
      with the notice switched off, and failed.

## Phase 20: The stack repair works with pull requests queued

Decided by Mark on 2026-10-17: whatever fix is best, as it has to work.
GitHub twice dropped new pull requests from its record of the stack
today. `just stack-relink` repairs that by unstacking every GitHub stack
holding them and linking them again, but GitHub will not unstack a pull
request queued to merge, so with twenty queued the repair would have
failed. Adding the missing pull requests to the stack that already
holds the rest (`gh stack link <stack> <prs>`) worked.

- [x] `stack-relink.py --repair` first adds what is missing to the stack
      already holding the rest, when that stack holds them in order and
      nothing closed sits above them, and only unstacks and relinks
      when that cannot work. Either way it ends with `--check`.
      `stack-submit` runs the repair itself when the check fails, rather
      than only failing, so a dropped pull request is put back on the
      push that dropped it; a repair that still fails stops the push
      with the message it has today. Bats tests for each path, including
      a stack with queued pull requests.

      Built as `add_missing` in `scripts/stack-relink.py`. It applies
      only when the missing pull requests are all above the held ones,
      the held ones are one stack in order with nothing above the last,
      and nothing in it was closed without merging. It links with the
      stack's number first, the form that worked by hand. If GitHub then
      still does not hold them as one, the old unstack-and-link runs.
      `stack-submit` now runs `--repair` and `--check` again when its
      check fails. Six new bats tests; the two that say nothing was
      unstacked were checked to go red with the new path switched off.

## Phase 21: The delegate's journeys on a phone

Decided by Mark on 2026-10-19, before EoEETA goes live. A delegate is
the person most likely to be on a phone: the registration invite arrives
by email, and many will open it on their phone and carry on there. At a
phone's width Quill is laid out differently, with the menu behind the
hamburger, slides moved by swiping, tables stacked and button pairs full
width, and the Chromium and WebKit projects test none of that: they run
at desktop width. The `phone` project (a Pixel 7) runs only files named
`*.phone.spec.ts`, and there is one, `edges/taking-a-module.phone.spec.ts`
(Phase 9, story 7). Admin journeys stay at desktop width, where admin
work is done: running them on a phone would add minutes to every CI run
and test something nobody does.

- [x] Trial run first, to know the cost before writing anything: run
      `getting-in/`, `taking-a-module/` and `settings/` in the `phone`
      project once, locally, with the project's `testMatch` widened for
      the run only. Run on 2026-10-19: 42 passed as they are, 5 failed,
      and 8 did not run because they follow a failure in a serial group.
      No failure was a phone bug in the app; each was a test not
      reaching something laid out differently at a phone's width:
      - three read the slide list from the side panel
        (`complementary`), which on a phone is in the menu drawer behind
        the hamburger (`TeachingLayout`'s `drawerContent`);
      - two counted three "Log in" links on the public site, where at a
        phone's width the header's own is hidden and two show.

      So the steps first written here change. Registering, signing in
      with and without two-factor, the forgotten password and settings
      already pass at a phone's width, so separate phone copies of them
      would repeat tests that work. The phone project runs the
      delegate's folders instead, and the five failures get a phone
      path. Swiping is the one thing no test does, so it stays a new
      spec.

- [x] The phone project runs the delegate's folders: `getting-in/`,
      `taking-a-module/` and `settings/`, as well as every
      `*.phone.spec.ts`, in `playwright.config.ts`. A fixture,
      `fixtures/phone.ts`, reaches what the width moves: `slideList`
      hands back the slide list, the side panel at desktop width or the
      menu drawer, opened first, on a phone; `closeSlideList` closes the
      drawer with the hamburger, which reads "Close navigation" while it
      is open (Escape does not close it); `atPhoneWidth` says which.
      The public site test counts the "Log in" links the width shows:
      three at desktop width, two on a phone.

      Fixing the first failures let the rest of the serial groups run,
      and two more tables turned out to be cards at a phone's width,
      with no table role: results by question, in
      `checkResultsByQuestion` (`fixtures/assessment.ts`), and the
      dashboard's "My history". Each gets a phone path that checks the
      same things: each answer given and a count of the outcome badges,
      and a card per attempt by its "Result:" line, opened by tapping
      it. 55 pass in the phone project, and the specs touched still pass
      at desktop width. Once, with the whole phone project running at
      the laptop's full width of workers, the existing
      `edges/taking-a-module.phone.spec.ts` stalled on a click for its
      whole two minutes; alone it passed three times out of three, and
      CI runs two workers. If CI shows it again, that is the next
      thing to look at.

- [x] Reading the slides by swiping, as
      `taking-a-module/slides.phone.spec.ts`: swipe forward through
      every slide and back one, and see each slide's heading.
      `SlideReader` reads a touch starting and ending on the slide
      area, so the swipe is those two events, dispatched with a touch
      at a start and an end point, as a finger makes them.

      Built. On a slide that plays a video a swipe changes nothing, by
      design, so a swipe meant for the player cannot carry the learner
      off it; the test checks that and taps Next there. The touch start
      and end are sent a moment apart, as a finger sends them:
      `SlideReader` keeps where the touch started in state, and sent in
      the same instant the end arrived before it was kept, so nothing
      moved. Passing alone four times, and with the whole phone project,
      56.

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
