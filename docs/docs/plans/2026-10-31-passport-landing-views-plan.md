# Passport landing views plan

The passport landing page (`/passport`, `PassportPage.tsx`) is organised by
type of record: six `ActionCard`s (sign-offs, logbook, CPD, certificates,
reflections, download) above `PassportRecordTable`, every record newest
first. A holder has to open each section to learn where they stand on any
one competency. The oncology lead for Gloucestershire asked for the
opposite way in: a table of the competencies in each framework the holder
works to, each row opening that competency's sign-offs and logbook
entries, with a way to add to either from there.

Both views stay. The new one, **By competency**, becomes the default, and
the current one, **By record**, remains for anybody who prefers it. The
holder chooses between them with a switch in the "Clinician passport"
card in Settings (`PassportFrameworksCard`), beside their frameworks and
CPD date ranges. The new view is drawn in Storybook first and adjusted
there, before anything is stored or routed. Phase 6 then walks the whole
passport end to end, as the teaching coverage plan did for teaching:
nothing in `frontend/e2e/` follows a holder or an assessor today.

## Phase 1: Draw the new view in Storybook, and adjust it

- [x] Write fixtures in `frontend/src/components/passport/fixtures.ts`
      from the real framework files: the Gloucestershire radiotherapy
      record (`ghnft_radiotherapy_record.yaml`) and the SACT prescriber
      framework (`uk_sact_board_2023.yaml`). Between them, every state a
      row can be in: signed, waiting on an assessor, and not asked, each
      with and without logbook entries, and one competency signed off a
      scope at a time.

- [x] Build `CompetencyFrameworkTable` in `frontend/src/components/passport/`,
      with `.stories.tsx` and `.test.tsx`. One table for one framework,
      headed by the framework's name. One row per assessable item in that
      framework, whether or not the holder has any evidence for it yet,
      joined to the `CompetencyState` for that id from
      `PassportDetail.competencies`.

      Three columns: the competency, its sign-off state, and how many
      logbook entries it has. The states, agreed with Mark:

      - **Signed** - the latest sign-off has status `signed_off`.

      - **Waiting** - the latest has status `requested`, so an assessor
        has it.

      - **Not asked** - there is no sign-off. That covers two things the
        index reports differently: no `CompetencyState` at all, and one
        with evidence but no sign-off, which `_entry` in
        `backend/app/features/passport/index.py` reports as `requested`
        with `sign_off: null`. Found while building: so **Waiting** is
        `requested` with a `sign_off` behind it, and never `requested`
        alone.

      Built with the existing `SignOffStatusBadge`, so the two states it
      draws read "Signed off" and "Requested", as they do everywhere else
      in the passport, and "Not asked" is plain dimmed text. Whether the
      badges here should say "Signed" and "Waiting" instead is for the
      Phase 1 review.

      The logbook count sits in its own column, never inside the sign-off
      cell. `CompetencyRow` leaves the count off its sign-off lists
      because, beside a status, it reads as part of the sign-off; a
      separate column keeps the two apart.

      Below `sm` each row becomes a stacked card (name, state, count), as
      the other tables in the app already do. The whole row is the link.

      Built new rather than from `CompetencySummary`, which is a list of
      rows in a card rather than a `DataTable`, and lists only what the
      passport holds evidence for. It stays unused, and can be removed
      once this view is agreed.

      Originally: look first at reusing `CompetencySummary` and `CompetencyRow`,
      which already group competencies under their framework. Since the
      landing page stopped using it, `CompetencySummary` is exported from
      `components/passport/index.ts` and rendered nowhere. If it can
      become this table, or be replaced by it, do that rather than leave
      two components doing nearly the same job.

- [x] Build `PassportByCompetency`, the whole By competency view as a
      component that takes its data as props: a
      `CompetencyFrameworkTable` per framework, then `ActionCard`s for
      CPD, certificates, reflections and download, in that order.
      Download stays a card at the foot, because taking a copy of the
      whole passport is rare and does not earn the header.

      It takes props rather than fetching because the real
      `PassportPage` fetches its own data and so cannot be drawn in
      Storybook. In Phase 4 the page fetches and hands the data to this
      component, so the story and the page draw the same thing.

      Stories: desktop and phone, one framework and two, a holder with
      nothing recorded yet, and a read-only passport.

