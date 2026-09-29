# Member practice page plan

The organisation and site admin pages carry a "Who may practise here" card
(`PractisingCompetenciesCard`). It asks for a person and a competency in two
dropdowns, then lists every authorisation at the place as a flat table. Three
things make it confusing:

- **The competency dropdown offers the whole catalogue**, not what the chosen
  person is qualified for. The API accepts an authorisation beyond somebody's
  ceiling on purpose, but it does nothing, so the card invites grants that
  look live and are not.
- **It lists people a second time.** The staff members table above it already
  lists who is at the place, and nothing on screen connects the two.
- **The two halves of the question live on different pages.** What somebody
  is qualified for is on `/admin/users/:id`, which is where clicking a staff
  member goes today. What they may do here is on the card.

The outcome: clicking a staff member on an organisation or site page opens a
page for **that person at that place**. It lists competencies with a "may
practise here" switch for each one they hold. A user manager who thinks the
person should hold a competency they lack can grant it and authorise it here
in one step, rather than leaving for the user page and coming back. The card
goes.

**Organisations and sites get exactly the same thing, built once.** Both are
org units and the backend routes already take any `unit_id`, so there is one
page, one set of components and one set of calls, mounted under both route
trees. Nothing is written twice for sites. The only difference between the
two is where the back link and breadcrumb point.

## The rules this keeps

Nothing in the authorisation model changes. The page is a different way in
to the same two facts.

- **Qualification and practice stay separate rows.** Granting a competency
  writes the person's ceiling; authorising it writes a
  `practising_competency` row at this place. The combined action does both,
  in one transaction, and says so.
- **Each half keeps its own competency.** Switching practice on and off needs
  `manage_practising_competencies`. Granting a qualification needs
  `manage_users`. Somebody holding only the first sees the page without the
  grant action; somebody holding only the second does not reach the page.
- **Nobody grants themselves a competency.** `update_user` refuses it, and the
  new grant route refuses it the same way, operators excepted. Whether
  somebody may authorise their own practice is an open question below.
- **Withdrawing practice never removes a qualification.** Removing a
  competency from somebody's ceiling stays on the user page, because it
  narrows every place at once and does not belong on a page about one of
  them.
- **Nothing is inherited.** The page is about exactly one place. A
  person's rows at other places are not shown or touched.

## Phase 1: Backend

- [x] **Add `GET /api/org-units/{unit_id}/members/{user_id}/practice`** in
      `backend/app/org_units/router.py`, gated on
      `manage_practising_competencies` and `_require_visible`. 404 when the
      user is not a member of the unit, so the page cannot be pointed at
      anybody in the system. It returns the person's name, their resolved
      ceiling (`get_final_competencies`), the competencies authorised here
      with `authorised_at` and `authorised_by`, and `may_grant`, true when
      the caller holds `manage_users`, shares an organisation with the
      person, is not the person, and the person is not an operator (the
      same checks `update_user` makes). The page draws from this one
      response.

- [x] **Add `POST /api/org-units/{unit_id}/members/{user_id}/grant-and-authorise`**,
      body `{ competency }`, gated on both `manage_users` and
      `manage_practising_competencies`, plus CSRF. It runs the same guards
      as `update_user` (shared organisation, no self-grant, no touching an
      operator), then adds the competency to the ceiling and writes the
      practising row, in one transaction. Adding to the ceiling means:
      remove it from `removed_competencies` if the base profession already
      carries it, otherwise append to `additional_competencies`. Additive
      rather than a wholesale write, so two admins granting different
      things at once cannot overwrite each other, which `PATCH /users`
      can. Idempotent, as the authorise route is.

- [x] **Refuse competencies outside the catalogue** on the new grant route.
      Found while building: the existing authorise route already refuses
      unknown and retired ids (`AuthorisePractisingCompetencyIn`), so it
      needed nothing. The withdraw route is left taking any string on
      purpose, so a stray row with a misspelt id can still be removed.

- [x] **Tests** in `backend/tests/test_member_practice_api.py`: non-member 404, each gate
      refusing on its own, self-grant refused, operator exempt, grant of a
      base competency that had been removed, idempotent repeat, and the
      practising row and ceiling both written or neither.

## Phase 2: The member practice page

- [x] **Routes** `/admin/organisations/:id/members/:userId` and
      `/admin/sites/:id/members/:userId` in `frontend/src/main.tsx`, both
      rendering one `MemberPracticePage` in `pages/admin/members/`, guarded
      by `<RequireCompetency competency="manage_practising_competencies">`.
      `safeForReload: true`, since it is a view with switches rather than a
      form mid-entry. The page takes the unit id from the route and a
      `backTo` of `organisations` or `sites` for the back link; it never
      branches on the unit's type otherwise.

