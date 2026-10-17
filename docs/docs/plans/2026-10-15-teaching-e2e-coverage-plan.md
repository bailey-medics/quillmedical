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

- [x] 1. A superuser logs in. In `teaching-admin/sign-in.spec.ts`, with
      item 2. Found on the way: the seeded `admin` had the `superadmin`
      platform role and no profession, so no competencies, and the admin
      area was a 404 to them. A real operator is given
      `superadmin_profession`, as `seed_guides.py` gives `guide_operator`,
      so `seed_ci.py` now does the same.
- [x] 2. A teaching admin logs in, lands on teaching, opens admin, and is
      shown a 404 on the operator's feedback page.
- [x] 3. A superuser creates an admin account for someone else: a teaching
      admin at "CI Teaching Hospital". Items 3 to 9 are in
      `teaching-admin/accounts.spec.ts`.
- [x] 4. A teaching admin creates an admin account for someone else.
- [x] 5. A teaching admin creates a teaching delegate account, setting
     the organisation, site, practice and enrolment. Checked afterwards on
     the delegate's page at the site: taking modules is switched on there,
     and the module is ticked.
- [x] 6. A teaching admin sends a join invite to the new user, and the
     link in the email sets a password the new user then signs in with,
     in a browser of their own.
- [x] 7. A teaching admin deactivates an account, and that account can
     no longer log in: the login form is answered 400.
- [x] 8. A teaching admin changes a user's name and email through the
     edit form, read back from the API.
- [x] 9. A teaching admin cannot move a teaching delegate to an
     organisation or site the admin is not a member of. Neither is offered
     in the form, and a forged `PATCH /api/users/{id}` naming either is
     refused, with the delegate's places unchanged afterwards.

      Items 6 to 9 make the account they act on through the API
      (`e2e/fixtures/api.ts`), so each tests its own action rather than
      the user form again. Tables are paged at ten rows, and each run adds
      accounts, so rows are found by searching (`e2e/fixtures/tables.ts`).
- [ ] 10. A teaching admin cannot add a new organisation.
- [ ] 11. A teaching admin can add a new site.
- [ ] 12. A teaching admin cannot change the details of their
      organisation on its page (`/admin/organisations/{id}`).
- [ ] 13. A teaching admin can add staff on the organisation page.
- [ ] 14. A teaching admin can remove staff on the organisation page.
- [ ] 15. A teaching admin can add a site on the organisation page.
- [ ] 16. A teaching admin can remove a site on the organisation page,
      through the warning modal (needs Phase 2).
- [ ] 17. A teaching admin can edit a site on its page
      (`/admin/sites/{id}`).
- [ ] 18. A teaching admin can add staff on the site page.
- [ ] 19. A teaching admin can remove staff on the site page.
- [ ] 20. Clicking a user on the site page opens that user and you can enable and disable competencies at that `practice`
- [ ] 21. Clicking a user on the site page opens that user and you can enable and disable reaching at that `practice`
- [ ] 22. as a TA, on this page https://app.quill-medical.com/admin/teaching, I can only see the`All delegates` card
- [ ] 23. as a TA, I should be able to see this page https://app.quill-medical.com/admin/teaching/all-delegates and see the total number of delegates,number passed,1st pass success rate, and a table of users with best assessment scores with dates.

## Phase 4: Teaching delegate journeys

Specs under `frontend/e2e/tests/teaching-delegate/`. This list is still
being written.

- [ ] 1. A delegate lands on the public pages.

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
- **One account per browser project** - Chromium and WebKit run the same
  specs at the same time against one database. Journeys that create,
  edit or deactivate accounts would collide if both used one admin, so
  each browser gets its own, as the existing `exam_*` and `practice_*`
  accounts do.