- [x] Build `PassportCompetencyDetail`, one competency's page as a
      component that takes props, with stories. Under the title (the
      competency's name, with its framework beneath), two sections:

      - **Sign-offs** - the latest sign-off and any previous ones, with
        an **Ask for a sign-off** button.

      - **Logbook** - the competency's entries, newest first, with an
        **Add an entry** button.

      Both buttons hidden on a read-only passport, as the other pages'
      add buttons are.

- [x] Add story variants for each "to confirm" decision below, so Mark
      can judge them by eye: with and without a "3 of 7 signed off" line
      under each framework, a declined sign-off shown as Not asked and as
      a fourth state, and a scoped competency as one row and as a row per
      scope.

- [x] **Stop here for review.** Mark looks at the stories, with the
      oncology lead if useful, and they are adjusted until agreed. Record
      each answer under Decisions, and remove the variants that lost.
      Nothing in Phase 2 onwards starts until this is done.

      Reviewed by Mark on 31 October 2026. The four answers are under
      Decisions. Adjusted along the way, in #2276: the By competency view
      stories show the Gloucestershire radiotherapy record alone, its
      Phone story was removed, and on `PassportCompetencyDetail` each add
      button now sits above the table it adds to.

- [x] Settle the components on the answers, and remove the variants that
      lost:

      - **No signed count** - remove `showSignedCount` from
        `CompetencyFrameworkTable` and `PassportByCompetency`, and the
        `SignedCountToDecide` and `WithSignedCount` stories.

      - **Declined reads as Not asked** - remove `showDeclined` and the
        `declined` standing from `lib/passport/competencyTable.ts`, and
        the `DeclinedToDecide` story. `standingOf` keeps mapping a
        declined sign-off to `not_asked`, so a later change to a fourth
        state is one branch in one function.

      - **A row for each site with a sign-off** - replace `rowPerScope`
        with the agreed behaviour as the only one: in `frameworkRows`, a
        scoped competency gets one row per scope whose sign-off is
        signed off or requested, with that scope's own logbook count.
        A scope that has only logbook entries, or a declined sign-off,
        gets no row of its own. When no scope has a sign-off, the
        competency is one row reading Not asked, as an unscoped one
        would. `ScopesToDecide` becomes a plain story of the agreed
        rows.

      - Update `competencyTable.test.ts` and the two components' tests
        to match.

      Done as described. `ScopesToDecide` is now `ScopedCompetency`, which
      shows a signed site, a requested site and a site with logbook
      entries only, which gets no row.

## Phase 2: Store which view a holder wants

- [x] Add `landing_view` to the `passport` table in
      `backend/app/features/passport/models.py`: a non-null `String`,
      server default `by_competency`, so every existing passport opens in
      the new view as well as every new one. The vocabulary is
      `PASSPORT_LANDING_VIEWS = ("by_competency", "by_record")`, checked
      by a `validate_passport_landing_view` function rather than a
      database enum, as `PLATFORM_ROLES` and the org unit types are, so a
      third view needs no migration. Then `just migrate "passport landing
      view"`, and read the generated `upgrade()` and `downgrade()`.

      It goes on the `passport` row, not in the passport repository. The
      repository is the holder's career record: it is exported, hashed
      and kept with its whole history, and how somebody likes their home
      page laid out is none of those things. The `passport` row already
      holds things about the record that are not the record, such as
      `head_commit`.

- [x] Return `landing_view` on the passport in `PassportDetail`
      (`backend/app/features/passport/schemas.py`) and accept it on the
      route that saves the holder's frameworks, or a sibling `PATCH` if
      that route writes to the repository. Additive only: a client that
      does not send it changes nothing, and one that does not read it
      sees the field ignored. Refuse an unknown value with 422.

      Built as `PUT /api/passport/{passport_id}/landing-view`, because
      `PUT /{passport_id}/frameworks` commits to the repository. A `PUT` of
      a sub-resource rather than a `PATCH`, to match its siblings
      `frameworks` and `appraisal-periods`. It sits behind
      `_require_holder`, not `_require_writer`, so a holder whose
      `passport_write` has lapsed can still choose, as Phase 4 asks. It
      does stay behind the passport feature gate like every write: a
      holder who belongs nowhere the passport is switched on can read
      their passport in whichever view they last chose, and cannot
      change it.

- [x] Tests beside each module: the default on a new and an existing
      passport, saving each value, refusing an unknown one, and that
      changing it writes no commit to the repository.

- [x] Add `landing_view` to `Passport` in
      `frontend/src/lib/passport/types.ts`, optional, read as
      `by_competency` when absent so an older response still lands
      somewhere sensible.

      `landingViewOf` in `lib/passport/landingView.ts` does the reading,
      and `setPassportLandingView` in `lib/passport/api.ts` saves it, for
      the switch in Phase 4.

## Phase 3: One competency's page

- [x] Add `PassportCompetencyPage` at `/passport/competencies/:competencyId`,
      exported from `pages/passport/passportChunk.ts` and routed with
      `lazyFrom(loadPassport, "PassportCompetencyPage")`. It fetches and
      renders `PassportCompetencyDetail` from Phase 1, reading through
      `GET /passport/{passport_id}/competencies/{competency_id}` and the
      existing logbook fetch. No new backend route unless one of them
      cannot answer for a single competency.

      Built with no new backend route, but not from
      `GET /competencies/{competency_id}`: that carries only the latest
      sign-off, and the page lists them all. It reads `fetchSignOffs`,
      every sign-off in the passport, kept to this competency, and
      `fetchLogbook` for the competency's entries. The name comes from
      the catalogue, so a competency with nothing recorded yet still
      has a page, and an id that is not an assessable competency is
      "not found" without fetching anything.

- [x] Wire the buttons: **Ask for a sign-off** opens the existing request
      flow with this competency already chosen, and **Add an entry**
      opens the logbook entry form the same way. Each sign-off opens its
      existing sign-off page, and each entry opens
      `/passport/logbook/:competencyId/:stem`.

      Both forms open in place of the competency's tables, under its
      name, and Cancel or a saved request returns to them. A refused
      request keeps the form open with the server's reason above it, as
      on the Sign-offs page.

- [x] Give the Passport side navigation entry a child link for this
      page, shown only while it is open, in `SideNavContent.tsx`, as
      `.claude/rules/pages.md` requires. `navCoverage.test.tsx` checks it.

      Done in `featureNavItems.ts`, where the passport's children are
      built: "Competency" hangs straight under Passport, because the
      passport page itself is the list of competencies.

## Phase 4: The landing page chooses its view

- [x] In `PassportPage.tsx`, read `landing_view` and render one of:

      - **By competency** - `PassportByCompetency` from Phase 1, given the
        holder's frameworks and `PassportDetail.competencies`, each row
        opening `/passport/competencies/:competencyId`.

      - **By record** - the page exactly as it is now: the six cards,
        then `PassportRecordTable`.

      The warnings above both (the entitlement warning, and "Choose the
      frameworks you work to") stay above whichever view is chosen. With
      no frameworks chosen, By competency has no tables to show, and the
      warning is the whole page apart from the cards.

      Built so. The records behind By record are fetched only in that
      view, so a holder on By competency is spared five requests whose
      answers it never shows.

- [x] The loading skeleton follows the view, so the page settles rather
      than changes shape, as the existing comment on the skeleton asks.

      Found while building: the view is not known until the passport
      arrives, because the choice comes with it, so the skeleton cannot
      follow it. It takes the default view's shape, a framework table
      above four cards, which is what nearly every holder sees. A holder
      who chose By record sees it settle into six cards instead.

- [x] Add the switch to `PassportFrameworksCard`: a segmented control
      labelled "Passport home page", with "By competency" and "By
      record". It saves on change, as the frameworks field does. It stays
      enabled on a read-only passport, because the choice changes how the
      record is shown and never the record.

      Departed from the plan: built with `RadioField` rather than a
      segmented control. There is no segmented control in
      `components/form/`, and the component rules ask for a new atomic
      component to be agreed before it is built. Two labelled radios
      read as plainly, and can be swapped for one later.

## Phase 5: Guides and accessibility

- [x] Re-take the pictures that show the landing page:
      `start-your-passport/passport.png`, and any other passport guide
      that opens on `/passport`. Their seeded holders get the new default
      without any change to `seed_guides.py`.

      `start-your-passport.spec.ts` was the only guide script that
      opened `/passport`. It now waits for the framework table, and a
      third picture, `start-your-passport/by-record.png`, shows the same
      passport By record: the script switches the holder to it in
      Settings and back again afterwards. Taken with `just
      guide-screenshots start-your-passport`.

- [x] Update the passport guides' wording where they say "choose
      **Passport**, then **Open logbook**" and the like, since the new
      view has no such cards. Add a short section to "Start your
      passport" on the two views and where to switch between them.

      The CPD, certificates, reflections and download guides were left
      as they were: those four cards are in both views. "Ask for a
      sign-off" and "Keep your logbook" now go straight to their pages,
      say how to get there By record, and say a competency's own page
      offers the same button with the competency already chosen.

- [x] This changes a layout, so name which journeys in
      `docs/docs/frontend/accessibility/journeys.md` pass through the
      passport landing page, and add them to "Not yet run" in
      `testing-log.md`.

      None of the four does: journey 4 is an assessor, who comes in from
      the inbox. So the landing page in both views, a competency's page
      and the Settings choice went into "Not yet run" as pages to check
      by themselves, as a guide page already is.

## Phase 6: End-to-end journeys for the passport

Asked for by Mark on 31 October 2026, after the landing views landed:
the passport should be walked the way the
[teaching E2E coverage plan](2026-10-15-teaching-e2e-coverage-plan.md)
walks teaching. Today the end-to-end suite touches the passport only to
prove teaching people cannot reach it (`tests/leaks/other-features.spec.ts`,
`tests/everyday/everyday.spec.ts`) and to draw one certificate page from
answers it fakes (`tests/pdf-pages.spec.ts`). Nothing signs in as a
holder, an assessor or a passport admin.

The patterns carry over from teaching, and each is reused rather than
built again:

- **Each journey makes the people it acts on**, through the API, named
  for the browser project and the time, so nothing is shared between
  tests, browsers or retries, and nothing has to be put back. Teaching
  found seeded people carried a failed run's state into the retry.
- **A refusal is checked at the API as well as on screen.** A hidden
  button proves nothing if the request behind it still succeeds.
- **Emails are read from the capture folder** (`fixtures/mail.ts`), and a
  person who is sent email is made fresh, because `send_email` refuses an
  eleventh email to one address in an hour.
- **User stories**, for a passport holder (PH), an assessor who has a
  Quill account (AS), an external assessor with no account yet (EA), a
  passport admin holding `manage_passport` (PA) and a passport clinical
  lead (PCL).

Specs under `frontend/e2e/tests/passport/`, run in the CI heavy tier
against `compose.ci.yml`, as `just e2e` does. Written in the order to
build them: the people first, then the holder's own record, then the
people who act on it, then what must not leak.

- [x] Give the fixtures passport people, in `frontend/e2e/fixtures/people.ts`.
      `seed_ci.py` already seeds "CI Passport Hospital" and "CI Passport
      Centre" with the passport feature on (`seed_other_feature_places`)
      and `ci_passport`, a `passport_delegate` holding a passport. Add a
      seeded passport admin there (`ci_passport_admin`, profession
      `passport_admin`), a member of the Centre, and `makeHolder(page,
      project)`, which signs in as that admin and makes a
      `passport_delegate` at the Centre with `passport_write` granted, as
      an admin would. `makeAssessor` makes a `passport_delegate` at the
      same Centre with no passport. Both go through `POST /api/users` as
      the passport admin, never the operator: decided by Mark on
      31 October 2026, below under Decisions. The route admits any scoped
      manager (`DEP_REQUIRE_MANAGE_PEOPLE`), and `manage_passport` may give
      `passport_delegate` and grant `passport_write`, so this is within
      what a real passport admin does. The holder's
      frameworks are set through `PUT /passport/{id}/frameworks`, to
      `clinical` and `ghnft_radiotherapy_record`, so both the general
      table and the Gloucestershire one are drawn.

      Built: `seed_passport_admin` in `seed_ci.py`, and
      `frontend/e2e/fixtures/passport.ts`. Found on the way: a sign-off
      request refuses an assessor address on a reserved name such as
      `.test`, as registration does, so passport people are given an
      `example.com` address (`passportEmailOf`). Also found: on a Linux
      host every end-to-end run after the first stopped before starting
      the stack, because the backend writes uploaded videos into
      `.e2e-teaching/` as its own user and `fetch-e2e-teaching.sh` then
      failed to `chmod` them. It now opens only what the caller owns,
      with a bats case for a file somebody else wrote.

### The holder's own record

`tests/passport/holding-a-passport.spec.ts`, each for a PH.

- [x] 1. As a PH with no passport, I want to choose my frameworks and
      create one, so that I can start recording.
      Tested: "Create my passport" is disabled until a framework is
      chosen, and afterwards the page shows a table for each framework.
- [x] 2. As a PH, I want my passport to open By competency, with a table
      for each framework I work to, so that I see where I stand on each
      competency at once.
      Tested: a row for every assessable item in the framework file, all
      "Not asked" on a new passport, and no Sign-offs or Logbook card.
- [x] 3. As a PH, I want to open a competency from its row and add a
      logbook entry there, so that I record a procedure against the
      competency I was looking at.
      Tested: the form opens with the competency chosen, the entry is
      saved, and back on the landing page the row's logbook count is 1.
- [x] 4. As a PH, I want to ask for a sign-off from a competency's page,
      naming an AS by email, so that an assessor I know can judge me.
      Tested: the row reads "Requested" afterwards, and the AS is sent the
      captured email.
- [x] 5. As a PH, I want to withdraw a request still waiting, so that I
      can take back one sent to the wrong person.
      Tested: the row goes back to "Not asked", and the AS's inbox no
      longer lists it.
- [x] 6. As a PH, I want to switch my passport to By record in Settings
      and back, so that I can see it the way I prefer.
      Tested: the landing page shows the six cards and the Records table
      after the switch, and the tables again after switching back. The
      choice is read back from `GET /passport/me`.
- [x] 7. As a PH, I want to change my frameworks in Settings, so that the
      passport offers what I work to.
      Tested: dropping a framework removes its table from the landing
      page and keeps the logbook entry made under it, which shows again
      when the framework is added back.
- [x] 8. As a PH, I want to record CPD against a date range I set, so that
      it totals over my appraisal year.
      Tested: a date range set in `/settings/cpd-date-ranges`, an
      activity added at `/passport/cpd`, and the total shown for the range.
- [x] 9. As a PH, I want to add a certificate with its file and open the
      file again, so that the evidence travels with the claim.
      Tested: a small PDF uploaded, the certificate listed, and the
      attachment downloads as the same bytes. `UPLOAD_SCAN_JOB` is unset
      in the stack, so nothing is scanned; say so in the test.
- [x] 10. As a PH, I want to write a reflection and read it back, so that
      I keep what I learned from a case.
- [x] 11. As a PH, I want to download my passport as Markdown, PDF and a
      zip, so that I can take it anywhere without Quill.
      Tested: each download arrives, of its type, and the zip holds the
      passport's files.
- [x] 12. As a PH, I want to ask a supervisor to confirm a logbook entry,
      so that the entry carries their name.
      Tested with the AS as supervisor: the AS opens it from their inbox
      at `/passport/logbook-confirmation/:id`, confirms, and the holder's
      entry shows who confirmed it.

      Built as written, with one correction: the email links to the
      supervisor's `/inbox`, not to the confirmation itself, so the test
      follows it there and opens the request from the list. Stories 1 to
      12 are in `tests/passport/holding-a-passport.spec.ts`.

### The people who act on it

`tests/passport/assessing.spec.ts`.

- [x] 13. As an AS, I want to see a request in my inbox and sign it off,
      so that the holder's record shows my judgement.
      Tested: the request is listed at `/inbox`, the sign-off form is
      filled and submitted, and the PH's row then reads "Signed off" with
      the AS's name on the sign-off page.
- [x] 14. As an AS, I want to decline a request, so that a holder not yet
      ready is told so.
      Tested: the PH's row reads "Not asked", as decided in Phase 1, and
      the declined sign-off is listed under "Declined" on the Sign-offs
      page with the AS's comment.
- [x] 15. As an EA, I want the invitation a request sends me to bring me
      into Quill to sign, so that a holder can be assessed by somebody
      from another hospital.
      Tested: the PH names an address with no account, the EA follows the
      captured invitation to `/passport/assessors/accept`, makes their
      account, and signs the sign-off. The PH's row then reads "Signed
      off".
- [x] 16. As Quill, I want a holder never to sign off their own request,
      so that every sign-off is somebody else's judgement.
      Tested: asking with the holder's own address is refused on screen,
      and a forged sign-off of their own request is refused at the API.

      Stories 13 to 16 are in `tests/passport/assessing.spec.ts`.

- [ ] Found while building story 14: an assessor has no way to decline
      on screen. `declineSignOff` is in `lib/passport/api.ts` and
      `POST /sign-offs/{id}/decline` works, but no page calls it, though
      `SignOffForm` tells an assessor to "Decline if it is not what you
      assessed". Story 14 declines through the API instead, and a test
      marked `test.fail()`, "an assessor is offered a way to decline on
      the sign-off page", fails the suite the day a Decline button
      appears, so the marker can come off. Building the button is a
      change to the assessor's page, not a test, and is Mark's to ask
      for.
- [x] 17. As a PA, I want to give `passport_write` to a member of my place,
      so that they can add to their passport.
      Tested: the member's passport offers "Add an entry" afterwards.
- [x] 18. As a PA, I want to be unable to give `passport_write` to
      somebody outside my places, or to myself, so that writing is given
      only where I run the passport.
      Tested: neither is offered on screen, and a forged grant is refused
      at the API.

      Departed from the plan: "or to myself" is not tested. A passport
      admin holds `passport_write` through the `passport_admin`
      profession already, so there is nothing to grant. Tested instead
      for the seeded teaching admin, at a hospital this passport admin
      runs nothing in: the forged `PATCH /api/users/{id}` is refused, and
      they are not on the passport admin's list. Their id is looked up as
      the operator, which reads and sets nothing up.

### Read-only, and the gates

`tests/passport/read-only.spec.ts`.

- [x] 19. As a PH whose `passport_write` has lapsed, I want to be told so
      on the way in, and still read and download everything, so that a
      lapse never locks me out of my own record.
      The grant's end date is moved back through the API, as
      `tests.competencies.lapse` does in the unit tests. Tested: the
      warning shows, a competency's page has no add buttons, a forged add
      is refused at the API, and the downloads still work.

      Departed from the plan: the passport admin withdraws the grant
      (`removed_competencies`) rather than its end date being moved back.
      The holder sees the same thing, "Your passport is read-only", and
      it is how a trust ends somebody's writing, where moving a date back
      would need the database. Stories 17 to 21 are in
      `tests/passport/running-and-read-only.spec.ts`.
- [x] 20. As a PH with a read-only passport, I want to change my home page
      view, so that how my record is shown is still mine to choose.
      Tested: the switch in Settings saves, as Phase 2 decided.
- [x] 21. As a PH taken off every place that has the passport, I want to
      still open my own passport, so that leaving a trust does not take my
      record with it.
      Tested: the landing page and a competency's page open, and adding
      is refused.

### What must not leak

`tests/passport/leaks.spec.ts`.

- [x] 22. As Quill, I want one holder unable to open another's passport, so
      that a record is read by its holder alone.
      Tested: `GET /passport/{id}` for another holder is a 404, and their
      sign-off and logbook addresses show the 404 page.
- [x] 23. As Quill, I want an AS to reach only the sign-off they were
      asked about, so that being an assessor opens nothing else of the
      holder's.
      Tested: the AS opens that sign-off and gets 404 for the holder's
      passport, logbook and reflections, by address and at the API.
- [x] 24. As Quill, I want a PA to see only the members of their own
      places, so that running the passport at one trust shows nothing of
      another.
      Tested against a second passport organisation, seeded beside the
      first as teaching's Phase 10 did: its members are not listed, and
      their pages and the API refuse.

      Built in `tests/passport/leaks.spec.ts`, with "CI Second Passport
      Hospital", its own passport admin and a member seeded beside the
      first. Departed from the plan: the refusals are checked at the API
      alone, not by address too, because every holder page opens the
      signed-in holder's own passport, so no address could show another
      holder's record. Each refusal has a control beside it, the holder
      or the passport admin reading the same thing with a 200, so a 404
      is the guard working and not a mistyped path.

### On a phone, and for everyone

- [ ] 25. As a PH on a phone, I want to open my passport, open a
      competency and add a logbook entry, so that I can record a procedure
      where I did it.
      A `*.phone.spec.ts`, run by the `phone` project, as teaching's Phase
      21 is. Tested: the framework tables become cards below `sm`, and the
      side navigation is behind the hamburger.
- [ ] 26. As Quill, I want every passport page to pass the axe scan, light
      and dark, so that the passport is usable by everybody.
      Run with `fixtures/axe.ts` on the landing page in both views, a
      competency's page, Sign-offs, Logbook, CPD, Certificates,
      Reflections, Download and the assessor's sign-off page, as teaching's
      Phase 11 scans each slide.

## Decisions

- **Storybook first** - the view is drawn from fixtures and agreed before
  any backend or routing work, because the layout is what the oncology
  lead will react to, and changing a story is cheaper than changing a
  page with its data and tests behind it.

- **Names: "By competency" and "By record"** - each names what its view
  is organised by, so the switch needs no explanation. "Curriculum" and
  "Portfolio" were considered, and dropped because "Curriculum" suggests
  a training programme the holder may not be on.

- **The new view is the default, for existing holders too** - Mark's
  choice. An existing holder who preferred the old page switches back
  once, in Settings.

- **CPD, reflections and certificates stay out of the tables** - none
  of them belongs to a single competency, so they keep their cards below
  the tables.

- **No "3 of 7 signed off" line under each framework** - Mark's
  choice at the Phase 1 review. `CompetencySummary` was deliberately
  built without totals or percentages, because a passport was not a fixed
  set of competencies and a denominator would invent one. Frameworks now
  make the set fixed for each table, so a count would have been
  defensible, but the earlier decision stands.

- **A declined or superseded latest sign-off reads as Not asked, for
  now** - Mark's choice at the Phase 1 review. `SignOffStatus` also has
  `declined` and `superseded`; the table reads the latest sign-off that
  is `signed_off` or `requested`, and shows **Not asked** when there is
  neither. A fourth "Declined" state may be revisited, and is kept to one
  function so that is cheap.

- **A competency signed off one site at a time lists each site with a
  sign-off** - Mark's choice at the Phase 1 review. One row per scope
  (`lib/passport/scopes.ts`) that is signed off or requested, and no row
  for a scope with nothing asked, because a Not asked row for every
  tumour site would bury the ones that matter. A scoped competency with
  no sign-off at any site is one Not asked row.

- **Badges read "Signed off" and "Requested", as elsewhere in the
  passport** - Mark's choice at the Phase 1 review, over "Signed" and
  "Waiting". `SignOffStatusBadge` is used unchanged, so a state reads the
  same on every passport page.

- **The passport admin sets up the end-to-end people, not the
  operator** - Mark, 31 October 2026: in real life the superadmin should
  do the least setting up and work possible, so the tests make holders
  and assessors as the seeded passport admin does in a trust. That also
  means every journey runs through the passport admin's own limits, and
  a change that pushed account making back onto the operator would fail
  the suite.
