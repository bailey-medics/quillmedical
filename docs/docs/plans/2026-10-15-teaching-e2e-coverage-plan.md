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

## Phase 5: Every module of teaching content

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
