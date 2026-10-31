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
there, before anything is stored or routed.

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

- [ ] Add `landing_view` to the `passport` table in
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

- [ ] Return `landing_view` on the passport in `PassportDetail`
      (`backend/app/features/passport/schemas.py`) and accept it on the
      route that saves the holder's frameworks, or a sibling `PATCH` if
      that route writes to the repository. Additive only: a client that
      does not send it changes nothing, and one that does not read it
      sees the field ignored. Refuse an unknown value with 422.

- [ ] Tests beside each module: the default on a new and an existing
      passport, saving each value, refusing an unknown one, and that
      changing it writes no commit to the repository.

- [ ] Add `landing_view` to `Passport` in
      `frontend/src/lib/passport/types.ts`, optional, read as
      `by_competency` when absent so an older response still lands
      somewhere sensible.

## Phase 3: One competency's page

- [ ] Add `PassportCompetencyPage` at `/passport/competencies/:competencyId`,
      exported from `pages/passport/passportChunk.ts` and routed with
      `lazyFrom(loadPassport, "PassportCompetencyPage")`. It fetches and
      renders `PassportCompetencyDetail` from Phase 1, reading through
      `GET /passport/{passport_id}/competencies/{competency_id}` and the
      existing logbook fetch. No new backend route unless one of them
      cannot answer for a single competency.

- [ ] Wire the buttons: **Ask for a sign-off** opens the existing request
      flow with this competency already chosen, and **Add an entry**
      opens the logbook entry form the same way. Each sign-off opens its
      existing sign-off page, and each entry opens
      `/passport/logbook/:competencyId/:stem`.

- [ ] Give the Passport side navigation entry a child link for this
      page, shown only while it is open, in `SideNavContent.tsx`, as
      `.claude/rules/pages.md` requires. `navCoverage.test.tsx` checks it.

## Phase 4: The landing page chooses its view

- [ ] In `PassportPage.tsx`, read `landing_view` and render one of:

      - **By competency** - `PassportByCompetency` from Phase 1, given the
        holder's frameworks and `PassportDetail.competencies`, each row
        opening `/passport/competencies/:competencyId`.

      - **By record** - the page exactly as it is now: the six cards,
        then `PassportRecordTable`.

      The warnings above both (the entitlement warning, and "Choose the
      frameworks you work to") stay above whichever view is chosen. With
      no frameworks chosen, By competency has no tables to show, and the
      warning is the whole page apart from the cards.

- [ ] The loading skeleton follows the view, so the page settles rather
      than changes shape, as the existing comment on the skeleton asks.

- [ ] Add the switch to `PassportFrameworksCard`: a segmented control
      labelled "Passport home page", with "By competency" and "By
      record". It saves on change, as the frameworks field does. It stays
      enabled on a read-only passport, because the choice changes how the
      record is shown and never the record.

## Phase 5: Guides and accessibility

- [ ] Re-take the pictures that show the landing page:
      `start-your-passport/passport.png`, and any other passport guide
      that opens on `/passport`. Their seeded holders get the new default
      without any change to `seed_guides.py`.

- [ ] Update the passport guides' wording where they say "choose
      **Passport**, then **Open logbook**" and the like, since the new
      view has no such cards. Add a short section to "Start your
      passport" on the two views and where to switch between them.

- [ ] This changes a layout, so name which journeys in
      `docs/docs/frontend/accessibility/journeys.md` pass through the
      passport landing page, and add them to "Not yet run" in
      `testing-log.md`.

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
