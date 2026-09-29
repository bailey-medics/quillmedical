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
      is long. Replaced in Phase 4 by a "Grant competency" button and
      modal.

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

## Phase 4: Tighten the member page after first use

Changes from trying the page, made on the working tree above the stack.

- [x] **"Their user account" is a button, top right.** An `IconTextButton`
      with a person icon, beside the `PageHeader` in a
      `<Group justify="space-between">`, as the list pages place their
      header action. `IconTextButton` gains a `user` icon for it. The
      `Group` was replaced in Phase 5, when it turned out to drop the
      button to the left whenever it wrapped.

- [x] **The "Back to" link goes.** The side navigation already names the
      organisation or site above the member, so the link repeated it. With
      it goes the page's `backTo` prop: the page no longer needs to know
      which kind of org_unit it was opened from.

- [x] **The table of held competencies loses its heading and helper
      text.** The column header "May practise here" says what the switches
      do, and the page header already names the person and the place.

- [x] **"Other competencies" becomes a "Grant competency" button that
      opens a modal.** Four shapes were weighed: a select and button above
      the table; a header button opening a modal; an inline "add row" at
      the foot of the table; and one table of every competency with a
      held filter. The modal was chosen. Granting applies everywhere the
      person works, so it wants a confirm step anyway, and a modal makes
      that step the form itself rather than a select followed by a
      confirm. It also keeps a change that reaches every place visually
      apart from the switches, which reach only this one: mixing the two
      is what made the old card confusing. The inline row was rejected
      because no table here edits inline and it fights paging and search;
      the single table because it lists the whole catalogue by default and
      buries the few rows that matter.

      A `GrantCompetencyModal` in `components/member-practice/`, composed
      from Mantine's `Modal` (as `NewMessageModal` uses it), `Heading`,
      `SelectField` (searchable), `BodyText` and `ButtonPair`. It lists the
      active competencies the person does not hold, says the grant applies
      everywhere they work and authorises it here, and grants on accept.
      The "Grant competency" `AddButton` sits top right of the table card,
      only when `may_grant` is true. The "Grant" button on a row in
      "Authorised here but not held" opens the same modal with that
      competency chosen, so there is one grant flow rather than two, and
      the separate grant confirm goes.

- [x] **No success messages on this page.** The switch shows its own new
      state, so "Authorised" and "Withdrawn" only repeated it, and a
      granted competency appears in the table switched on, so "Granted and
      authorised" did the same. Failures are still said.

- [x] **`IconTextButton` keeps its icon one size at every width.** Its
      icon shrank from 20px to 16px below the sm breakpoint while the
      button itself did not, so the person icon on "Their user account"
      looked like it was shrinking. It now passes `fixed` to `Icon`, as a
      control whose height does not change should. This applies to every
      `IconTextButton` in the app, not only this page.

## Phase 5: Page header actions that stay right when they wrap

Found on the member page and true of every page with a header action: on
a narrow screen the action wrapped under the title and fell to the left.
The pages laid the two out in a `<Group justify="space-between">`, and
`space-between` only spreads items that share a line, so a wrapped item,
alone on its line, sat at the start.

- [x] **`PageHeader` gains an `action` slot.** The row is a wrapping flex
      row in `PageHeader.module.css`, and the action's wrapper has
      `margin-inline-start: auto`, which pushes it right on the title's
      line and on a line of its own alike. `actionAlign` is `end` by
      default, sitting a button on the title's baseline as the pages did,
      or `center` for something shorter than the title, as the passport's
      inbox button and the admin page's role badge were. With no action,
      `PageHeader` renders exactly as before. New stories show an action,
      an action wrapped at phone width, and a centred one.

- [x] **Every page moves onto it**: `Messages`, the users, patients,
      organisations and sites admin lists, the member practice page, the
      passport page, `Admin` and `SyncResultsPanel`. None keeps a hand-built
      header `Group`.

- [x] **The guidance names the prop.** The page-header line in
      `.github/instructions/components.instructions.md` and its copy in
      `.claude/rules/components.md` now point at `action` rather than the
      `Group`, and say why.

- [ ] **Run the Storybook tests over the new `PageHeader` stories.** The
      unit tests, typecheck and lint pass, but the three new stories have
      not had their axe checks, light and dark. `just sbt`, not alongside
      `just e2e`.

- [ ] **Land Phase 5 as its own branch in the stack**, not folded into
      the member page's branch. It changes the header of nine pages across
      the app, which a reviewer of the member page would not expect to
      find there, and it stands on its own: nothing in it depends on the
      member page. Phase 4's changes belong to the member page's branch,
      except the end-to-end test's grant step, which belongs to the wiring
      branch that owns that test.

## Phase 6: A table's own action sits with its search and filter

The "Grant competency" button sat on a line of its own above the table,
with the table's search and filter on the next line down: two rows of
controls for one table. `DataTableControlled` built its search and filter
row itself and gave a page no way to add to it.

- [x] **`DataTableControlled` gains an `action` prop**, drawn first in the
      controls row, before search and filter. Tables without one are
      unchanged. A new story shows it, and another at 320px shows the row
      wrapping.

- [x] **The controls row may wrap.** `DataTable` fixed the row at exactly
      42px, so an action, an opened search (220px) and the filter would
      overflow a phone's width. It is now at least 42px, and wraps with
      each line still right-aligned. Wrapping was chosen over shortening
      the button to its icon on phones, because "+" alone does not say
      what it adds. Every table's controls row changes in the same way,
      but only a row too wide for its screen looks any different.

- [x] **The member page passes "Grant competency" as the table's
      action**, and loses its separate button row.

- [x] **The guidance names the prop**, beside the page-header line in the
      component rules.

## Findings

Things learnt while building that are not steps, but would cost time to
rediscover.

- **The dev server can keep serving a file's old version after a stack
  command.** Landing a branch with the `just stack-*` recipes briefly
  checks out other branches, so files new to this stack disappear from
  the worktree and come back. Vite in the `quill_frontend` container,
  whose watcher runs over a Docker bind mount, then stopped following
  `MemberPracticePage.tsx`: later edits reached the container but not the
  browser, and touching the file did not help. Restarting the container
  (`docker restart quill_frontend`) did. There is no `just` recipe for
  that yet.

- **End-to-end locators on these pages need three allowances.** A member
  seeded without a full name appears twice in their staff table row, since
  the name column falls back to the username, so click the row, not a
  cell. The navigation drawer has `role="dialog"`, so a modal is found by
  its text, not by role alone. A Mantine switch's input is visually
  hidden, so a forced click on it does nothing; click its track, the
  `label` whose `for` names the input.

- **A `Group` with `justify="space-between"` is not a header layout.** It
  looked right on every desktop screen, which is why nine pages used it,
  and was wrong on every phone. Phase 5 has the fix; the finding is that
  the pattern had been written into the component guidance, so it spread.

## Open questions

- **May somebody authorise their own practice?** The existing route allows
  it. The self-grant rule suggests not, but a ward manager recording their
  own authorisation at their own ward is ordinary. Leave as is unless you
  say otherwise.
- **Should a place be able to offer only some competencies?** Today every
  competency in the catalogue can be authorised anywhere that can hold
  competencies. Out of scope here, noted because the grant modal's list
  makes the catalogue's size visible.