- [x] **Reusable parts live in `components/member-practice/`**, not in the
      page: a `MemberPracticePanel` holding the three sections below, fed
      one `MemberPractice` response and the callbacks. The page is a thin
      loader around it, so organisations and sites share every line that
      draws or changes anything, and the panel gets its own story and
      test.

- [x] **Header**: the person's name, the place's name, and a link to their
      user page for everything else about them.

- [x] **Qualified**: every competency in their ceiling, each with a switch
      for "may practise here". Switching on authorises, switching off
      withdraws, with the existing confirm before a withdrawal because it
      has no undo. Departed from the plan: not grouped by catalogue file.
      The generated `competencies.json` carries only `id` and
      `display_name`, so the frontend cannot tell which file an entry came
      from, and the user page does not group them either. Sorted by name
      and searchable instead, which keeps a long ceiling readable without
      changing the generator.

- [x] **Authorised but not qualified**: rows at this place beyond their
      ceiling, marked as having no effect. Each offers withdraw, and grant
      when `may_grant` is true. This is how a lapsed qualification shows up
      without the row being deleted.

- [x] **Not qualified**: the rest of the catalogue, shown only when
      `may_grant` is true, each with a "Grant and authorise" action behind
      a confirm that says both things will happen and that the grant
      applies everywhere, not just here. Searchable, because the catalogue
      is long.

- [x] **Component and domain work**: a `MemberPractice` type and the two
      calls in `domains/orgUnit.ts`. Build from existing pieces (`BaseCard`,
      `DataTableControlled`, `ConfirmModal`, a Mantine `Switch`); any new
      reusable part goes in `components/` with a story and a test, and is
      shown for review before it is built, per the Storybook-first rule.
      Built as a composition of existing components (`BaseCard`,
      `DataTableControlled`, `SolidSwitch`, `AddButton`, `IconButton`,
      `ConfirmModal`), so no new atomic component was needed; the panel
      is reviewed in its pull request.

- [x] **A child link in the side navigation while the page is open**,
      found while building: `.claude/rules/pages.md` asks every new page
      for one. `SideNavContent` names the member by username under the
      organisation or site, as the Users entry names somebody, reading it
      from the same `memberPractice` call. A member who cannot be read
      leaves the place's own link standing.

## Phase 3: Wire it in and remove the card

- [x] **Staff table rows open the new page**, on both `OrganisationAdminPage`
      and `SiteAdminPage`, when the viewer holds
      `manage_practising_competencies`. Otherwise they keep going to the
      user page, so nobody loses a link they had. The site staff table had
      no row link at all, so there it gains one for those viewers only.

- [x] **Add an "Authorised here" column** to both staff tables, the count
      of live authorisations (within ceiling) for that person at this place,
      so the overview the card gave survives. Decided in Phase 1: an
      additive `authorised_here` field on each entry of the existing
      `GET /{unit_id}/members` response, counted within the member's
      ceiling, rather than one extra request per page. The organisation
      and site pages read their members from `GET /{unit_id}`, which
      builds its list the same way, so both carry it.

- [x] **Delete `PractisingCompetenciesCard`**, its story, its test and its
      barrel export, and remove it from both pages. The list route
      `GET /{unit_id}/practising-competencies` stays, since the API is
      additive-only and appointing to a position may want it.

- [x] **E2E**: extend the organisation admin spec to open a member, switch a
      competency on and off, and grant one they lacked. There was no
      organisation admin spec, and the CI seed had nobody who could
      administer an organisation, so this is a new
      `frontend/e2e/tests/member-practice.spec.ts` and `seed_ci.py` gains a
      `usermanager` (`teaching_manager`, with a `manage_users` row at the
      CI organisation) and one member per browser project, so chromium and
      webkit never change the same person.

- [x] **Accessibility journeys**: the side navigation gained a child link
      in Phase 2, but only on the new member page. None of the four
      journeys in `docs/docs/frontend/accessibility/journeys.md` passes
      through the organisation or site admin pages, so nothing is added to
      the "Not yet run" list in `testing-log.md`.

## Open questions

- **May somebody authorise their own practice?** The existing route allows
  it. The self-grant rule suggests not, but a ward manager recording their
  own authorisation at their own ward is ordinary. Leave as is unless you
  say otherwise.
- **Should a place be able to offer only some competencies?** Today every
  competency in the catalogue can be authorised anywhere that can hold
  competencies. Out of scope here, noted because the "Not qualified" list
  will make the catalogue's size visible.
